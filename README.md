# Weather Loop

A 3D globe weather radar viewer built with MapLibre GL JS. View live NEXRAD radar, satellite imagery, and more with smooth animations.

**Live Demo:** https://nicklaude.github.io/weather-loop/

## Features

- **3D Globe View** - MapLibre GL JS 5.x with globe projection
- **Multiple Radar Sources**
  - RainViewer (animated NEXRAD)
  - NWS Official Radar
  - KBOX Boston single-site
  - MRMS composite
  - IEM NEXRAD
- **Satellite Imagery**
  - EOX Sentinel-2 true color base
  - GOES-East/West GeoColor
  - VIIRS daily
  - Cloud IR
- **Time Animation** - 2-hour radar history with playback controls
- **Progressive Loading** - Current frame loads first, others load in background

## Architecture

```
Browser ── MapLibre ──► CF Worker Proxy ──► RainViewer/IEM/GIBS
                              │
                         Edge Cache (15min TTL)
```

The app uses a Cloudflare Worker as a tile proxy to:
- Add CORS headers for cross-origin tile sources
- Cache tiles at the edge (300+ global data centers)
- Handle rate limiting gracefully

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Deployment

The app auto-deploys to GitHub Pages on push to `main`.

For the Cloudflare Worker, see [docs/cloudflare-worker.md](docs/cloudflare-worker.md).

## Data Sources

| Source | Data | Update Frequency |
|--------|------|------------------|
| [RainViewer](https://www.rainviewer.com/api.html) | NEXRAD radar tiles | 10 min |
| [NWS](https://www.weather.gov/) | Official radar WMS | 5 min |
| [IEM](https://mesonet.agron.iastate.edu/) | KBOX, MRMS | 5 min |
| [NASA GIBS](https://gibs.earthdata.nasa.gov/) | GOES, VIIRS satellite | 10 min |
| [EOX](https://tiles.maps.eox.at/) | Sentinel-2 base map | Annual |

## License

MIT
