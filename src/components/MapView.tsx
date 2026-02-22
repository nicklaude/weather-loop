import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RefreshCw } from 'lucide-react';
import './MapView.css';

// RainViewer API for pre-tiled radar
interface RainViewerFrame {
  time: number;
  path: string;
}

interface RainViewerData {
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
}

// SSEC RealEarth GOES timestamp format: "20260222.214117" -> unix timestamp
function parseGoesTimestamp(ts: string): number {
  // Format: YYYYMMDD.hhmmss
  const year = parseInt(ts.slice(0, 4));
  const month = parseInt(ts.slice(4, 6)) - 1;
  const day = parseInt(ts.slice(6, 8));
  const hour = parseInt(ts.slice(9, 11));
  const min = parseInt(ts.slice(11, 13));
  const sec = parseInt(ts.slice(13, 15));
  return new Date(Date.UTC(year, month, day, hour, min, sec)).getTime() / 1000;
}

// Convert unix timestamp to GOES tile URL date/time format
function formatGoesTimestamp(ts: string): { date: string; time: string } {
  // ts format: "20260222.214117"
  return {
    date: ts.slice(0, 8), // "20260222"
    time: ts.slice(9),     // "214117"
  };
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [radarFrames, setRadarFrames] = useState<RainViewerFrame[]>([]);
  const [goesTimestamps, setGoesTimestamps] = useState<string[]>([]); // GOES GeoColor timestamps
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [showSatellite, setShowSatellite] = useState(false); // Grayscale satellite OFF by default
  const [showRadar, setShowRadar] = useState(true); // Default ON - matches layer default
  const [showTrueColor, setShowTrueColor] = useState(true); // EOX Sentinel-2 true color base, ON by default
  const [showTestLayer, setShowTestLayer] = useState(false); // Test layer for experiments (VIIRS)
  const [showCloudLayer, setShowCloudLayer] = useState(false); // Cloud infrared layer
  const [showKbox, setShowKbox] = useState(false); // KBOX Boston radar
  const [showGoesGeocolor, setShowGoesGeocolor] = useState(false); // GOES GeoColor true color
  const [showMrms, setShowMrms] = useState(false); // MRMS high-res composite radar
  const [showIrEnhanced, setShowIrEnhanced] = useState(false); // Enhanced IR satellite
  const [error, setError] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: false, // Hide the info button
      style: {
        version: 8,
        name: 'Weather Loop',
        projection: { type: 'globe' },
        sources: {
          // Dark base map with labels
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© CARTO',
          },
          // nowCOAST GOES visible satellite (grayscale but works from web)
          'goes-satellite': {
            type: 'raster',
            tiles: [
              'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_visible_imagery&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true'
            ],
            tileSize: 256,
            attribution: '© NOAA nowCOAST',
          },
          // EOX Sentinel-2 Cloudless - TRUE COLOR satellite (annual composite, no auth)
          'eox-sentinel2': {
            type: 'raster',
            tiles: [
              'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
            ],
            tileSize: 256,
            maxzoom: 14,
            attribution: '© EOX Sentinel-2 Cloudless',
          },
          // NASA GIBS VIIRS True Color - daily satellite (NO stitching gaps unlike MODIS!)
          'gibs-viirs': {
            type: 'raster',
            tiles: [
              `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${new Date(Date.now() - 86400000).toISOString().split('T')[0]}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
            ],
            tileSize: 256,
            maxzoom: 9,
            attribution: '© NASA GIBS VIIRS',
          },
          // NOAA nowCOAST infrared satellite - shows cloud patterns (5 min updates)
          'nowcoast-ir': {
            type: 'raster',
            tiles: [
              'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true'
            ],
            tileSize: 256,
            attribution: '© NOAA nowCOAST IR',
          },
          // KBOX - Boston's local NEXRAD radar via Iowa Environmental Mesonet
          'kbox-radar': {
            type: 'raster',
            tiles: [
              'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::BOX-N0Q-0/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© Iowa Environmental Mesonet',
          },
          // GOES GeoColor - true color satellite from SSEC RealEarth (5 min updates)
          // Tiles are added dynamically with time parameter
          'goes-geocolor': {
            type: 'raster',
            tiles: [
              'https://realearth.ssec.wisc.edu/tiles/G19-ABI-CONUS-geo-color/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 7,
            attribution: '© SSEC RealEarth',
          },
          // MRMS - Multi-Radar Multi-Sensor composite (143 radars, 1km resolution)
          'mrms-radar': {
            type: 'raster',
            tiles: [
              'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-n1p-900913/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© IEM MRMS',
          },
          // Enhanced IR - better cloud visualization
          'ir-enhanced': {
            type: 'raster',
            tiles: [
              'https://realearth.ssec.wisc.edu/tiles/G19-ABI-CONUS-band13/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 7,
            attribution: '© SSEC RealEarth IR',
          },
        },
        layers: [
          {
            id: 'base-dark',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 18,
          },
          // EOX true color base layer (below satellite) - ON by default
          {
            id: 'eox-truecolor-layer',
            type: 'raster',
            source: 'eox-sentinel2',
            minzoom: 0,
            maxzoom: 14,
            paint: {
              'raster-opacity': 0.9,
            },
          },
          // GOES satellite (grayscale, on top of EOX)
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'goes-satellite',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.7,
            },
          },
          // Test layer - VIIRS true color (no stitching gaps!)
          {
            id: 'test-layer',
            type: 'raster',
            source: 'gibs-viirs',
            minzoom: 0,
            maxzoom: 9,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.85,
            },
          },
          // Cloud layer - infrared imagery (thermal, shows clouds)
          {
            id: 'cloud-layer',
            type: 'raster',
            source: 'nowcoast-ir',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.7,
            },
          },
          // KBOX Boston radar layer
          {
            id: 'kbox-layer',
            type: 'raster',
            source: 'kbox-radar',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.8,
            },
          },
          // GOES GeoColor true color layer
          {
            id: 'geocolor-layer',
            type: 'raster',
            source: 'goes-geocolor',
            minzoom: 0,
            maxzoom: 7,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.9,
            },
          },
          // MRMS high-res composite radar layer
          {
            id: 'mrms-layer',
            type: 'raster',
            source: 'mrms-radar',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.75,
            },
          },
          // Enhanced IR satellite layer
          {
            id: 'ir-enhanced-layer',
            type: 'raster',
            source: 'ir-enhanced',
            minzoom: 0,
            maxzoom: 7,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.8,
            },
          },
        ],
      },
      center: [-71.0589, 42.3601], // Boston
      zoom: 5,
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      setIsLoading(false);
    });

    map.on('error', (e) => {
      console.error('Map error:', e);
      // Don't show error for tile loading issues
      if (!e.error?.message?.includes('tile')) {
        setError(e.error?.message || 'Map loading error');
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fetch radar frames from RainViewer
  useEffect(() => {
    const fetchRadarFrames = async () => {
      try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!response.ok) throw new Error('Failed to fetch radar data');
        const data: RainViewerData = await response.json();
        const frames = [...data.radar.past, ...data.radar.nowcast];
        setRadarFrames(frames);
        setCurrentFrameIndex(data.radar.past.length - 1); // Start at most recent actual
      } catch (err) {
        console.error('Failed to fetch radar frames:', err);
        // Don't show error to user, radar is optional
      }
    };

    fetchRadarFrames();
    // Refresh radar data every 5 minutes
    const interval = setInterval(fetchRadarFrames, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch GOES GeoColor timestamps from SSEC RealEarth
  useEffect(() => {
    const fetchGoesTimestamps = async () => {
      try {
        const response = await fetch('https://realearth.ssec.wisc.edu/api/times?products=G19-ABI-CONUS-geo-color');
        if (!response.ok) throw new Error('Failed to fetch GOES timestamps');
        const data = await response.json();
        const timestamps = data['G19-ABI-CONUS-geo-color'] || [];
        setGoesTimestamps(timestamps);
        console.log(`Loaded ${timestamps.length} GOES timestamps`);
      } catch (err) {
        console.error('Failed to fetch GOES timestamps:', err);
      }
    };

    fetchGoesTimestamps();
    // Refresh every 5 minutes
    const interval = setInterval(fetchGoesTimestamps, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Add/update radar layer when frames change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length === 0) return;

    const currentFrame = radarFrames[currentFrameIndex];
    if (!currentFrame) return;

    // Color scheme 2 = original, smooth=1, snow=1
    const radarUrl = `https://tilecache.rainviewer.com${currentFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    try {
      if (map.getSource('radar')) {
        // Update existing source
        (map.getSource('radar') as maplibregl.RasterTileSource).setTiles([radarUrl]);
      } else {
        // Add radar source and layer
        map.addSource('radar', {
          type: 'raster',
          tiles: [radarUrl],
          tileSize: 256,
        });

        map.addLayer({
          id: 'radar-layer',
          type: 'raster',
          source: 'radar',
          minzoom: 0,
          maxzoom: 7, // RainViewer only provides tiles up to zoom 7
          paint: {
            'raster-opacity': 0.75,
          },
        });
      }
    } catch (err) {
      console.error('Failed to update radar layer:', err);
    }
  }, [radarFrames, currentFrameIndex]);

  // Update GOES GeoColor tiles when slider moves (snap to nearest available timestamp)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length === 0 || goesTimestamps.length === 0) return;

    const currentFrame = radarFrames[currentFrameIndex];
    if (!currentFrame) return;

    // Find the nearest GOES timestamp to the current radar time
    const targetTime = currentFrame.time;
    let nearestIdx = 0;
    let nearestDiff = Infinity;

    for (let i = 0; i < goesTimestamps.length; i++) {
      const goesTime = parseGoesTimestamp(goesTimestamps[i]);
      const diff = Math.abs(goesTime - targetTime);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIdx = i;
      }
    }

    const nearestTimestamp = goesTimestamps[nearestIdx];
    const { date, time } = formatGoesTimestamp(nearestTimestamp);

    // Build the time-specific tile URL
    // Format: /tiles/PRODUCT/YYYYMMDD/hhmmss/z/x/y.png
    const goesUrl = `https://realearth.ssec.wisc.edu/tiles/G19-ABI-CONUS-geo-color/${date}/${time}/{z}/{x}/{y}.png`;

    try {
      if (map.getSource('goes-geocolor')) {
        (map.getSource('goes-geocolor') as maplibregl.RasterTileSource).setTiles([goesUrl]);
      }
    } catch (err) {
      console.error('Failed to update GOES GeoColor tiles:', err);
    }
  }, [radarFrames, currentFrameIndex, goesTimestamps]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || radarFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex(prev => (prev + 1) % radarFrames.length);
    }, 600); // Slower animation to reduce tile requests

    return () => clearInterval(interval);
  }, [isPlaying, radarFrames.length]);

  // Toggle satellite visibility
  const toggleSatellite = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showSatellite;
    setShowSatellite(newVisibility);
    try {
      map.setLayoutProperty('satellite-layer', 'visibility', newVisibility ? 'visible' : 'none');
    } catch (err) {
      console.error('Failed to toggle satellite:', err);
    }
  }, [showSatellite]);

  // Toggle radar visibility
  const toggleRadar = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showRadar;
    setShowRadar(newVisibility);
    try {
      if (map.getLayer('radar-layer')) {
        map.setLayoutProperty('radar-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle radar:', err);
    }
  }, [showRadar]);

  // Toggle EOX Sentinel-2 true color layer visibility
  const toggleTrueColor = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showTrueColor;
    setShowTrueColor(newVisibility);
    try {
      if (map.getLayer('eox-truecolor-layer')) {
        map.setLayoutProperty('eox-truecolor-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle true color:', err);
    }
  }, [showTrueColor]);

  // Toggle test layer visibility (NASA GIBS VIIRS - no stitching!)
  const toggleTestLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showTestLayer;
    setShowTestLayer(newVisibility);
    try {
      if (map.getLayer('test-layer')) {
        map.setLayoutProperty('test-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle test layer:', err);
    }
  }, [showTestLayer]);

  // Toggle cloud layer visibility (NOAA infrared)
  const toggleCloudLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showCloudLayer;
    setShowCloudLayer(newVisibility);
    try {
      if (map.getLayer('cloud-layer')) {
        map.setLayoutProperty('cloud-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle cloud layer:', err);
    }
  }, [showCloudLayer]);

  // Toggle KBOX Boston radar visibility
  const toggleKbox = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showKbox;
    setShowKbox(newVisibility);
    try {
      if (map.getLayer('kbox-layer')) {
        map.setLayoutProperty('kbox-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle KBOX:', err);
    }
  }, [showKbox]);

  // Toggle GOES GeoColor visibility
  const toggleGoesGeocolor = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showGoesGeocolor;
    setShowGoesGeocolor(newVisibility);
    try {
      if (map.getLayer('geocolor-layer')) {
        map.setLayoutProperty('geocolor-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle GeoColor:', err);
    }
  }, [showGoesGeocolor]);

  // Toggle MRMS radar visibility
  const toggleMrms = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showMrms;
    setShowMrms(newVisibility);
    try {
      if (map.getLayer('mrms-layer')) {
        map.setLayoutProperty('mrms-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle MRMS:', err);
    }
  }, [showMrms]);

  // Toggle Enhanced IR visibility
  const toggleIrEnhanced = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showIrEnhanced;
    setShowIrEnhanced(newVisibility);
    try {
      if (map.getLayer('ir-enhanced-layer')) {
        map.setLayoutProperty('ir-enhanced-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle Enhanced IR:', err);
    }
  }, [showIrEnhanced]);

  // Get timestamp for current frame
  const getCurrentTimestamp = () => {
    if (radarFrames.length === 0) return '';
    const frame = radarFrames[currentFrameIndex];
    if (!frame) return '';
    const date = new Date(frame.time * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Check if current frame is a forecast (nowcast)
  const isForecast = () => {
    if (radarFrames.length === 0) return false;
    const pastFrames = radarFrames.filter(f => f.time <= Date.now() / 1000);
    return currentFrameIndex >= pastFrames.length;
  };

  return (
    <div className="map-view">
      {/* Layer Controls - Icon buttons */}
      <div className="layer-controls">
        <button
          className={`layer-icon-btn ${showSatellite ? 'active' : ''}`}
          onClick={toggleSatellite}
          title="Satellite (nowCOAST visible)"
        >
          🛰️
        </button>

        <button
          className={`layer-icon-btn ${showRadar ? 'active' : ''}`}
          onClick={toggleRadar}
          title="Radar (NEXRAD)"
        >
          🌧️
        </button>

        <button
          className={`layer-icon-btn ${showTrueColor ? 'active' : ''}`}
          onClick={toggleTrueColor}
          title="True Color Base (EOX Sentinel-2)"
        >
          🌍
        </button>

        <button
          className={`layer-icon-btn ${showCloudLayer ? 'active' : ''}`}
          onClick={toggleCloudLayer}
          title="Cloud Infrared (NOAA)"
        >
          ☁️
        </button>

        <button
          className={`layer-icon-btn test-btn ${showTestLayer ? 'active' : ''}`}
          onClick={toggleTestLayer}
          title="Test Layer (NASA GIBS VIIRS)"
        >
          🧪
        </button>

        {/* New layers - all off by default */}
        <button
          className={`layer-icon-btn ${showKbox ? 'active' : ''}`}
          onClick={toggleKbox}
          title="KBOX Boston Radar"
        >
          📡
        </button>

        <button
          className={`layer-icon-btn ${showGoesGeocolor ? 'active' : ''}`}
          onClick={toggleGoesGeocolor}
          title="GOES GeoColor (5 min)"
        >
          🌎
        </button>

        <button
          className={`layer-icon-btn ${showMrms ? 'active' : ''}`}
          onClick={toggleMrms}
          title="MRMS Composite Radar"
        >
          🔬
        </button>

        <button
          className={`layer-icon-btn ${showIrEnhanced ? 'active' : ''}`}
          onClick={toggleIrEnhanced}
          title="Enhanced IR Satellite"
        >
          🌊
        </button>
      </div>

      {/* Radar Legend */}
      {showRadar && (
        <div className="radar-legend">
          <div className="legend-title">Reflectivity (dBZ)</div>
          <div className="legend-bar">
            <div className="legend-gradient" />
            <div className="legend-labels">
              <span>5</span>
              <span>20</span>
              <span>35</span>
              <span>50</span>
              <span>65+</span>
            </div>
          </div>
          <div className="legend-desc">
            <span>Light</span>
            <span>Heavy</span>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={containerRef} className="map-container">
        {isLoading && (
          <div className="map-loading">
            <RefreshCw size={32} className="spinning" />
            <span>Loading map...</span>
          </div>
        )}
        {error && (
          <div className="map-error">
            <span>Error: {error}</span>
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="playback-bar">
        <button
          className={`play-btn ${isPlaying ? 'playing' : ''}`}
          onClick={() => setIsPlaying(p => !p)}
          disabled={radarFrames.length === 0}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶️'}
        </button>

        <div className="time-display">
          <span className="time-value">{getCurrentTimestamp() || '--:--'}</span>
          {isForecast() && <span className="forecast-badge">Forecast</span>}
        </div>

        {radarFrames.length > 0 && (
          <input
            type="range"
            className="time-slider"
            min={0}
            max={radarFrames.length - 1}
            value={currentFrameIndex}
            onChange={(e) => setCurrentFrameIndex(Number(e.target.value))}
          />
        )}

        <span className="frame-count">
          {radarFrames.length > 0 ? `${currentFrameIndex + 1}/${radarFrames.length}` : '...'}
        </span>
      </div>

    </div>
  );
}
