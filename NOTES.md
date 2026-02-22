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
- ~~Try NOAA nowcoast WMS to see if it works with MapLibre~~ ✅ DONE - works perfectly!
- Add radar overlay (RainViewer)
- Test time-based animation for historic playback
- Deploy prototype and test on real iOS device

---

## 2026-02-22: nowCOAST WMS Solution WORKS

### Victory: Alignment Problem Solved

**NOAA nowCOAST WMS provides pre-reprojected GOES imagery in Web Mercator (EPSG:3857).**

This completely solves the alignment problem because:
1. NOAA does the geostationary → Web Mercator reprojection server-side
2. MapLibre natively uses Web Mercator for tiles
3. No manual coordinate calculation needed

### Working WMS Configuration

**Base URL:** `https://nowcoast.noaa.gov/geoserver/satellite/wms`

**Available Layers:**
| Layer Name | Description | Resolution |
|-----------|-------------|------------|
| `goes_visible_imagery` | Visible light (Band 2, 0.64 μm) | 0.5 km |
| `goes_longwave_imagery` | Infrared (Band 14, 11.2 μm) | 2 km |
| `goes_shortwave_imagery` | Shortwave IR (Band 7, 3.9 μm) | 2 km |
| `goes_water_vapor_imagery` | Water vapor (Band 8, 6.2 μm) | 2 km |
| `goes_snow_ice_imagery` | Snow/Ice (Band 5, 1.61 μm) | 1 km |

**Update Frequency:** Every 5 minutes

**MapLibre Source Configuration:**
```javascript
'goes-visible': {
    type: 'raster',
    tiles: [
        'https://nowcoast.noaa.gov/geoserver/satellite/wms?' +
        'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
        '&FORMAT=image/png&TRANSPARENT=true' +
        '&LAYERS=goes_visible_imagery' +
        '&WIDTH=256&HEIGHT=256&CRS=EPSG:3857' +
        '&STYLES=&BBOX={bbox-epsg-3857}'
    ],
    tileSize: 256
}
```

### Gemini Vision Alignment Verification

**Result: 9.5/10 alignment quality**

Gemini Vision Pro analysis:
- "Coastline alignment: Key geographic features match up perfectly"
- "No discernible offset between layers"
- "For weather visualization, the registration is as good as it gets"

### Key Learnings

1. **Don't try to manually reproject geostationary imagery** - use pre-tiled WMS services
2. **NOAA nowCOAST is the right data source** - already optimized for web maps
3. **MapLibre WMS support works seamlessly** - just use `{bbox-epsg-3857}` placeholder
4. **Test with Gemini Vision** - objective way to verify visual alignment

---

## 2026-02-22: Radar Overlay Working + Coverage Constraints

### Radar Integration Success

**RainViewer API** provides global radar tiles that work seamlessly with MapLibre:
- XYZ tile format: `{host}{path}/256/{z}/{x}/{y}/{color}/{smooth}_{snow}.png`
- Max zoom: 7 (lower than satellite, but acceptable for radar overview)
- 12 frames of historic data (~2 hours)
- Updates every 10 minutes

### Combined View Verified

Gemini Vision analysis of satellite + radar overlay: **10/10**
- "No technical flaws such as missing data tiles or misaligned layers"
- "Radar returns are located logically within the thicker cloud masses"
- "Geographic placement relative to coastlines is accurate"

### Coverage Constraints Identified

**GOES Satellite (nowCOAST):**
- GOES-East (-75.2° W) + GOES-West (-137° W) = Western Hemisphere only
- Full Disk covers ~180° of longitude (roughly -180° to 0°)
- No coverage for Europe, Africa, Asia, Australia

**For Global Satellite Coverage, would need:**
1. **GMGSI** (Global Mosaic of Geostationary Satellite Imagery) - available on nowCOAST
2. **Himawari-9** for Asia/Pacific (Japan Meteorological Agency)
3. **Meteosat** for Europe/Africa (EUMETSAT)

**RainViewer Radar:**
- Global coverage in theory
- Dense in US, Europe, Japan, Australia
- Sparse over oceans, developing regions, China

### Open Question for Product

**Is global satellite coverage P0 or P1?**
- If US-focused: Current GOES + RainViewer is sufficient
- If global: Need to add GMGSI or multi-satellite composite

---

## Screenshots

- `/tmp/maplibre-globe-test.png` - Initial globe load (works on iOS)
- `/tmp/maplibre-globe-panned.png` - After pan gesture (smooth)
- `/tmp/maplibre-goes-overlay.png` - GOES overlay prototype (alignment issue visible in top-left)

---

## 2026-02-22: Comprehensive Data Sources Research

### P0 Requirements (Sam)
- **True Color satellite imagery** (GEOCOLOR)
- **Reflectivity for rain/precip**
- Gather all available data sources

---

### 🛰️ SATELLITE DATA SOURCES

#### GOES-19 Direct CDN (True Color/GEOCOLOR)
- **URL:** `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/{sector}/GEOCOLOR/`
- **Sectors:** FD (Full Disk), CONUS, ne, se, car, pr, cgl, umv, sr, sp, mex
- **Update frequency:** Every 5 minutes
- **Format:** PNG/JPG single images (NOT pre-tiled)
- **Challenge:** Geostationary projection → needs reprojection for map overlay

#### NASA GIBS (Global Imagery Browse Services) ⭐ RECOMMENDED
- **WMTS endpoint:** `https://gibs.earthdata.nasa.gov/wmts/`
- **WMS endpoint:** `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi`
- **Key advantage:** Pre-tiled in Web Mercator (EPSG:3857) - solves projection alignment!
- **GOES layers available:** Yes, properly reprojected
- **Documentation:** https://nasa-gibs.github.io/gibs-api-docs/

#### NOAA nowCOAST WMS (Current solution)
- **URL:** `https://nowcoast.noaa.gov/geoserver/satellite/wms`
- **Layers:** goes_visible_imagery, goes_longwave_imagery, etc.
- **Note:** Has band data but NOT GEOCOLOR (true color composite)
- **Already verified working with 9.5/10 alignment**

#### GOES ABI Bands (16 total)
| Type | Bands | Description |
|------|-------|-------------|
| Visible | 1-2 | Blue, Red (0.47-0.64 μm) |
| Near-IR | 3-6 | Vegetation, snow/ice, cloud particle size |
| IR | 7-16 | Shortwave IR, water vapor, longwave IR |

**GEOCOLOR** is a composite of Red/Blue visible + simulated Green during day, IR at night.

---

### 📡 RADAR DATA SOURCES

#### KBOX (Boston NEXRAD - Single Site)
- **Location:** Taunton, MA (41.96°N, 71.14°W)
- **Elevation:** 232 ft

**Level 2 (Raw Base Data):**
- Resolution: 250m range gates (super-res) or 1km (legacy)
- Range: 460km (reflectivity), 300km (velocity)
- Update: 5-6 min full volume scan
- AWS real-time: `s3://unidata-nexrad-level2-chunks/`
- Products: Reflectivity, radial velocity, spectrum width, differential reflectivity, differential phase, cross-correlation ratio
- Format: Binary (needs decoding)

**Level 3 (Derived Products):**
- Lower resolution, pre-processed
- Pre-rendered by radar product generators
- Easier to consume but less detail

**KBOX Advantages:**
- Highest resolution (250m vs 1km for composites)
- Raw dual-pol data for advanced analysis
- Single source = simpler

**KBOX Disadvantages:**
- "Cone of silence" directly overhead radar
- Coverage gaps at range edges
- Only covers ~460km radius from Taunton

#### MRMS (Multi-Radar Multi-Sensor) ⭐ RECOMMENDED FOR CONUS
- **Resolution:** 1km grid, 33 vertical levels
- **Update frequency:** Every 2 minutes! (fastest)
- **Coverage:** CONUS + southern Canada (55°N/130°W to 20°N/60°W)
- **Sources:** 143 WSR-88Ds + 30 Canadian radars + satellite + surface obs + lightning
- **AWS bucket:** `noaa-mrms-pds`
- **Format:** GRIB2 (easier than raw NEXRAD)
- **Viewer:** https://mrms.nssl.noaa.gov/qvs/product_viewer/

**MRMS Products:**
| Product | Description |
|---------|-------------|
| Reflectivity | Hybrid scan reflectivity (HSR) |
| PCP_RATE | Surface precipitation rate (mm/hr) |
| Q3RAD | Radar-only QPE accumulations |
| Q3GC | Gauge bias-corrected radar QPE |
| QPE 1/3/6/12/24/48/72hr | Rainfall totals |
| Hail Size | Estimated hail diameter |
| Rotation Tracks | Mesocyclone detection |
| Lightning Density | Strike density |

**MRMS Advantages:**
- No coverage gaps (overlapping radars)
- Fastest updates (2 min vs 5-6 min)
- Quality controlled (removes ground clutter)
- Gap-filling using satellite + surface obs

**MRMS Disadvantages:**
- Lower resolution than single-site Level 2 (1km vs 250m)
- Requires GRIB2 decoding
- No pre-tiled XYZ format

#### RainViewer (Current solution)
- **Source:** NEXRAD Level-III via Iowa Environmental Mesonet
- **Format:** XYZ tiles (ready to use!)
- **Update:** Every 5 minutes (some latency from source)
- **Max zoom:** 7
- **Coverage:** Global (dense US/Europe/Japan, sparse elsewhere)
- **Tile URL:** `https://tilecache.rainviewer.com/v2/radar/{timestamp}/{z}/{x}/{y}/2/1_1.png`

---

### 🎯 RECOMMENDATIONS

**For Massachusetts Focus (P0):**

| Layer | Source | Reason |
|-------|--------|--------|
| True Color Satellite | NASA GIBS | Pre-tiled GOES GEOCOLOR in Web Mercator |
| Reflectivity Radar | RainViewer | Pre-tiled, working, 5-min updates |
| OR Reflectivity Radar | MRMS | Higher quality, 2-min updates (needs tile pipeline) |

**Path Forward:**
1. **Test NASA GIBS for GEOCOLOR** - should solve true color + alignment in one shot
2. **Keep RainViewer for now** - it works
3. **Prototype MRMS integration** if we want 2-min updates or Massachusetts-specific detail

**For KBOX Specifically:**
- Only worth it if we need raw dual-pol data (differential reflectivity, phase)
- Would require building a decode + tile pipeline
- Probably overkill for P0 weather visualization

---

### 🔗 Key URLs

| Resource | URL |
|----------|-----|
| GOES-19 CDN | https://cdn.star.nesdis.noaa.gov/GOES19/ |
| NASA GIBS Docs | https://nasa-gibs.github.io/gibs-api-docs/ |
| GIBS WMS (EPSG:3857) | https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi |
| nowCOAST WMS | https://nowcoast.noaa.gov/geoserver/satellite/wms |
| MRMS Viewer | https://mrms.nssl.noaa.gov/qvs/product_viewer/ |
| MRMS AWS | s3://noaa-mrms-pds |
| NEXRAD AWS | s3://unidata-nexrad-level2-chunks |
| RainViewer API | https://www.rainviewer.com/api.html |
| ABI Bands Guide | https://www.goes-r.gov/mission/ABI-bands-quick-info.html |

---

### Next Steps
- [ ] Test NASA GIBS for GEOCOLOR true color tiles
- [ ] Verify GIBS works with MapLibre globe projection
- [ ] Compare GIBS vs nowCOAST for visual quality
- [ ] Decide: RainViewer vs MRMS for radar layer
