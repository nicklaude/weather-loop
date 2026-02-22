import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAndCacheImage, clearOldCache, getCacheStats } from '../lib/imageCache';
import { fetchAvailableImages } from '../lib/goesApi';
import type { Sector, ImageType } from '../lib/goesApi';

export interface LoopState {
  frames: string[];
  currentFrame: number;
  isPlaying: boolean;
  isLoading: boolean;
  loadingProgress: number;
  error: string | null;
  sector: Sector;
  imageType: ImageType;
  speed: number; // ms between frames
  cacheStats: { count: number; sizeMB: number };
}

export interface LoopControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
  goToFrame: (index: number) => void;
  setSpeed: (ms: number) => void;
  setSector: (sector: Sector) => void;
  setImageType: (type: ImageType) => void;
  refresh: () => void;
}

const DEFAULT_FRAME_COUNT = 24; // ~2 hours at 5-min intervals
const DEFAULT_SPEED = 150; // ms between frames

export function useWeatherLoop(
  initialSector: Sector = 'northeast',
  initialImageType: ImageType = 'GEOCOLOR'
): [LoopState, LoopControls] {
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sector, setSectorState] = useState<Sector>(initialSector);
  const [imageType, setImageTypeState] = useState<ImageType>(initialImageType);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);
  const [cacheStats, setCacheStats] = useState({ count: 0, sizeMB: 0 });

  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Load frames for the current sector - progressively shows frames as they load
  const loadFrames = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);
    setFrames([]); // Clear existing frames
    setCurrentFrame(0);

    try {
      // Clear old cache entries
      await clearOldCache();

      // Fetch available image URLs from the directory (auto-discovers resolution)
      const imageUrls = await fetchAvailableImages(
        sector,
        imageType,
        DEFAULT_FRAME_COUNT
      );

      if (imageUrls.length === 0) {
        throw new Error('No images available');
      }

      // Load each image into cache - progressively update frames as they load
      const loadedFrames: string[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        try {
          const objectUrl = await fetchAndCacheImage(url, sector);
          loadedFrames.push(objectUrl);
          // Update frames progressively so user sees content while loading
          setFrames([...loadedFrames]);
          setLoadingProgress(((i + 1) / imageUrls.length) * 100);
        } catch (err) {
          console.warn(`Failed to load frame ${i + 1}:`, err);
        }
      }

      if (loadedFrames.length === 0) {
        throw new Error('No frames could be loaded');
      }

      // Update cache stats
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [sector, imageType]);

  // Initial load
  useEffect(() => {
    loadFrames();
  }, [loadFrames]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current >= speed) {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
        lastFrameTimeRef.current = timestamp;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, frames.length, speed]);

  // Controls
  const controls: LoopControls = {
    play: () => setIsPlaying(true),
    pause: () => setIsPlaying(false),
    toggle: () => setIsPlaying((p) => !p),
    nextFrame: () => setCurrentFrame((p) => (p + 1) % frames.length),
    prevFrame: () => setCurrentFrame((p) => (p - 1 + frames.length) % frames.length),
    goToFrame: (index: number) => setCurrentFrame(Math.max(0, Math.min(index, frames.length - 1))),
    setSpeed: setSpeedState,
    setSector: (newSector: Sector) => {
      setSectorState(newSector);
      setIsPlaying(false);
    },
    setImageType: (type: ImageType) => {
      setImageTypeState(type);
      setIsPlaying(false);
    },
    refresh: loadFrames,
  };

  const state: LoopState = {
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
  };

  return [state, controls];
}
