# Cloudflare Worker Tile Proxy

The weather-loop app uses a Cloudflare Worker to proxy tile requests from various weather data providers. This solves two problems:

1. **CORS** - Some tile servers don't include CORS headers
2. **Caching** - Edge caching reduces load on upstream APIs and improves performance

## Deployed Endpoint

```
https://weather-tile-proxy.nicklaudethorat.workers.dev
```

## Supported Providers

| Provider | Path Pattern | Upstream | Cache TTL |
|----------|--------------|----------|-----------|
| RainViewer | `/rainviewer/*` | tilecache.rainviewer.com | 15 min |
| IEM | `/iem/*` | mesonet.agron.iastate.edu | 5 min |
| NASA GIBS | `/gibs/*` | gibs.earthdata.nasa.gov | 10 min |

## Example Requests

```bash
# RainViewer radar tile
curl "https://weather-tile-proxy.nicklaudethorat.workers.dev/rainviewer/v2/radar/1771820400/256/5/9/11/2/1_1.png"

# IEM KBOX radar
curl "https://weather-tile-proxy.nicklaudethorat.workers.dev/iem/cache/tile.py/1.0.0/ridge::BOX-N0Q-0/5/9/11.png"

# NASA GIBS GOES
curl "https://weather-tile-proxy.nicklaudethorat.workers.dev/gibs/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/GoogleMapsCompatible_Level7/5/9/11.png"
```

## How Caching Works

```
User A (Boston) ──► CF Boston Edge ──► RainViewer
                         │
                    [cache tile, 15min TTL]
                         │
User B (Boston) ──► CF Boston Edge ──► cache HIT! (no RainViewer request)

User C (NYC) ──► CF NYC Edge ──► RainViewer (different edge, cold cache)
```

**Key points:**
- Each of Cloudflare's 300+ data centers has its own cache
- Caches do NOT sync between data centers
- First request to an edge = cache miss → fetch from upstream
- Subsequent requests = cache hit → instant response
- TTL is controlled by `Cache-Control` header

## Rate Limiting

RainViewer has a rate limit of **100 requests/minute/IP**. The Worker helps in two ways:

1. **Cache hits don't count** - Cached tiles are served without hitting RainViewer
2. **Progressive loading** - Client loads frames with delays to stay under limit

The client implements:
- Current frame loads immediately
- Other frames load with 100ms delays between each
- Slider is debounced (150ms) to prevent rapid tile requests

## Deployment

### Prerequisites

1. [Wrangler CLI](https://developers.cloudflare.com/workers/cli-wrangler/install-update/)
2. Cloudflare account

### Deploy

```bash
cd ~/code/weather-tiles-proxy

# Login (first time only)
wrangler login

# Deploy
wrangler deploy
```

### Configuration

Edit `wrangler.toml`:

```toml
name = "weather-tile-proxy"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGINS = "https://nicklaude.github.io,http://localhost:5173"
```

## Worker Source Code

The worker is ~150 lines of JavaScript. See [`weather-tiles-proxy/src/worker.js`](../weather-tiles-proxy/src/worker.js).

Key features:
- Per-tile caching with provider-specific TTLs
- CORS headers for allowed origins
- Error handling with 502 responses
- `waitUntil()` for non-blocking cache writes

## Monitoring

```bash
# View live logs
wrangler tail --name weather-tile-proxy

# Check deployments
wrangler deployments list --name weather-tile-proxy
```

## Costs

Cloudflare Workers free tier includes:
- 100,000 requests/day
- 10ms CPU time per request

Our usage is well under these limits. At 5 users/day with heavy scrubbing:
- ~7,500 requests/month
- $0/month

Paid plan ($5/month) needed only at ~300,000+ requests/day.

## Troubleshooting

### 403 Forbidden from RainViewer

Rate limit hit. Solutions:
1. Wait 1 minute (limit resets)
2. Check if progressive loading is working
3. Verify cache is functioning (`cf-cache-status: HIT`)

### 503 from IEM

IEM servers occasionally return 503 under load. The client implements retry with exponential backoff.

### CORS Errors

Check that the request origin is in `ALLOWED_ORIGINS` in `wrangler.toml`.
