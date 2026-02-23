# Weather Loop - API & Caching Improvement Plan

## Current Issues

Based on testing, these layers have problems:
1. **GOES-E / GOES-W** - 404 errors when time-syncing, tiles disappearing
2. **GIR (IR Enhanced)** - Similar timestamp issues
3. **VIIRS** - Daily imagery, not syncing properly
4. **KBOX** - Historical timestamp format issues

## API Research Summary

### NASA GIBS (GOES, GIR, VIIRS)
- **Endpoint:** `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{Time}/GoogleMapsCompatible_Level{N}/{z}/{y}/{x}.png`
- **Time format:** ISO8601 (`YYYY-MM-DDTHH:MM:SSZ`) for subdaily, `YYYY-MM-DD` for daily
- **GOES updates:** Every 10 minutes, ~40 min latency
- **VIIRS updates:** Daily
- **Rate limits:** None documented (fair use)
- **Max zoom:** Level 7 for GOES, Level 9 for VIIRS

### IEM (KBOX radar)
- **Endpoint:** `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::{RADAR}-{PRODUCT}-{TIMESTAMP}/{z}/{x}/{y}.png`
- **Time format:** `YYYYMMDDHHmm` UTC or `0` for latest
- **Updates:** Every 5 minutes (timestamps must be modulo 5)
- **Rate limits:** Fair use, soft limits, may return 503 under load
- **Archive:** Back to 2012

### RainViewer (current radar)
- **Working well** - Already implemented correctly
- **Rate limit:** 100 requests/min/IP (enforced Jan 2026)
- **Max zoom:** Level 7

### NWS WMS
- **Unreliable** - Multiple outages documented in 2024
- **Recommendation:** Use as fallback only, prefer IEM

---

## Implementation Plan

### Phase 1: Fix GOES Layers (NASA GIBS)

**Problem:** We're requesting GIBS tiles with timestamps that don't exist, causing 404s.

**Solution:**
1. **Query available times first** using GIBS DescribeDomains or parse GetCapabilities
2. **Build a valid timestamp list** for GOES (last ~2 hours at 10-min intervals)
3. **Map RainViewer timestamps to nearest GIBS timestamp**
4. **Cache timestamp mappings** - refresh every 10 minutes

```typescript
// New: Fetch available GOES timestamps
async function fetchGoesTimestamps(): Promise<string[]> {
  // Option A: Parse GetCapabilities for <Dimension>time</Dimension>
  // Option B: Query DescribeDomains endpoint
  // Returns array of valid ISO8601 timestamps
}

// Map radar time to nearest valid GOES time
function getNearestGoesTime(radarTime: number, goesTimestamps: string[]): string | null {
  // Find closest timestamp within 15 minutes, or return null
}
```

**Files to modify:**
- `src/components/MapView.tsx` - Add GOES timestamp fetching
- New utility: `src/utils/goesApi.ts`

### Phase 2: Fix VIIRS Layer

**Problem:** VIIRS is daily, not subdaily. Current time sync logic doesn't match.

**Solution:**
1. **VIIRS uses date only** (`YYYY-MM-DD`), not full timestamp
2. **Use yesterday's date** since today's data isn't available until late
3. **No time slider sync** - VIIRS is static daily imagery

```typescript
// VIIRS should use yesterday's date
const viirDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const viirsUrl = `...VIIRS_SNPP.../default/${viirDate}/...`;
```

### Phase 3: Fix KBOX Radar (IEM)

**Problem:** Historical timestamps may not exist for every 10-min interval.

**Solution:**
1. **Round to nearest 5 minutes** (IEM requires modulo 5)
2. **Use JSON API to get valid scan times** before requesting tiles
3. **Fall back to timestamp `0` (latest)** if historical not available

```typescript
// Round to nearest 5 minutes for IEM
const minutes = Math.round(date.getUTCMinutes() / 5) * 5;

// Query available scans
const scanUrl = `https://mesonet.agron.iastate.edu/json/radar.py?operation=list&radar=BOX&product=N0Q&start=${start}&end=${end}`;
```

### Phase 4: Improve Caching Strategy

**Current issue:** Tiles are re-fetched every time slider moves.

**Solution:**
1. **Aggressive tile caching** - Set `maxTileCacheSize: 1000` in MapLibre
2. **Pre-fetch adjacent frames** when layer is enabled
3. **Use browser cache headers** - GIBS tiles are immutable per timestamp
4. **Don't update source URL** if timestamp hasn't changed

```typescript
// Only update source if URL actually changed
const newUrl = buildGoesUrl(timestamp);
if (currentGoesUrlRef.current !== newUrl) {
  currentGoesUrlRef.current = newUrl;
  source.setTiles([newUrl]);
}
```

### Phase 5: RainViewer Rate Limiting (CRITICAL)

**Problem:** RainViewer enforces 100 requests/min/IP. Scrubbing fires requests for every frame change, easily exceeding this. Screenshot shows 429 errors + CORS blocks.

**Solution - Preload Strategy (like PSU loop60.html):**
1. **On page load or layer enable:** Preload ALL 12 radar frames in background
2. **Store tiles in memory/cache** before user can scrub
3. **Scrubbing uses cached tiles** - no network requests during interaction
4. **Rate limit the preload:** Fetch tiles in batches with delays

```typescript
// Preload all RainViewer frames when layer enabled
async function preloadRainViewerFrames(frames: RadarFrame[]) {
  const allTileUrls: string[] = [];

  // Get tile URLs for current viewport
  const bounds = map.getBounds();
  const zoom = Math.floor(map.getZoom());
  const tiles = getTilesInBounds(bounds, zoom);

  for (const frame of frames) {
    for (const tile of tiles) {
      allTileUrls.push(frame.path + `/${zoom}/${tile.x}/${tile.y}/4/1_1.png`);
    }
  }

  // Preload in batches with rate limiting
  const BATCH_SIZE = 10;  // RainViewer allows bursts
  const BATCH_DELAY = 700; // ~85 requests/min, under 100 limit

  for (let i = 0; i < allTileUrls.length; i += BATCH_SIZE) {
    const batch = allTileUrls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(url => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = url;
      });
    }));
    await sleep(BATCH_DELAY);
  }
}
```

**Key insight:** PSU's loop60.html works because it downloads all 60 frames upfront before enabling any interaction. We need the same pattern.

### Phase 6: General Rate Limiting & Throttling

**Add throttling for ALL tile requests:**
1. **Debounce slider scrubbing** - Don't fire on every pixel move
2. **Configure MapLibre's `maxParallelImageRequests`** - limit concurrent fetches
3. **Handle 429/503 errors** gracefully - retry with exponential backoff

```typescript
// Set in MapLibre initialization
const map = new maplibregl.Map({
  maxParallelImageRequests: 6, // Default is 16, reduce to avoid rate limits
  ...
});

// Debounce slider updates
const debouncedSetFrame = useMemo(
  () => debounce((index: number) => setCurrentFrameIndex(index), 100),
  []
);
```

### Phase 7: Error Handling & Fallbacks

1. **Log but don't crash** on 404/503 errors
2. **Fall back to latest imagery** if historical unavailable
3. **Show loading state** while tiles load
4. **Indicate stale data** if refresh fails

---

## Implementation Order

1. [ ] **P0: RainViewer preloading** - Preload all frames before allowing scrub (fixes 429s)
2. [ ] **P0: Debounce slider** - Reduce request frequency during scrub
3. [ ] **P0: Set maxParallelImageRequests** - MapLibre config to limit concurrent fetches
4. [ ] **P1: Fix GOES time sync** - Fetch valid timestamps, use nearestValue snapping
5. [ ] **P1: Fix VIIRS** - Use date-only format
6. [ ] **P1: Fix KBOX** - Round to 5-min, validate timestamps
7. [ ] **P2: Improve caching** - Larger cache, smarter preloading
8. [ ] **P3: Error UI** - Better feedback on failures

---

## Testing Checklist

- [ ] GOES-E loads and displays at all zoom levels
- [ ] GOES-W loads and displays at all zoom levels
- [ ] GIR loads and displays
- [ ] VIIRS loads (static, no time sync)
- [ ] KBOX syncs with time slider
- [ ] Scrubbing is smooth (no visible loading)
- [ ] No 404 errors in console
- [ ] No 503 errors under normal use
- [ ] Animation plays smoothly

---

## Notes

- **NWS WMS is unreliable** - Multiple 2024 outages. Consider removing as default.
- **RainViewer rate limit** (100/min/IP) may affect heavy animation use
- **GIBS has ~40 min latency** for GOES - latest imagery is always behind
