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

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [radarFrames, setRadarFrames] = useState<RainViewerFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [showSatellite, setShowSatellite] = useState(true);
  const [showRadar, setShowRadar] = useState(true); // Default ON - matches layer default
  const [showTrueColor, setShowTrueColor] = useState(false); // EOX Sentinel-2 true color base, off by default
  const [showTestLayer, setShowTestLayer] = useState(false); // Test layer for experiments
  const [error, setError] = useState<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
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
          // NASA GIBS MODIS True Color - daily satellite imagery (test layer)
          'gibs-modis': {
            type: 'raster',
            tiles: [
              `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${new Date(Date.now() - 86400000).toISOString().split('T')[0]}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
            ],
            tileSize: 256,
            maxzoom: 9,
            attribution: '© NASA GIBS MODIS',
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
          // EOX true color base layer (below satellite)
          {
            id: 'eox-truecolor-layer',
            type: 'raster',
            source: 'eox-sentinel2',
            minzoom: 0,
            maxzoom: 14,
            layout: {
              visibility: 'none', // Off by default
            },
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
            paint: {
              'raster-opacity': 0.7,
            },
          },
          // Test layer for experiments (NASA GIBS MODIS)
          {
            id: 'test-layer',
            type: 'raster',
            source: 'gibs-modis',
            minzoom: 0,
            maxzoom: 9,
            layout: {
              visibility: 'none', // Off by default
            },
            paint: {
              'raster-opacity': 0.85,
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
          maxzoom: 12,
          paint: {
            'raster-opacity': 0.75,
          },
        });
      }
    } catch (err) {
      console.error('Failed to update radar layer:', err);
    }
  }, [radarFrames, currentFrameIndex]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || radarFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex(prev => (prev + 1) % radarFrames.length);
    }, 400);

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

  // Toggle test layer visibility (NASA GIBS MODIS)
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
          className={`layer-icon-btn test-btn ${showTestLayer ? 'active' : ''}`}
          onClick={toggleTestLayer}
          title="Test Layer (NASA GIBS MODIS)"
        >
          🧪
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

      {/* Footer */}
      <div className="map-footer">
        <span>NOAA GOES Satellite • NEXRAD Radar</span>
      </div>
    </div>
  );
}
