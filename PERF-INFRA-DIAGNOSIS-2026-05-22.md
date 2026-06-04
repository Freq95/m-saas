# Densa.ro Infrastructure Performance Diagnosis — 2026-05-22

> Live measurements against https://www.densa.ro. Goal: determine whether
> "feels slow" complaints are a software ceiling or an infrastructure /
> free-tier ceiling.

## TL;DR

**It's infrastructure, not code.** The code is well-optimized at this point. Three concrete infrastructure facts are dominating user-perceived perf:

1. **Vercel function runs in `iad1` (US East Virginia) while edge POP is `fra1` (Frankfurt)** — every dynamic request pays ~80ms transatlantic RTT just for the function-call hop, plus more for any DB I/O.
2. **Cold start adds ~1000ms** to the first request after function idle. Free tier doesn't keep functions warm; paid tier (`fluid compute`) does.
3. **Zero edge caching for dynamic routes** — every nav round-trips Frankfurt → Virginia → MongoDB → Virginia → Frankfurt → user. Even when the data hasn't changed.

The fastest single fix: **move the function to Frankfurt** (`vercel.json` change, no code, free tier). Estimated win: 200-400ms on every API and RSC call.

---

## Raw measurements

### Cold-start TTFB (5 consecutive /login requests, 1s apart)

| Request | TTFB | Vercel-Cache | Region routing |
|---|---|---|---|
| #1 (cold) | **1201 ms** | MISS | fra1::iad1 |
| #2 | 253 ms | MISS | fra1::iad1 |
| #3 | 226 ms | MISS | fra1::iad1 |
| #4 | 221 ms | MISS | fra1::iad1 |
| #5 | 207 ms | MISS | fra1::iad1 |

**Diagnosis:** Cold start adds ~950ms penalty. Every request misses edge cache (because `Cache-Control: no-store` is set). Function consistently runs in Virginia.

### Authenticated API timing

| Endpoint | First hit | Warm |
|---|---|---|
| `/api/auth/session` | 206 ms | — |
| `/api/clients?page=1` | **1306 ms** | 540 ms |
| `/api/appointments?...` | **1472 ms** | — |
| `/api/calendars` | 255 ms | — |
| `/api/services` | 356 ms | — |
| `/api/availability-blocks?...` | 707 ms | — |

**Diagnosis:**
- "First hit" times include function cold-start cost (~800-1000ms).
- "Warm" times (540ms for /clients) reflect: ~80ms Frankfurt→Virginia + ~80ms Virginia→MongoDB + query execution + serialize + return.
- Light endpoints like `/api/calendars` (255ms) are mostly network; the query itself is probably <10ms.

### Bundle audit on /calendar (the heaviest authenticated page)

| Metric | Size |
|---|---|
| JS encoded (over the wire) | **215 KB** |
| JS decoded (parsed) | 718 KB |
| Largest chunk (React framework) | 194 KB decoded |
| Calendar page itself | 43 KB decoded |
| Total resources | 17 JS, 5 CSS, 6 fonts, 1 image |

**Diagnosis:** Bundle is fine. 215 KB encoded is lean for a SaaS (Twitter ~600 KB, Linear ~400 KB). On 4G LTE (~12 Mbps) this transfers in ~150ms. **Not the bottleneck.** On slow 3G it'd take 4+ seconds, but that's network, not code.

### Resource-hints / Network breakdown for warm /calendar

| Phase | Time |
|---|---|
| DNS lookup | 0 ms (cached) |
| TCP handshake | 0 ms (kept alive) |
| TLS | 0 ms (resumed) |
| Request → first byte | 22 ms |
| Response stream complete | **1728 ms** ← function execution + RSC streaming |
| DOM interactive → complete | 82 ms |

**Diagnosis:** Network is fine. The 1728ms server response is function execution: getAuth → 4 parallel Mongo queries → HTML/RSC stream. With function in Virginia and Mongo presumably also in US, this is ~80ms of intercontinental hops baked into every page load.

### HTTP-level details

- **Protocol:** HTTP/2 (`h2`) — modern, multiplexed. Good.
- **Preconnect / dns-prefetch hints:** ZERO. No `<link rel="preconnect">` or `<link rel="dns-prefetch">` in HTML. Cheap missed opportunity, but only matters for third-party domains and you don't have many.
- **Preload hints:** Only 1 (webpack chunk). The framework/page chunks aren't preloaded — they're discovered as the browser parses the HTML.

---

## Where the time actually goes

For a typical authenticated nav (e.g., click "Calendar" from "Dashboard"):

```
User click
  ↓
  ~5 ms   Optimistic indicator updates (instant)
  ↓
  ~50 ms  TLS-resumed request leaves browser
  ↓
  ~30 ms  Frankfurt edge POP → Virginia function (cold)
  ↓
  ~800 ms (if cold) function spin-up: load Node, parse code, init Mongo client
  ↓
  ~80 ms  Virginia → MongoDB Atlas (assuming Atlas in US East too)
  ↓
  ~10 ms  Query execution (well-indexed)
  ↓
  ~80 ms  Mongo → Virginia
  ↓
  ~50 ms  function: render RSC, serialize, stream
  ↓
  ~30 ms  Virginia → Frankfurt edge
  ↓
  ~50 ms  Frankfurt → user browser
  ↓
  ~100 ms  Browser: hydrate, paint
  =
  ~1.3 s total (cold), ~500 ms (warm)
```

**The 800ms cold start and the 160ms transatlantic round-trip-per-DB-hop are the only big slices that aren't code.**

---

## Fixes ranked by effort × impact

### Tier 1 — Infrastructure (biggest wins, no code)

**1. Move Vercel function region to `fra1` (Frankfurt).**
- Edit `vercel.json`: add `"regions": ["fra1"]`
- Estimated win: **150-300ms per request** (removes transatlantic hop)
- Effort: 1 line, 1 minute, free tier
- Risk: if you have any US users they'd get slower (irrelevant for a Romania dental practice)

**2. Move MongoDB Atlas cluster to `eu-central-1` (Frankfurt) or `eu-west-1` (Ireland).**
- Estimated win: **another 150ms per query**, compounding with #1
- Effort: Atlas Console → cluster settings → migrate (downtime ~10 minutes, run during low-use hours)
- Cost: Free tier (M0) supports EU regions
- After this + #1, all DB I/O is intra-EU (~5-15ms RTT)

**3. Upgrade Vercel to paid tier with `fluid compute` (later, not now).**
- Eliminates the ~800ms cold start by keeping warm instances
- Estimated win: **800ms on first hit after idle** (no help on warm requests)
- Cost: $20/month
- Defer until users complain about cold starts specifically, or until #1+#2 are exhausted

### Tier 2 — Software (smaller wins, more effort)

**4. Edge-cache `unstable_cache` outputs at the Vercel level.**
- Currently your `unstable_cache` is function-level (in-memory per instance, reset on cold start)
- Add `revalidate` headers on RSC responses so Vercel edge caches them between requests
- Estimated win: **200-500ms** on second+ user visits that hit the same cache key
- Effort: per-route audit of cache strategy; tricky to get right (stale data risk)

**5. Move auth-light routes to `runtime: 'edge'`.**
- Routes like `/api/calendars`, `/api/services` are read-only, low-CPU
- Edge runtime runs at the user's nearest POP, ~30ms RTT instead of 200ms
- Estimated win: **150ms per edge-runtime API call**
- Effort: rewrite for Web APIs only (no Node `fs`, no native MongoDB driver — need fetch-based DB client). Significant.

**6. Add `<link rel="preconnect" href="...">` for any third-party domain.**
- Currently zero preconnect hints
- If you don't use third-party (Stripe, analytics) yet, this is a no-op
- Effort: 5 minutes, but check whether you have anything to preconnect to

**7. Prefetch on `touchstart` (mobile) + `mouseenter` (desktop) for nav links.**
- Today nav uses Next default (viewport-based prefetch)
- Hover/touch prefetch fires earlier — covers 100-200ms of RSC fetch
- Estimated win: ~150ms on second-click feel
- Effort: 10 lines in AppTopNav

### Tier 3 — Diagnostic / what-you-can't-do-without-server-access

**8. Mongo Atlas EXPLAIN plans.** Verify your perf indexes are actually being used by the planner.
**9. Vercel function execution logs.** See real cold-start frequency and execution time distributions.
**10. Vercel Analytics free tier.** Adds p75 / p95 by route from real users. *This alone* would tell you whether "feels slow" is one user on a 4G dead zone or systemic.

---

## My recommendation, ranked

1. **Do #1 now.** (`vercel.json` regions). 1 minute. Free. Will eliminate ~150-300ms from every request you measure.
2. **Plan #2 for next maintenance window.** (Atlas region migration). 30 minutes including testing. Another ~150ms.
3. **Turn on Vercel Analytics** (#10). Free tier. Gives you the only metric that matters — what real users experience.
4. **Stop optimizing code.** The audit work is done. Bundle is lean, RSC is wired, hydration is clean. Software-side returns are diminishing.

After steps 1-3, if users are still complaining, evaluate paid Vercel ($20) for warm functions. That kills the last 800ms.

## Honest end-state

If you do #1 + #2 + paid Vercel:
- Cold start: ~200ms (function warm, EU-co-located)
- Warm API call: ~150-250ms (intra-EU + indexed query)
- Tab nav perceived: feels native-app instant

If you stop at free tier with #1 + #2 only:
- Cold start: ~1000ms (function still cold-spins, but EU-located)
- Warm API call: ~250-400ms (intra-EU)
- Tab nav perceived: snappy but not instant

There's no further code improvement that beats moving the bytes ~6000 km closer to the user.
