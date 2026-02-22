import { useRef, useCallback } from 'react';
import { useWeatherLoop } from '../hooks/useWeatherLoop';
import { SECTORS } from '../lib/goesApi';
import type { Sector, ImageType } from '../lib/goesApi';
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import './WeatherLoop.css';

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'GEOCOLOR', label: 'GeoColor' },
  { value: 'Band02', label: 'Visible' },
  { value: 'Band13', label: 'IR Clean' },
  { value: 'Band14', label: 'IR Window' },
];

const SPEED_OPTIONS = [
  { value: 50, label: 'Fast' },
  { value: 150, label: 'Normal' },
  { value: 300, label: 'Slow' },
  { value: 500, label: 'Very Slow' },
];

export function WeatherLoop() {
  const [state, controls] = useWeatherLoop('northeast', 'GEOCOLOR');
  const framePickerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);

  const {
    frames,
    currentFrame,
    isPlaying,
    isLoading,
    loadingProgress,
    error,
    sector,
    imageType,
    speed,
    cacheStats,
  } = state;

  // Handle touch/swipe on frame picker
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    const threshold = 30; // minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next frame
        controls.nextFrame();
      } else {
        // Swipe right - previous frame
        controls.prevFrame();
      }
    }
  }, [controls]);

  return (
    <div className="weather-loop">
      {/* Controls Row */}
      <div className="controls-row">
        <select
          id="sector-select"
          value={sector}
          onChange={(e) => controls.setSector(e.target.value as Sector)}
          disabled={isLoading}
          className="select-primary"
        >
          {Object.entries(SECTORS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name}
            </option>
          ))}
        </select>

        <select
          id="type-select"
          value={imageType}
          onChange={(e) => controls.setImageType(e.target.value as ImageType)}
          disabled={isLoading}
          className="select-secondary"
        >
          {IMAGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Image Display - shows frames progressively while loading */}
      <div
        className="image-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={controls.refresh} className="retry-btn">
              <RefreshCw size={20} />
              Retry
            </button>
          </div>
        ) : frames.length > 0 ? (
          <>
            <img
              src={frames[Math.min(currentFrame, frames.length - 1)]}
              alt={`Satellite frame ${currentFrame + 1}/${frames.length}`}
              className="satellite-image"
              draggable={false}
            />
            {isLoading && (
              <div className="loading-overlay">
                <div className="progress-text">{Math.round(loadingProgress)}%</div>
              </div>
            )}
          </>
        ) : isLoading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <div className="progress-text">{Math.round(loadingProgress)}%</div>
          </div>
        ) : (
          <div className="no-frames">No frames available</div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button
          onClick={controls.prevFrame}
          disabled={frames.length === 0}
          className="control-btn"
          aria-label="Previous frame"
        >
          <SkipBack size={28} />
        </button>

        <button
          onClick={controls.toggle}
          disabled={frames.length === 0}
          className="control-btn play-btn"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={32} /> : <Play size={32} />}
        </button>

        <button
          onClick={controls.nextFrame}
          disabled={frames.length === 0}
          className="control-btn"
          aria-label="Next frame"
        >
          <SkipForward size={28} />
        </button>

        <button
          onClick={controls.refresh}
          disabled={isLoading}
          className="control-btn"
          aria-label="Refresh"
        >
          <RefreshCw size={28} className={isLoading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Frame Scrubber */}
      {frames.length > 0 && (
        <div className="scrubber-container">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={currentFrame}
            onChange={(e) => controls.goToFrame(Number(e.target.value))}
            className="scrubber"
          />
          <div className="frame-info">
            {currentFrame + 1} / {frames.length}
          </div>
        </div>
      )}

      {/* Speed Control */}
      <div className="speed-row">
        <span className="speed-label">Speed</span>
        <select
          id="speed-select"
          value={speed}
          onChange={(e) => controls.setSpeed(Number(e.target.value))}
          className="select-small"
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Frame Picker - Swipeable */}
      {frames.length > 0 && (
        <div
          className="frame-picker"
          ref={framePickerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="frame-dots-container">
            {frames.map((_, index) => (
              <button
                key={index}
                className={`frame-dot ${index === currentFrame ? 'active' : ''}`}
                onClick={() => controls.goToFrame(index)}
                aria-label={`Go to frame ${index + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <span className="cache-stats">
          {cacheStats.count} frames • {cacheStats.sizeMB} MB
        </span>
        <a
          href="https://www.star.nesdis.noaa.gov/goes/"
          target="_blank"
          rel="noopener noreferrer"
          className="source-link"
        >
          NOAA GOES-19
        </a>
      </footer>
    </div>
  );
}
