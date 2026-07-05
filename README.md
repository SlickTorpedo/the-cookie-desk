# The Cookie Desk

**Live at [thecookiedesk.com](https://thecookiedesk.com)**

A little converter for Hypixel SkyBlock that answers one question: **what is your money actually worth here, in either direction?**

Type in a pile of coins and see what it's worth in real dollars. Type in a dollar amount and see how many coins you'd end up with after buying gems and flipping cookies. Type in gems and see the coin value. There's also a live price chart for the Booster Cookie, since that's the item the whole thing hinges on.

I built this because every time I thought about spending money on gems, I wanted to know up front what I'd get for it and whether it was worth it — instead of guessing.

## How the conversion works

There's no official exchange rate between coins and real money. The bridge is the **Booster Cookie**:

```
USD  ──►  Gems  ──►  Booster Cookie  ──►  Bazaar  ──►  Coins
       store        325 gems each        sold for coins
```

Cookies are bought with gems (325 gems each, a fixed in-game price) and are the only gem-purchased item you can sell on the Bazaar. So the live Bazaar price of a cookie, combined with the store's gem-per-dollar rate, gives you a coins-per-dollar figure. Everything in the app is derived from that.

Because it's pinned to a live market price and the store's bundle pricing, the rate drifts constantly — treat every number as an estimate, not a fixed exchange rate.

## Features

- **Three converters** — coins → USD, USD → coins, gems → coins, each live.
- **Insta-sell vs. insta-buy toggle** — the Bazaar has a spread; pick which side you want the rate based on. Defaults to insta-sell (what you'd realistically get).
- **Creator code discount** — optional 5% off gem bundles, modeled as more gems per dollar.
- **Live 24-hour price chart** for the Booster Cookie, with hover tooltips.
- **No API key needed** — the Hypixel Bazaar endpoint is public.

## Running it

Requires Node 18+ (for built-in `fetch`).

```bash
npm install
npm start
```

Then open <http://localhost:3000>.

The Express server proxies and caches the two upstream APIs, then serves the frontend from `public/`, so everything runs same-origin with no CORS issues. The deployed version at [thecookiedesk.com](https://thecookiedesk.com) runs exactly this.

### Just the frontend

`public/index.html` is a standalone file. You can open it directly in a browser, but the converters need the backend routes to be live — without the server it'll sit on "Connecting."

## API

The backend exposes three routes, all returning clean JSON:

| Route          | Returns                                       | Cache |
|----------------|-----------------------------------------------|-------|
| `/api/bazaar`  | `{ buyPrice, sellPrice, spread, updatedAt }`  | 30s   |
| `/api/history` | `{ points: [{ t, v }], updatedAt }`           | 5m    |
| `/api/health`  | `{ ok, cache: { bazaar, history } }`          | —     |

`buyPrice` is insta-buy (what you pay), `sellPrice` is insta-sell (what you get) — Hypixel's own naming. If an upstream call fails, the route serves the last good cached value and sets an `X-Served-Stale: 1` header.

### Hosting the API elsewhere

If the API lives on a different origin than the page, set `API_BASE` near the top of the `<script>` in `public/index.html` to that origin (e.g. `"https://api.yoursite.com"`). Left blank, it assumes same-origin.

## Data sources

- **Live price** — [Hypixel Bazaar API](https://api.hypixel.net/skyblock/bazaar) (`BOOSTER_COOKIE.quick_status`), public, no key.
- **Price history** — [Coflnet](https://sky.coflnet.com). Rate-limited, so the backend caches history for 5 minutes.

## Keeping it accurate

Gem bundle prices (`GEM_BUNDLES` in `public/index.html`) are hardcoded, because there's no API for the Hypixel Store. They reflect the pricing after the April 2026 gem price increase. If Hypixel changes bundle pricing again, update that array by hand — it's the only figure in the app not pulled live.

## License

[GNU AGPLv3](LICENSE). It's copyleft: anyone who uses or modifies this code has to make their source available under the same license — and because it's the *Affero* GPL, that applies even to people who only run a modified version as a website, without ever distributing the code. If you fork it and host your own version, your changes have to stay open.
