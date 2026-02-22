import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Play, Pause, RefreshCw, Cloud, CloudRain, Eye, EyeOff } from 'lucide-react';
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
  const [showRadar, setShowRadar] = useState(true);
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
          // nowCOAST GOES visible satellite
          'goes-satellite': {
            type: 'raster',
            tiles: [
              'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_visible_imagery&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true'
            ],
            tileSize: 256,
            attribution: '© NOAA nowCOAST',
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
      setError(e.error?.message || 'Map loading error');
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
        const data: RainViewerData = await response.json();
        const frames = [...data.radar.past, ...data.radar.nowcast];
        setRadarFrames(frames);
        setCurrentFrameIndex(data.radar.past.length - 1); // Start at most recent actual
      } catch (err) {
        console.error('Failed to fetch radar frames:', err);
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
    map.setLayoutProperty('satellite-layer', 'visibility', newVisibility ? 'visible' : 'none');
  }, [showSatellite]);

  // Toggle radar visibility
  const toggleRadar = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('radar-layer')) return;

    const newVisibility = !showRadar;
    setShowRadar(newVisibility);
    map.setLayoutProperty('radar-layer', 'visibility', newVisibility ? 'visible' : 'none');
  }, [showRadar]);

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
      {/* Layer Controls */}
      <div className="layer-controls">
        <button
          className={`layer-btn ${showSatellite ? 'active' : ''}`}
          onClick={toggleSatellite}
          title="Toggle Satellite"
        >
          {showSatellite ? <Eye size={16} /> : <EyeOff size={16} />}
          <Cloud size={16} />
          <span>Satellite</span>
        </button>

        <button
          className={`layer-btn ${showRadar ? 'active' : ''}`}
          onClick={toggleRadar}
          title="Toggle Radar"
        >
          {showRadar ? <Eye size={16} /> : <EyeOff size={16} />}
          <CloudRain size={16} />
          <span>Radar</span>
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
          className="play-btn"
          onClick={() => setIsPlaying(p => !p)}
          disabled={radarFrames.length === 0}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
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
