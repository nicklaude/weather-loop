# Weather Loop 2.0 - "Monitoring the Situation" Dashboard

## Vision
Transform the current satellite viewer into a full "situational awareness" dashboard with 3D globe visualization and multiple real-time data layers.

## Current State
- ✅ NOAA GOES satellite imagery (12 regions)
- ✅ Progressive frame loading
- ✅ Flat satellite loop view
- ✅ Basic globe.gl integration
- ✅ React Native companion app

## Proposed Architecture

### Phase 1: Core Globe Experience (Week 1)
**Goal:** Make the 3D globe the hero with proper satellite overlay

1. **Satellite Tiles on Globe**
   - Use GOES Full Disk imagery as globe texture
   - Implement proper spherical projection
   - Auto-update texture every 10 minutes
   - Smooth transition between frames

2. **Interactive Controls**
   - Click-to-zoom on regions
   - Double-tap to recenter
   - Pinch zoom on mobile
   - Auto-rotate toggle

3. **UI Polish**
   - Full-screen mode
   - Layer visibility toggles
   - Dark/dramatic aesthetic
   - Timestamp overlay

### Phase 2: Weather Data Layers (Week 2)
**Goal:** Add actionable weather intelligence

1. **Lightning Layer**
   - Source: GOES GLM (Geostationary Lightning Mapper)
   - Visualization: Animated flash points
   - Color: Yellow/white pulsing dots

2. **Hurricane/Storm Tracks**
   - Source: NHC (National Hurricane Center) RSS
   - Visualization: Cone of uncertainty + track line
   - Shows: Name, category, wind speed, movement

3. **Wildfire Hotspots**
   - Source: FIRMS (Fire Information for Resource Management)
   - Visualization: Orange/red heat points
   - Shows: Fire radiative power, detection time

4. **Weather Radar**
   - Source: NEXRAD via Iowa Environmental Mesonet
   - Visualization: Precipitation overlay tiles
   - Shows: Rain/snow intensity

### Phase 3: Global Events Layer (Week 3)
**Goal:** Expand beyond weather to global awareness

1. **Earthquake Activity**
   - Source: USGS Earthquake API
   - Visualization: Circles sized by magnitude
   - Shows: Location, depth, magnitude, time

2. **Flight Traffic** (Optional)
   - Source: ADS-B Exchange or OpenSky
   - Visualization: Moving aircraft icons with trails
   - Shows: Flight number, altitude, speed

3. **Internet/Power Outages**
   - Source: NetBlocks, DownDetector API
   - Visualization: Red overlay on affected areas
   - Shows: Service name, users affected

### Phase 4: Native App Parity (Week 4)
**Goal:** Full feature parity on iOS/Android

1. **React Native Globe**
   - Use react-three-fiber for 3D
   - Or: WebView with web globe (simpler)

2. **Push Notifications**
   - Severe weather alerts
   - Large earthquakes (M5+)
   - Nearby wildfires

3. **Offline Support**
   - Cache recent imagery
   - Store last known state

## Technical Stack

### Web
- Vite + React + TypeScript
- globe.gl for 3D visualization
- Three.js under the hood
- IndexedDB for caching

### Native
- React Native
- Option A: react-three-fiber + drei
- Option B: WebView wrapper
- Push notifications via Firebase

### Data Sources (All Free/Open)
| Layer | Source | Update Frequency | API |
|-------|--------|------------------|-----|
| Satellite | NOAA GOES | 5 min | CDN scrape |
| Lightning | GOES GLM | Real-time | JSON feed |
| Hurricanes | NHC | 6 hours | RSS/XML |
| Wildfires | NASA FIRMS | 3 hours | CSV/JSON |
| Earthquakes | USGS | 1 min | GeoJSON |
| Weather Radar | IEM | 5 min | Tile server |
| Flights | OpenSky | 10 sec | REST API |

## UI/UX Design

### Layout
```
┌─────────────────────────────────────────┐
│  [Layers ▼]  [Region ▼]     [⚙] [⛶]   │  ← Top bar
├─────────────────────────────────────────┤
│                                         │
│                                         │
│            3D GLOBE                     │  ← Main view
│         (full screen)                   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  ⏮  ▶  ⏭  │ 12:30 UTC │ [1x] [2x]    │  ← Timeline
└─────────────────────────────────────────┘
```

### Color Palette
- Background: #0a0a0a (near black)
- Primary: #60a5fa (blue)
- Accent: #34d399 (green)
- Warning: #fbbf24 (yellow)
- Danger: #ef4444 (red)
- Text: #ffffff / #888888

### Interactions
- Drag: Rotate globe
- Scroll/Pinch: Zoom
- Click point: Show details popup
- Click region: Zoom to region
- Long press: Save location

## Success Metrics
1. Loads in < 3 seconds
2. Maintains 60fps rotation
3. Handles 1000+ data points
4. Works offline for 24 hours
5. Mobile-friendly (responsive)

## Open Questions
1. Should we include geopolitical data (conflicts, bases)?
2. Ship tracking - worth the complexity?
3. Premium features (notifications, alerts)?
4. Monetization (ads, pro tier)?

## Next Steps
1. Review this plan (subagent)
2. Prioritize Phase 1 vs jump to cooler features
3. Get user feedback on layer preferences
4. Start implementation
