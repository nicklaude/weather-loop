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

// Convert unix timestamp to ISO8601 format for NASA GIBS (round to 10min intervals)
function formatGibsTimestamp(unixTime: number): string {
  // GIBS GOES updates every 10 minutes, round to nearest 10 min
  const date = new Date(unixTime * 1000);
  const minutes = Math.floor(date.getUTCMinutes() / 10) * 10;
  date.setUTCMinutes(minutes, 0, 0);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z'); // e.g., "2026-02-22T22:00:00Z"
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [radarFrames, setRadarFrames] = useState<RainViewerFrame[]>([]);
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
  const [showIemAnimated, setShowIemAnimated] = useState(false); // IEM Animated NEXRAD composite
  const [showNwsRadar, setShowNwsRadar] = useState(false); // NWS official radar
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
          // GOES GeoColor - true color satellite from NASA GIBS (10 min updates, no referer issues)
          // Uses GOES-East for Eastern US coverage - auto-defaults to latest available time
          'goes-geocolor': {
            type: 'raster',
            tiles: [
              'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png'
            ],
            tileSize: 256,
            maxzoom: 7,
            attribution: '© NASA GIBS GOES-East',
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
          // Enhanced IR - GOES Band13 Clean Infrared from NASA GIBS (no referer issues)
          'ir-enhanced': {
            type: 'raster',
            tiles: [
              'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png'
            ],
            tileSize: 256,
            maxzoom: 6,
            attribution: '© NASA GIBS GOES-East IR',
          },
          // IEM Animated NEXRAD - composite radar with 50 min history, updates every 5 min
          // Good alternative to RainViewer to reduce rate limiting
          'iem-animated': {
            type: 'raster',
            tiles: [
              'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© Iowa Environmental Mesonet',
          },
          // NWS Radar - official NOAA radar via WMS (alternative source)
          'nws-radar': {
            type: 'raster',
            tiles: [
              'https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES='
            ],
            tileSize: 256,
            attribution: '© NWS',
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
          // IEM Animated NEXRAD layer - alternative to RainViewer
          {
            id: 'iem-animated-layer',
            type: 'raster',
            source: 'iem-animated',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.75,
            },
          },
          // NWS official radar layer
          {
            id: 'nws-radar-layer',
            type: 'raster',
            source: 'nws-radar',
            minzoom: 0,
            maxzoom: 10,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.75,
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

  // Note: GOES timestamps are no longer fetched from SSEC API
  // NASA GIBS supports time-synced tiles directly using ISO8601 timestamps
  // The goesTimestamps state is no longer needed - we derive times from radar frames

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

  // Update GOES GeoColor tiles when slider moves (sync with radar time)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length === 0) return;

    const currentFrame = radarFrames[currentFrameIndex];
    if (!currentFrame) return;

    // Convert radar timestamp to GIBS ISO8601 format (rounded to 10min)
    const gibsTime = formatGibsTimestamp(currentFrame.time);

    // Build the time-specific NASA GIBS tile URL
    // Note: GIBS will auto-fallback to nearest available time if exact time doesn't exist
    const goesUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/${gibsTime}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`;

    try {
      if (map.getSource('goes-geocolor')) {
        (map.getSource('goes-geocolor') as maplibregl.RasterTileSource).setTiles([goesUrl]);
      }
    } catch (err) {
      console.error('Failed to update GOES GeoColor tiles:', err);
    }
  }, [radarFrames, currentFrameIndex]);

  // Update KBOX radar tiles when slider moves (use IEM historical tiles)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || radarFrames.length === 0) return;

    const currentFrame = radarFrames[currentFrameIndex];
    if (!currentFrame) return;

    // Convert unix timestamp to IEM format: YYYYMMDDHHmm (UTC)
    const date = new Date(currentFrame.time * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const iemTimestamp = `${year}${month}${day}${hour}${min}`;

    // Build the time-specific KBOX tile URL
    // Format: ridge::BOX-N0Q-{timestamp}/z/x/y.png
    const kboxUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::BOX-N0Q-${iemTimestamp}/{z}/{x}/{y}.png`;

    try {
      if (map.getSource('kbox-radar')) {
        (map.getSource('kbox-radar') as maplibregl.RasterTileSource).setTiles([kboxUrl]);
      }
    } catch (err) {
      console.error('Failed to update KBOX tiles:', err);
    }
  }, [radarFrames, currentFrameIndex]);

  // Animation loop - use longer interval to avoid CORS/rate limit issues
  useEffect(() => {
    if (!isPlaying || radarFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex(prev => (prev + 1) % radarFrames.length);
    }, 800); // 800ms between frames to avoid rate limiting

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

  // Toggle IEM Animated NEXRAD visibility
  const toggleIemAnimated = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showIemAnimated;
    setShowIemAnimated(newVisibility);
    try {
      if (map.getLayer('iem-animated-layer')) {
        map.setLayoutProperty('iem-animated-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle IEM Animated:', err);
    }
  }, [showIemAnimated]);

  // Toggle NWS Radar visibility
  const toggleNwsRadar = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const newVisibility = !showNwsRadar;
    setShowNwsRadar(newVisibility);
    try {
      if (map.getLayer('nws-radar-layer')) {
        map.setLayoutProperty('nws-radar-layer', 'visibility', newVisibility ? 'visible' : 'none');
      }
    } catch (err) {
      console.error('Failed to toggle NWS Radar:', err);
    }
  }, [showNwsRadar]);

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
      {/* Layer Controls - Compact text buttons */}
      <div className="layer-controls">
        <button
          className={`layer-text-btn ${showTrueColor ? 'active' : ''}`}
          onClick={toggleTrueColor}
          title="EOX Sentinel-2 True Color Base"
        >
          EOX
        </button>

        <button
          className={`layer-text-btn ${showSatellite ? 'active' : ''}`}
          onClick={toggleSatellite}
          title="nowCOAST Visible Satellite"
        >
          SAT
        </button>

        <button
          className={`layer-text-btn ${showCloudLayer ? 'active' : ''}`}
          onClick={toggleCloudLayer}
          title="NOAA Cloud Infrared"
        >
          IR
        </button>

        <button
          className={`layer-text-btn ${showGoesGeocolor ? 'active' : ''}`}
          onClick={toggleGoesGeocolor}
          title="GOES GeoColor True Color"
        >
          GOES
        </button>

        <button
          className={`layer-text-btn ${showIrEnhanced ? 'active' : ''}`}
          onClick={toggleIrEnhanced}
          title="GOES Enhanced IR"
        >
          GIR
        </button>

        <button
          className={`layer-text-btn ${showTestLayer ? 'active' : ''}`}
          onClick={toggleTestLayer}
          title="NASA GIBS VIIRS Daily"
        >
          VIIRS
        </button>

        <div className="layer-divider" />

        <button
          className={`layer-text-btn ${showRadar ? 'active' : ''}`}
          onClick={toggleRadar}
          title="RainViewer NEXRAD (animated)"
        >
          RAIN
        </button>

        <button
          className={`layer-text-btn ${showKbox ? 'active' : ''}`}
          onClick={toggleKbox}
          title="KBOX Boston Radar"
        >
          KBOX
        </button>

        <button
          className={`layer-text-btn ${showMrms ? 'active' : ''}`}
          onClick={toggleMrms}
          title="MRMS Composite Radar"
        >
          MRMS
        </button>

        <button
          className={`layer-text-btn ${showIemAnimated ? 'active' : ''}`}
          onClick={toggleIemAnimated}
          title="IEM NEXRAD Composite (live)"
        >
          IEM
        </button>

        <button
          className={`layer-text-btn ${showNwsRadar ? 'active' : ''}`}
          onClick={toggleNwsRadar}
          title="NWS Official Radar"
        >
          NWS
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
