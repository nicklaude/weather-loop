# Weather Loop Project Notes

## 2026-02-22: Globe Library Decision

### Problem
globe.gl crashes iOS Safari completely due to WebKit bug #289601 (three.js context loss on M3/M4 devices, iOS 17+). No code-level fix available.

### Solution: MapLibre GL JS 5.x
Tested MapLibre GL globe projection on iOS Simulator - works perfectly with smooth pan/zoom.

**Why MapLibre:**
- ✅ Works on iOS Safari (tested)
- ✅ Native smooth pan/zoom/rotate gestures
- ✅ Globe projection since v5.0 (Jan 2025)
- ✅ Supports raster tile overlays (satellite + radar)
- ✅ Smaller bundle (~300KB vs 2MB for globe.gl)
- ✅ Better performance (optimized for mobile)

### Plan Review Scores

**Claude subagent: 6.2/10**
| Axis | Score |
|------|-------|
| iOS Safari Reliability | 5/10 |
| Seamless Imagery | 6/10 |
| Gesture Performance | 7/10 |
| Right-Sized Complexity | 7/10 |
| Data Source Viability | 6/10 |

Key concerns:
- Simulator ≠ real device testing
- MapLibre docs say "single-pixel seams between tiles are unavoidable"
- RainViewer max zoom is 7 (limits regional detail)
- Need `experimentalZoomLevelsToOverscale: 4` for Safari stability

**Gemini: 9.0/10**
| Axis | Score |
|------|-------|
| Technical Feasibility | 9/10 |
| Right-sized Complexity | 10/10 |
| User Experience Focus | 8/10 |
| Risk Mitigation | 9/10 |
| Adherence to Constraints | 9/10 |

**Combined Average: 7.6/10**

### Recommendations (merged)

1. **Test on real iOS devices from Day 1** - simulator uses macOS GPU, not iOS Metal/WebGL
2. **Add `experimentalZoomLevelsToOverscale: 4`** to map config for Safari stability
3. **Handle RainViewer zoom 7 limit** - fade out radar at zoom 8+ or find higher-res source
4. **Redefine "no seams"** - MapLibre docs say minor seams are unavoidable with globe projection
5. **Integrate polish throughout** - don't defer to last day

### Implementation Plan (6 days)

**Phase 1: MapLibre Globe (2 days)**
- Replace GlobeView with MapLibre GL
- Add GOES satellite tiles as raster source
- Configure globe projection with atmosphere
- Add experimentalZoomLevelsToOverscale: 4

**Phase 2: Radar Overlay (2 days)**
- Integrate RainViewer API for radar tiles
- Add radar as transparent overlay layer
- Implement time-based animation (historic + live)
- Handle zoom 7 limit gracefully (fade out at higher zoom)

**Phase 3: Region Selection (1 day)**
- Add UI to select regions (CONUS, Northeast, etc)
- Fly-to animation when region selected
- Seamless transition between zoom levels

**Phase 4: Polish (1 day)**
- Loading states
- Error handling
- Performance tuning

### Data Sources

**Satellite:**
- NOAA GOES via ArcGIS: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
- Or GOES CDN directly (need to verify tile format)

**Radar:**
- RainViewer API (free, global, XYZ tiles)
- Max zoom: 7
- Tile URL: `https://tilecache.rainviewer.com/v2/radar/{timestamp}/{z}/{x}/{y}/2/1_1.png`

### Open Questions

1. How to get seamless NOAA GOES satellite on globe? (current test uses ArcGIS World Imagery)
2. RainViewer zoom 7 limit - acceptable for regional views?
3. MapLibre styling - does it have dark mode / customization?

### Process Requirements

- **Every plan iteration must include a prototype screenshot**
- Use Gemini Vision to verify prototype matches PRD requirements
- Test on real iOS device, not just simulator

---

## 2026-02-22: GOES Overlay Alignment Issue

### Problem
GOES Full Disk image overlay doesn't align perfectly with globe projection. In top-left corner, image edge doesn't line up with expected geographic bounds.

### Root Cause (researching)
GOES satellites use **geostationary projection**, NOT a simple lat/lon grid. The Full Disk image is:
- Circular (disk-shaped), not rectangular
- Centered at satellite position (GOES-19 at -75.2° W)
- Coverage is approximately 83° local zenith angle
- Edge pixels map to Earth's limb at tangent angle

Simply using rectangular bounds like `[-165, -81]` to `[15, 81]` won't work because:
1. GOES projection is non-linear (perspective from space)
2. Corners of the rectangular image are actually "space" (black), not Earth
3. Need proper geodetic transformation

### Options to Fix

1. **Use NOAA's pre-tiled WMS service** (nowcoast.ncep.noaa.gov)
   - Already reprojected to Web Mercator
   - Standard WMS interface
   - Downside: Bounding box format, not XYZ tiles

2. **Use GOES imagery from ArcGIS/ESRI**
   - Already tiled for web maps
   - Look for "Living Atlas" weather layers

3. **Pre-process GOES images server-side**
   - Use GDAL to reproject geostationary -> Web Mercator
   - Create XYZ tile pyramid
   - Host on S3/GCS

4. **Use MapLibre's rasterized image source with proper corners**
   - MapLibre ImageSource supports arbitrary quadrilateral coordinates
   - Need to calculate exact corner coordinates in lon/lat from GOES projection parameters

### Key References
- GOES-East position: **-75.2° W** longitude
- Full Disk: 83° local zenith angle coverage
- Projection params: Semi-major axis 6,378,137m, satellite height 35,786,023m

### Next Steps
- Try NOAA nowcoast WMS to see if it works with MapLibre
- Research GOES ArcGIS layer availability
- Test with corrected corner coordinates

---

## Screenshots

- `/tmp/maplibre-globe-test.png` - Initial globe load (works on iOS)
- `/tmp/maplibre-globe-panned.png` - After pan gesture (smooth)
- `/tmp/maplibre-goes-overlay.png` - GOES overlay prototype (alignment issue visible in top-left)
