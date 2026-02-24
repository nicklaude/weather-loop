# GeoColor Exploration Notes

**Date:** 2026-02-23
**Goal:** Build a custom GeoColor pipeline to produce higher-quality satellite imagery than NOAA's pre-rendered output.
**Outcome:** NOAA's official GeoColor from their CDN is already superior. Custom pipeline is useful only for orthographic projection and specialized composites.

---

## Table of Contents

1. [Background: What is GeoColor?](#background-what-is-geocolor)
2. [The Goal](#the-goal)
3. [Approaches Tried](#approaches-tried)
4. [Implementation Details](#implementation-details)
5. [Quality Comparisons](#quality-comparisons)
6. [Key Learnings](#key-learnings)
7. [Final Recommendation](#final-recommendation)
8. [File Index](#file-index)

---

## Background: What is GeoColor?

GeoColor is a blended RGB composite developed by NOAA for GOES-R satellites. It provides intuitive "true color" imagery during the day and infrared-based cloud visualization at night.

### Reference Paper

**Miller et al. (2020) "GeoColor: A Blending Technique for Satellite Imagery"**
Journal of Atmospheric and Oceanic Technology, Vol 37
DOI: 10.1175/JTECH-D-19-0134.1

### Algorithm Overview

**Daytime (Solar Zenith Angle < 78°):**
- True color composite from ABI bands:
  - C01 (0.47 μm) - Blue
  - C02 (0.64 μm) - Red
  - C03 (0.86 μm) - Near-IR, used to simulate Green (vegetation correction)
- Rayleigh scattering correction
- Solar zenith angle normalization
- **Key innovation:** Satellite data composited OVER Blue Marble background with transparency
  - Dark ocean areas become transparent, revealing Blue Marble's shallow water coloring
  - This is why Bahamas/Caribbean show turquoise in official GeoColor

**Nighttime (Solar Zenith Angle > 88°):**
- Three-layer stack:
  1. **High-level clouds:** IR window channel (C13/10.3μm), cold temps → white/opaque
  2. **Low-level clouds:** Split window (C13 - C07), fog/stratus → light blue
  3. **City lights:** NASA Black Marble VIIRS data (static background)

**Terminator (78° < SZA < 88°):**
- Cosine-weighted blend between day and night composites
- Weight formula: `(cos(SZA) - cos(88°)) / (cos(78°) - cos(88°))`

---

## The Goal

Build our own GeoColor pipeline to:
1. Get higher resolution than NOAA's pre-rendered images
2. Have control over color grading
3. Render orthographic projection (view from space) - which NOAA doesn't offer
4. Potentially fresher data (direct from AWS instead of CDN delay)

---

## Approaches Tried

### Approach 1: satpy Built-in `geo_color` Composite

**Implementation:** `geocolor_satpy.py`

Satpy has a built-in GeoColor implementation via the `DayNightCompositor`:
- Uses the same Miller et al. algorithm
- Handles Rayleigh correction, solar zenith blending
- Outputs to any projection via pyresample

**Process:**
```python
from satpy import Scene
scn = Scene(reader='abi_l1b', filenames=goes_files)
scn.load(['geo_color'])
local_scn = scn.resample(area_def)
local_scn.save_dataset('geo_color', 'output.tif', writer='geotiff')
```

**Result:** ⭐ 6/10
- Technically correct
- Colors washed out compared to official NOAA
- Land appears gray/muted
- Ocean too dark
- Missing the "pop" of official imagery

### Approach 2: Post-Processing Enhancement

**Implementation:** `enhance_geocolor.py`

Applied Photoshop-style corrections to satpy output:
1. Levels adjustment (black/white points, gamma)
2. Remove yellow-green color cast
3. Enhance ocean blues selectively
4. S-curve contrast boost
5. Saturation increase (+25%)
6. Unsharp mask sharpening

**Result:** ⭐ 8.5/10
- Much better than raw satpy
- Still not matching official NOAA colors exactly
- Land coloring still slightly off
- Required manual tuning of parameters

### Approach 3: Blue Marble Background Compositing

**Implementation:** `geocolor_blue_marble.py`

Implemented the key insight from the Miller paper: satellite data is composited OVER Blue Marble, not shown standalone.

**Process:**
1. Download NASA Blue Marble with shallow water bathymetry
2. Extract region matching satellite coverage
3. Create alpha mask from satellite brightness (dark = transparent)
4. Composite: `satellite * alpha + blue_marble * (1 - alpha)`
5. Continue with normal day/night blending

**Key files:**
- `blue_marble/land_shallow_topo_8192.tif` - 8192x4096 Blue Marble with shallow water
- From NASA: https://visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography

**Result:** ⭐ 8.0/10
- Shallow water turquoise visible (Bahamas, Caribbean)
- Better than raw satpy
- But land colors still not matching NOAA's tuning

### Approach 4: Orthographic Projection (View from Space)

**Implementation:** `geocolor_blue_marble.py --region ortho`

For orthographic projection (looking at Earth from space), simple lat/lon region extraction doesn't work. Required proper reprojection using pyresample.

**Process:**
```python
from pyresample import create_area_def
from pyresample.kd_tree import resample_nearest

# Target orthographic projection centered on US
area_def = create_area_def(
    'ortho_us',
    {'proj': 'ortho', 'lat_0': 35.0, 'lon_0': -90.0},
    width=4000, height=4000,
    area_extent=(-6500000, -6500000, 6500000, 6500000),
    units='m'
)

# Reproject Blue Marble from EPSG:4326 to ortho
reprojected = resample_nearest(source_area, data, area_def, radius_of_influence=50000)
```

**Result:**
- Orthographic works correctly
- 62.1% satellite coverage from GOES-19
- 37.9% polar gaps filled with Blue Marble
- Minor seam visible at ~40°N where satellite data ends
- Output: `geocolor_ortho_v2.png` (4000x4000)

---

## Implementation Details

### Data Sources

**GOES-19 Raw Data (AWS S3):**
```
s3://noaa-goes19/ABI-L1b-RadF/{year}/{day_of_year}/{hour}/
```

Required bands:
| Band | Wavelength | Purpose |
|------|------------|---------|
| C01 | 0.47 μm | Blue visible |
| C02 | 0.64 μm | Red visible |
| C03 | 0.86 μm | Near-IR (simulated green) |
| C07 | 3.9 μm | Shortwave IR (low clouds) |
| C13 | 10.3 μm | IR window (high clouds) |

**Blue Marble:**
- Source: https://neo.gsfc.nasa.gov/ or https://visibleearth.nasa.gov/
- `land_shallow_topo_8192.tif` - includes bathymetry for shallow water rendering
- `world.200402.3x5400x2700.png` - standard Blue Marble

### Python Dependencies

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "satpy[all]",
#     "pyresample",
#     "pyspectral",
#     "fsspec",
#     "s3fs",
#     "pillow",
#     "numpy",
#     "rasterio",
#     "rioxarray",
#     "scipy",
#     "pyorbital",
# ]
# ///
```

### Key Technical Challenges

1. **Color Normalization:** satpy outputs reflectance as 0-100+%, need to normalize to 0-1 and apply cira_stretch:
   ```python
   true_color = true_color / 100.0
   log_root = np.log10(0.0223)
   denom = (1.0 - log_root) * 0.75
   true_color = (np.log10(true_color) - log_root) / denom
   ```

2. **Projection Alignment:** Blue Marble is EPSG:4326 (equirectangular), satellite is geostationary. For orthographic, need proper pyresample reprojection.

3. **Ocean Transparency:** Creating alpha mask from brightness to allow Blue Marble to show through:
   ```python
   brightness = np.mean(true_color, axis=0)
   alpha = (brightness - 0.08) / (0.25 - 0.08)  # dark = transparent
   alpha = np.clip(alpha, 0, 1)
   ```

4. **Gap Filling:** GOES-19 doesn't cover polar regions. Need to detect NaN areas and fill with Blue Marble.

---

## Quality Comparisons

### Side-by-Side Comparison (Same Time)

| Aspect | NOAA CDN | Our Pipeline |
|--------|----------|--------------|
| Land colors | Vibrant greens/browns | Muted, grayish |
| Ocean | Deep blue | Darker, less saturated |
| Clouds | Crisp white | Similar |
| Overall contrast | High | Lower |
| Shallow water | Turquoise visible | Turquoise visible (with Blue Marble) |

### Comparison Images Generated

- `comparison.png` - NOAA CDN vs NASA GIBS
- `satpy_vs_official_comparison.png` - satpy output vs NOAA
- `enhanced_vs_official_comparison.png` - enhanced satpy vs NOAA
- `blue_marble_vs_official_comparison.png` - Blue Marble composite vs NOAA

**Verdict:** NOAA's official output has years of color tuning. Our custom pipeline produces technically correct imagery but lacks the polished look.

---

## Key Learnings

### 1. NOAA Has Already Optimized This

The GeoColor product from `cdn.star.nesdis.noaa.gov` is the result of years of algorithm tuning by NOAA scientists. Matching their quality requires:
- Precise color LUTs
- Regional adjustments
- Careful handling of edge cases (terminator, glint, etc.)

### 2. satpy's `geo_color` is Technically Correct but Unpolished

The satpy implementation follows the algorithm but doesn't include NOAA's proprietary color tuning. It's a good starting point but needs post-processing.

### 3. Blue Marble Integration is the Secret Sauce

The turquoise shallow water in official GeoColor isn't from the satellite - it's from compositing over Blue Marble. This is clearly stated in the Miller paper but easy to miss.

### 4. Orthographic Projection Requires Custom Pipeline

NOAA doesn't offer orthographic GeoColor renders. If you need a "view from space" globe visualization, you must build your own pipeline. Our implementation works and fills polar gaps with Blue Marble.

### 5. For Web Apps, Use NOAA's CDN

For basic weather visualization:
- NOAA CDN: Fast, reliable, polished colors
- Our pipeline: Only needed for custom projections or composites

---

## Final Recommendation

### For the Weather Loop App

**Use NOAA's CDN for the main loop viewer.**
- URL: `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/{SECTOR}/GEOCOLOR/`
- Sectors: FD, CONUS, ne, se, car, pr, cgl, umv, sr, sp, mex
- Already optimized, fast, reliable

**Use our custom pipeline only for:**
1. Orthographic globe projection
2. Custom radar overlays on satellite
3. Specialized composites not offered by NOAA

### If Reviving Custom Pipeline

1. Start with `geocolor_blue_marble.py --region ortho`
2. Ensure Blue Marble with shallow water is downloaded
3. Post-process with `enhance_geocolor.py` for better colors
4. Consider Gemini Vision Pro for objective quality evaluation

---

## File Index

### Scripts (Uncommitted)

| File | Purpose |
|------|---------|
| `geocolor_satpy.py` | satpy built-in GeoColor implementation |
| `geocolor_blue_marble.py` | Full GeoColor with Blue Marble background + ortho support |
| `enhance_geocolor.py` | Post-processing to improve satpy output |
| `compare_goes_sources.py` | Compare NOAA CDN vs NASA GIBS |
| `compare_satpy_vs_official.py` | Compare our output vs official |
| `compare_enhanced_vs_official.py` | Compare enhanced output vs official |
| `compare_blue_marble_vs_official.py` | Compare Blue Marble composite vs official |
| `fetch_goes.py` | Simple GOES data downloader |
| `satpy_goes.py` | Earlier satpy exploration |

### Data Files (Uncommitted)

| File | Description |
|------|-------------|
| `goes_cache/` | Cached GOES band files from AWS |
| `blue_marble/land_shallow_topo_8192.tif` | 8K Blue Marble with bathymetry |
| `blue_marble/land_shallow_topo_2048.tif` | 2K preview |
| `geocolor_ortho_v2.png` | Latest orthographic output (4000x4000) |
| `geocolor_output.png` | satpy CONUS output |
| `geocolor_blue_marble_output.png` | Blue Marble composite output |

### Reference

| File | Description |
|------|-------------|
| `geocolor_paper.pdf` | Miller et al. (2020) GeoColor paper |
| `noaa_cdn_geocolor.jpg` | Official NOAA reference |
| `nasa_gibs_geocolor.jpg` | NASA GIBS reference |

---

## Quick Start (If Reviving)

```bash
# 1. Download Blue Marble with shallow water
cd ~/code/weather-loop/blue_marble
curl -O https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_8192.tif

# 2. Generate CONUS GeoColor
uv run geocolor_blue_marble.py --region conus

# 3. Generate orthographic globe view
uv run geocolor_blue_marble.py --region ortho

# 4. Enhance output
uv run enhance_geocolor.py geocolor_blue_marble_output.png --compare
```

---

*Last updated: 2026-02-23*
