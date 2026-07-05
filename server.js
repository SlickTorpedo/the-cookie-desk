// server.js — The Cookie Desk backend
//
// Copyright (C) 2026 SlickTorpedo
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or (at your
// option) any later version. It is distributed WITHOUT ANY WARRANTY. See the
// GNU AGPL <https://www.gnu.org/licenses/> for details.
//
// Proxies + normalizes the two upstream APIs so the frontend gets clean,
// same-origin JSON (no CORS headaches, no upstream rate-limit exposure).
//
//   GET /api/bazaar   -> { buyPrice, sellPrice, spread, updatedAt }
//   GET /api/history  -> { points: [{ t, v }, ...], updatedAt }
//   GET /api/health   -> { ok, cache: {...} }
//
// Node 18+ (built-in fetch). Run: `npm install && npm start`.

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const HYPIXEL_BAZAAR = "https://api.hypixel.net/skyblock/bazaar";
const COFLNET_HISTORY =
  "https://sky.coflnet.com/api/bazaar/BOOSTER_COOKIE/history/day";
const PRODUCT_ID = "BOOSTER_COOKIE";

// --- Tiny in-memory cache -------------------------------------------------
// Upstreams update ~once/minute and rate-limit aggressively; we serve every
// visitor from cache and only refetch when a TTL expires. One backend request
// per minute regardless of how many users are on the page.
function makeCache(ttlMs) {
  return { data: null, at: 0, ttl: ttlMs, inflight: null };
}
const bazaarCache = makeCache(30 * 1000); // 30s
const historyCache = makeCache(5 * 60 * 1000); // 5m

async function withCache(cache, fetcher) {
  const now = Date.now();
  if (cache.data && now - cache.at < cache.ttl) return cache.data;
  // De-dupe concurrent refreshes into a single upstream call.
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    try {
      const fresh = await fetcher();
      cache.data = fresh;
      cache.at = Date.now();
      return fresh;
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

// --- Upstream fetchers ----------------------------------------------------
async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "cookie-desk/1.0" },
    });
    if (!r.ok) throw new Error(`upstream ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBazaar() {
  const j = await fetchWithTimeout(HYPIXEL_BAZAAR);
  const q = j?.products?.[PRODUCT_ID]?.quick_status;
  if (!q) throw new Error("BOOSTER_COOKIE missing from bazaar payload");
  // Hypixel's naming: buyPrice = insta-buy (what you pay),
  // sellPrice = insta-sell (what you get). We pass both through as-is.
  const buyPrice = Number(q.buyPrice);
  const sellPrice = Number(q.sellPrice);
  return {
    buyPrice,
    sellPrice,
    spread: Number((buyPrice - sellPrice).toFixed(1)),
    updatedAt: Date.now(),
  };
}

async function fetchHistory() {
  const j = await fetchWithTimeout(COFLNET_HISTORY);
  const arr = Array.isArray(j) ? j : [];
  const points = arr
    .map((d) => {
      const t = new Date(d.timestamp ?? d.time ?? d.t).getTime();
      // Coflnet history rows expose sell/buy averages; prefer sell to match
      // the "insta-sell" default the UI shows.
      const v =
        d.sell ?? d.sellPrice ?? d.min ?? d.buy ?? d.buyPrice ?? d.avg;
      return { t, v: Number(v) };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) throw new Error("history too sparse");
  return { points, updatedAt: Date.now() };
}

// --- Routes ---------------------------------------------------------------
app.get("/api/bazaar", async (req, res) => {
  try {
    const data = await withCache(bazaarCache, fetchBazaar);
    res.set("Cache-Control", "public, max-age=15");
    res.json(data);
  } catch (err) {
    // Serve stale cache if we have any; otherwise surface the error.
    if (bazaarCache.data) {
      res.set("X-Served-Stale", "1");
      return res.json(bazaarCache.data);
    }
    res.status(502).json({ error: "bazaar_unavailable", detail: String(err.message || err) });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const data = await withCache(historyCache, fetchHistory);
    res.set("Cache-Control", "public, max-age=120");
    res.json(data);
  } catch (err) {
    if (historyCache.data) {
      res.set("X-Served-Stale", "1");
      return res.json(historyCache.data);
    }
    res.status(502).json({ error: "history_unavailable", detail: String(err.message || err) });
  }
});

app.get("/api/health", (req, res) => {
  const age = (c) => (c.at ? Date.now() - c.at : null);
  res.json({
    ok: true,
    cache: {
      bazaar: { cached: !!bazaarCache.data, ageMs: age(bazaarCache) },
      history: { cached: !!historyCache.data, ageMs: age(historyCache) },
    },
  });
});

// --- Serve the frontend ---------------------------------------------------
// Drop cookie-desk.html into ./public and it's served same-origin, so
// API_BASE in the frontend can stay "".
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Cookie Desk backend on http://localhost:${PORT}`);
  console.log(`  GET /api/bazaar   GET /api/history   GET /api/health`);
});