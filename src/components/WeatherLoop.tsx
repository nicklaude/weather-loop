import { useWeatherLoop } from '../hooks/useWeatherLoop';
import { SECTORS } from '../lib/goesApi';
import type { Sector, ImageType } from '../lib/goesApi';
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
  const [state, controls] = useWeatherLoop('ne', 'GEOCOLOR');

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

  return (
    <div className="weather-loop">
      <header className="header">
        <h1>Weather Loop</h1>
        <p className="subtitle">NOAA GOES-19 Satellite Imagery</p>
      </header>

      {/* Sector Selection */}
      <div className="controls-row">
        <label htmlFor="sector-select">Region:</label>
        <select
          id="sector-select"
          value={sector}
          onChange={(e) => controls.setSector(e.target.value as Sector)}
          disabled={isLoading}
        >
          {Object.entries(SECTORS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.name} - {info.description}
            </option>
          ))}
        </select>
      </div>

      {/* Image Type Selection */}
      <div className="controls-row">
        <label htmlFor="type-select">Type:</label>
        <select
          id="type-select"
          value={imageType}
          onChange={(e) => controls.setImageType(e.target.value as ImageType)}
          disabled={isLoading}
        >
          {IMAGE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Image Display */}
      <div className="image-container">
        {isLoading ? (
          <div className="loading">
            <div className="loading-text">Loading frames...</div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <div className="progress-text">{Math.round(loadingProgress)}%</div>
          </div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={controls.refresh}>Retry</button>
          </div>
        ) : frames.length > 0 ? (
          <img
            src={frames[currentFrame]}
            alt={`Weather satellite frame ${currentFrame + 1} of ${frames.length}`}
            className="satellite-image"
          />
        ) : (
          <div className="no-frames">No frames available</div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button
          onClick={controls.prevFrame}
          disabled={isLoading || frames.length === 0}
          className="control-btn"
          title="Previous frame"
        >
          ⏮
        </button>

        <button
          onClick={controls.toggle}
          disabled={isLoading || frames.length === 0}
          className="control-btn play-btn"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          onClick={controls.nextFrame}
          disabled={isLoading || frames.length === 0}
          className="control-btn"
          title="Next frame"
        >
          ⏭
        </button>

        <button
          onClick={controls.refresh}
          disabled={isLoading}
          className="control-btn"
          title="Refresh"
        >
          🔄
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
            Frame {currentFrame + 1} of {frames.length}
          </div>
        </div>
      )}

      {/* Speed Control */}
      <div className="controls-row">
        <label htmlFor="speed-select">Speed:</label>
        <select
          id="speed-select"
          value={speed}
          onChange={(e) => controls.setSpeed(Number(e.target.value))}
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Frame Picker */}
      {frames.length > 0 && (
        <div className="frame-picker">
          {frames.map((_, index) => (
            <button
              key={index}
              className={`frame-dot ${index === currentFrame ? 'active' : ''}`}
              onClick={() => controls.goToFrame(index)}
              title={`Frame ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Cache Stats */}
      <div className="cache-stats">
        Cached: {cacheStats.count} images ({cacheStats.sizeMB} MB)
      </div>

      <footer className="footer">
        <p>
          Data source:{' '}
          <a
            href="https://www.star.nesdis.noaa.gov/goes/"
            target="_blank"
            rel="noopener noreferrer"
          >
            NOAA NESDIS STAR
          </a>
        </p>
      </footer>
    </div>
  );
}
