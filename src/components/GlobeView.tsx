import { useEffect, useRef, useState } from 'react';
import Globe from 'globe.gl';
import { SECTORS, fetchAvailableImages } from '../lib/goesApi';
import type { Sector, ImageType } from '../lib/goesApi';
import { Play, Pause, RefreshCw } from 'lucide-react';
import './GlobeView.css';

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'GEOCOLOR', label: 'GeoColor' },
  { value: 'Band02', label: 'Visible' },
  { value: 'Band13', label: 'IR Clean' },
];

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<InstanceType<typeof Globe> | null>(null);
  const [sector, setSector] = useState<Sector>('FD');
  const [imageType, setImageType] = useState<ImageType>('GEOCOLOR');
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [globeReady, setGlobeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize globe after mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Wait for container to have dimensions
    const initGlobe = () => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      if (width === 0 || height === 0) {
        // Container not ready yet, retry
        requestAnimationFrame(initGlobe);
        return;
      }

      try {
        // Create globe with mediump precision to fix black screen on mobile Safari
        const globe = new Globe(containerRef.current, {
          rendererConfig: {
            antialias: true,
            alpha: true,
            precision: 'mediump',  // Fix for mobile Safari black screen
            powerPreference: 'high-performance'
          }
        })
          .width(width)
          .height(height)
          .backgroundColor('#0a0a0a')
          .showAtmosphere(true)
          .atmosphereColor('#60a5fa')
          .atmosphereAltitude(0.15)
          .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg');

        // Configure controls
        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;

        // Set initial view
        globe.pointOfView({ lat: 35, lng: -100, altitude: 2.5 });

        globeRef.current = globe;
        setGlobeReady(true);
      } catch (err) {
        console.error('Failed to initialize globe:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize 3D globe');
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(initGlobe);

    return () => {
      if (globeRef.current) {
        // Clean up - globe.gl doesn't have a built-in destructor
        // Just clear the reference
        globeRef.current = null;
      }
    };
  }, []);

  // Handle resize
  useEffect(() => {
    if (!globeReady) return;

    const handleResize = () => {
      if (globeRef.current && containerRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          globeRef.current.width(width).height(height);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [globeReady]);

  // Load frames
  useEffect(() => {
    const loadFrames = async () => {
      setIsLoading(true);
      try {
        const urls = await fetchAvailableImages(sector, imageType, 12);
        setFrames(urls);
        setCurrentFrame(0);

        // Update globe texture with first frame
        if (urls.length > 0 && globeRef.current) {
          globeRef.current.globeImageUrl(urls[0]);
        }
      } catch (err) {
        console.error('Failed to load frames:', err);
      }
      setIsLoading(false);
    };

    if (globeReady) {
      loadFrames();
    }
  }, [sector, imageType, globeReady]);

  // Update globe when frame changes
  useEffect(() => {
    if (frames.length > 0 && globeRef.current) {
      globeRef.current.globeImageUrl(frames[currentFrame]);
    }
  }, [currentFrame, frames]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      const interval = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % frames.length);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isPlaying, frames.length]);

  return (
    <div className="globe-view">
      {/* Controls */}
      <div className="globe-controls">
        <select
          value={sector}
          onChange={(e) => {
            setSector(e.target.value as Sector);
            setIsPlaying(false);
          }}
          disabled={isLoading}
          className="globe-select"
        >
          {Object.entries(SECTORS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name}
            </option>
          ))}
        </select>

        <select
          value={imageType}
          onChange={(e) => {
            setImageType(e.target.value as ImageType);
            setIsPlaying(false);
          }}
          disabled={isLoading}
          className="globe-select"
        >
          {IMAGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsPlaying(p => !p)}
          disabled={isLoading || frames.length === 0}
          className="globe-btn"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        <span className="globe-frame-info">
          {frames.length > 0 ? `${currentFrame + 1}/${frames.length}` : '...'}
        </span>
      </div>

      {/* Globe container */}
      <div ref={containerRef} className="globe-container">
        {error && (
          <div className="globe-loading" style={{ color: '#ef4444' }}>
            <span>Error: {error}</span>
          </div>
        )}
        {!globeReady && !error && (
          <div className="globe-loading">
            <RefreshCw size={32} className="spinning" />
            <span>Initializing globe...</span>
          </div>
        )}
        {globeReady && isLoading && (
          <div className="globe-loading">
            <RefreshCw size={32} className="spinning" />
            <span>Loading satellite imagery...</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="globe-footer">
        <span>NOAA GOES Satellite • Powered by globe.gl</span>
      </div>
    </div>
  );
}
