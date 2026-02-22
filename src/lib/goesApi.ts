// NOAA GOES Satellite Image API
// Documentation: https://www.star.nesdis.noaa.gov/goes/

export type Sector =
  | 'FD'    // Full Disk
  | 'CONUS' // Continental US
  | 'ne'    // Northeast
  | 'se'    // Southeast
  | 'mw'    // Midwest
  | 'nw'    // Northwest
  | 'sw'    // Southwest
  | 'gm'    // Gulf of Mexico
  | 'car'   // Caribbean
  | 'ak'    // Alaska
  | 'hi'    // Hawaii
  | 'pr';   // Puerto Rico

export type ImageType =
  | 'GEOCOLOR'  // Natural color (day) / IR (night)
  | 'Band02'    // Visible red
  | 'Band13'    // Clean IR longwave
  | 'Band14';   // IR longwave window

export type Satellite = 'GOES16' | 'GOES18' | 'GOES19';

export type Resolution = '300x300' | '600x600' | '1200x1200' | '2400x2400';

export interface SectorInfo {
  name: string;
  description: string;
  approxSizeKB: number;
  // Some sectors use different path structures
  pathType: 'sector' | 'direct';
}

export const SECTORS: Record<Sector, SectorInfo> = {
  FD: { name: 'Full Disk', description: 'Entire visible Earth', approxSizeKB: 5000, pathType: 'direct' },
  CONUS: { name: 'CONUS', description: 'Continental United States', approxSizeKB: 2000, pathType: 'direct' },
  ne: { name: 'Northeast', description: 'New England & Mid-Atlantic', approxSizeKB: 500, pathType: 'sector' },
  se: { name: 'Southeast', description: 'Florida & Gulf Coast', approxSizeKB: 500, pathType: 'sector' },
  mw: { name: 'Midwest', description: 'Great Lakes & Plains', approxSizeKB: 500, pathType: 'sector' },
  nw: { name: 'Northwest', description: 'Pacific Northwest', approxSizeKB: 500, pathType: 'sector' },
  sw: { name: 'Southwest', description: 'California & Desert SW', approxSizeKB: 500, pathType: 'sector' },
  gm: { name: 'Gulf of Mexico', description: 'Gulf of Mexico', approxSizeKB: 500, pathType: 'sector' },
  car: { name: 'Caribbean', description: 'Caribbean Sea', approxSizeKB: 500, pathType: 'sector' },
  ak: { name: 'Alaska', description: 'Alaska', approxSizeKB: 500, pathType: 'sector' },
  hi: { name: 'Hawaii', description: 'Hawaiian Islands', approxSizeKB: 200, pathType: 'sector' },
  pr: { name: 'Puerto Rico', description: 'Puerto Rico & USVI', approxSizeKB: 200, pathType: 'sector' },
};

// Base CDN URL
const CDN_BASE = 'https://cdn.star.nesdis.noaa.gov';

// Get the correct path for a sector based on its type
function getSectorPath(sector: Sector, satellite: Satellite): string {
  const info = SECTORS[sector];
  if (info.pathType === 'direct') {
    // CONUS and FD use: /GOES19/ABI/CONUS/GEOCOLOR/
    return `${CDN_BASE}/${satellite}/ABI/${sector}`;
  } else {
    // Regional sectors use: /GOES19/ABI/SECTOR/ne/GEOCOLOR/
    return `${CDN_BASE}/${satellite}/ABI/SECTOR/${sector}`;
  }
}

// Build URL for latest image
export function getLatestImageUrl(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR',
  satellite: Satellite = 'GOES19'
): string {
  return `${getSectorPath(sector, satellite)}/${imageType}/latest.jpg`;
}

// Get the directory URL for a sector/type combination
export function getDirectoryUrl(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR',
  satellite: Satellite = 'GOES19'
): string {
  return `${getSectorPath(sector, satellite)}/${imageType}/`;
}

// Parse directory listing to get available image URLs
export async function fetchAvailableImages(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR',
  satellite: Satellite = 'GOES19',
  resolution: Resolution = '1200x1200',
  maxImages: number = 24
): Promise<string[]> {
  const directoryUrl = getDirectoryUrl(sector, imageType, satellite);

  try {
    const response = await fetch(directoryUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch directory: ${response.status}`);
    }

    const html = await response.text();

    // Extract image filenames matching the pattern
    // Format: YYYYDDDHHNN_SATELLITE-ABI-sector-BAND-resolution.jpg
    const pattern = new RegExp(
      `(\\d{11})_${satellite}-ABI-${sector}-${imageType}-${resolution}\\.jpg`,
      'g'
    );

    const matches = html.matchAll(pattern);
    const timestamps = new Set<string>();

    for (const match of matches) {
      timestamps.add(match[1]);
    }

    // Sort timestamps (oldest first) and take the most recent N
    const sortedTimestamps = Array.from(timestamps).sort();
    const recentTimestamps = sortedTimestamps.slice(-maxImages);

    // Build full URLs
    return recentTimestamps.map(
      (ts) => `${directoryUrl}${ts}_${satellite}-ABI-${sector}-${imageType}-${resolution}.jpg`
    );
  } catch (error) {
    console.error('Error fetching available images:', error);
    // Fallback to just latest if directory fetch fails
    return [getLatestImageUrl(sector, imageType, satellite)];
  }
}

// Get human-readable time from NOAA timestamp
export function parseNoaaTimestamp(timestamp: string): Date {
  // Format: YYYYDDDHHMM
  // YYYY = year, DDD = day of year, HH = hour, MM = minute
  const year = parseInt(timestamp.slice(0, 4), 10);
  const dayOfYear = parseInt(timestamp.slice(4, 7), 10);
  const hours = parseInt(timestamp.slice(7, 9), 10);
  const minutes = parseInt(timestamp.slice(9, 11), 10);

  // Convert day of year to date
  const date = new Date(Date.UTC(year, 0, dayOfYear, hours, minutes));
  return date;
}

// Extract timestamp from a NOAA image URL
export function extractTimestamp(url: string): string | null {
  const match = url.match(/(\d{11})_GOES/);
  return match ? match[1] : null;
}
