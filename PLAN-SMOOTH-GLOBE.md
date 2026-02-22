# Weather Loop - Smooth 3D Globe Plan

## Goal
Make the 3D globe view work smoothly on iOS Safari with proper pan/zoom gestures.

## Current Issues
1. **iOS Safari WebGL crash** - Globe view crashes Safari completely (WebKit bug #289601)
2. **No smooth pan/zoom** - Controls feel janky on mobile
3. **Button alignment** - Toggle buttons misaligned on mobile

## Research Findings

### iOS WebGL Status
- Known WebKit bug affecting three.js on iOS 17+ (M3/M4 devices, Safari)
- Context loss errors: `gl.getShaderPrecisionFormat()` returns null
- Globe.gl uses three.js under the hood, inherits this bug
- No code-level fix available - it's an Apple bug

### Workaround Options
1. **Use WebGL1 instead of WebGL2** - Safari has better WebGL1 support
2. **Reduce shader complexity** - Use lowp/mediump precision
3. **Defer WebGL init** - Wait for document fully loaded
4. **Handle context loss gracefully** - Reinitialize on context restore
5. **Alternative library** - CesiumJS, MapLibre GL (better mobile support)

## Implementation Plan

### Phase 1: Fix iOS Crash (P0) - 2 days

#### Step 1.1: Force WebGL1
```typescript
new Globe(container, {
  rendererConfig: {
    antialias: true,
    alpha: true,
    precision: 'lowp',           // Lowest precision
    powerPreference: 'low-power', // Reduce GPU load
    preserveDrawingBuffer: true,  // May help context persistence
    context: 'webgl'             // Force WebGL1, not WebGL2
  }
})
```

#### Step 1.2: Add Context Loss Handling
```typescript
const canvas = containerRef.current.querySelector('canvas');
canvas?.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setError('WebGL context lost - tap to reload');
});
canvas?.addEventListener('webglcontextrestored', () => {
  initGlobe(); // Reinitialize
});
```

#### Step 1.3: Lazy Load Globe Component
```typescript
const GlobeView = lazy(() => import('./components/GlobeView'));

// In App.tsx
<Suspense fallback={<GlobeLoadingSpinner />}>
  <GlobeView />
</Suspense>
```

### Phase 2: Smooth Pan/Zoom (P1) - 3 days

#### Step 2.1: Configure OrbitControls for Touch
```typescript
const controls = globe.controls();
controls.enableDamping = true;
controls.dampingFactor = 0.05;        // Smooth deceleration
controls.rotateSpeed = 0.4;           // Slower rotation
controls.zoomSpeed = 0.8;             // Comfortable zoom speed
controls.enablePan = false;           // Disable pan (confusing on globe)
controls.minDistance = 1.5;           // Don't zoom too close
controls.maxDistance = 4;             // Don't zoom too far
controls.autoRotate = false;          // Disable during interaction
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY
};
```

#### Step 2.2: Touch Gesture Handling
- Single finger: rotate globe
- Pinch: zoom in/out with momentum
- Double-tap: zoom to specific region
- Disable Safari's default gestures (bounce, zoom)

```css
.globe-container {
  touch-action: none;          /* Disable browser gestures */
  -webkit-overflow-scrolling: auto;
  overscroll-behavior: none;
}
```

#### Step 2.3: Momentum/Inertia
Add momentum to gestures so globe continues spinning after swipe:
```typescript
controls.enableDamping = true;
controls.dampingFactor = 0.05; // Lower = more momentum
```

### Phase 3: Performance Optimization (P2) - 2 days

#### Step 3.1: Level of Detail (LOD)
- Use lower resolution texture when zoomed out
- Switch to higher resolution when zoomed in
- Preload next resolution level

#### Step 3.2: Frame Rate Limiting
```typescript
// Limit to 30fps on mobile to reduce battery drain
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
if (isMobile) {
  renderer.setAnimationLoop(() => {
    setTimeout(() => {
      controls.update();
      renderer.render(scene, camera);
    }, 1000 / 30); // 30fps
  });
}
```

#### Step 3.3: Texture Compression
- Use compressed textures (KTX2/Basis) for satellite imagery
- Reduce initial load time from ~14MB to ~4MB

### Phase 4: UI Polish (P3) - 1 day

#### Step 4.1: Button Alignment Fix
```css
.view-toggle {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: calc(env(safe-area-inset-right, 0px) + 12px);
}
```

#### Step 4.2: Loading States
- Show globe silhouette while loading
- Progress bar for texture download
- Graceful error messages

## Alternative Approach: MapLibre GL

If globe.gl continues to crash, consider switching to MapLibre GL:
- Better mobile support
- Globe projection available
- Native touch gesture handling
- Smaller bundle size

```typescript
import maplibregl from 'maplibre-gl';

const map = new maplibregl.Map({
  container: 'globe-container',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  projection: 'globe',
  zoom: 2
});

// Add satellite layer
map.addSource('satellite', {
  type: 'raster',
  tiles: ['https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/{z}/{x}/{y}.png'],
  tileSize: 256
});
```

## Success Criteria

1. ✅ Globe loads without crash on iOS Safari 17+
2. ✅ Smooth single-finger rotation (60fps)
3. ✅ Smooth pinch-to-zoom with momentum
4. ✅ No jank or stutter during animation playback
5. ✅ Graceful degradation if WebGL fails

## Timeline

| Phase | Days | Deliverable |
|-------|------|-------------|
| P0: iOS Fix | 2 | Globe loads on iOS without crash |
| P1: Gestures | 3 | Smooth pan/zoom like native app |
| P2: Performance | 2 | 60fps, <5s load time |
| P3: Polish | 1 | Aligned buttons, loading states |
| **Total** | **8 days** | Production-ready 3D globe |

## Risks

1. **WebKit bug unfixable** - May need to wait for Apple fix or use alternative library
2. **Performance on older devices** - May need to disable 3D on iPhone 11 and older
3. **NEXRAD radar complexity** - Spherical projection of radar tiles is hard
