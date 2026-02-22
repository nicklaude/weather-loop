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
  const globeRef = useRef<any>(null);
  const [sector, setSector] = useState<Sector>('FD');
  const [imageType, setImageType] = useState<ImageType>('GEOCOLOR');
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    const globe = new Globe(containerRef.current)
      .backgroundColor('#0a0a0a')
      .showAtmosphere(true)
      .atmosphereColor('#60a5fa')
      .atmosphereAltitude(0.15)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png');

    // Auto-rotate
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.5;

    // Set initial POV to show US
    globe.pointOfView({ lat: 35, lng: -100, altitude: 2.5 });

    globeRef.current = globe;

    return () => {
      if (globeRef.current) {
        globeRef.current._destructor?.();
        globeRef.current = null;
      }
    };
  }, []);

  // Load frames
  useEffect(() => {
    const loadFrames = async () => {
      setIsLoading(true);
      const urls = await fetchAvailableImages(sector, imageType, 12);
      setFrames(urls);
      setCurrentFrame(0);
      setIsLoading(false);

      // Update globe texture with first frame
      if (urls.length > 0 && globeRef.current) {
        globeRef.current.globeImageUrl(urls[0]);
      }
    };

    loadFrames();
  }, [sector, imageType]);

  // Update globe when frame changes
  useEffect(() => {
    if (frames.length > 0 && globeRef.current) {
      globeRef.current.globeImageUrl(frames[currentFrame]);
    }
  }, [currentFrame, frames]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      const animate = () => {
        setCurrentFrame(prev => (prev + 1) % frames.length);
      };
      const interval = setInterval(animate, 500);
      return () => clearInterval(interval);
    }
  }, [isPlaying, frames.length]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (globeRef.current && containerRef.current) {
        globeRef.current.width(containerRef.current.clientWidth);
        globeRef.current.height(containerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        {isLoading && (
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
