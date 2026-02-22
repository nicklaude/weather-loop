// NOAA GOES Satellite Image API
// Documentation: https://www.star.nesdis.noaa.gov/goes/

// User-facing sector IDs
export type Sector =
  | 'FD'       // Full Disk
  | 'CONUS'    // Continental US
  | 'northeast'// Northeast US
  | 'southeast'// Southeast US
  | 'caribbean'// Caribbean
  | 'puertorico'// Puerto Rico
  | 'alaska'   // Alaska
  | 'hawaii'   // Hawaii
  | 'pacificnw'// Pacific Northwest
  | 'pacificsw'// Pacific Southwest / California
  | 'greatlakes'// Great Lakes
  | 'uppermidwest'// Upper Midwest
  | 'southernrockies'// Southern Rockies
  | 'northernrockies'// Northern Rockies
  | 'southernplains'// Southern Plains
  | 'mexico';  // Mexico

export type ImageType =
  | 'GEOCOLOR'  // Natural color (day) / IR (night)
  | 'Band02'    // Visible red
  | 'Band13'    // Clean IR longwave
  | 'Band14';   // IR longwave window

export type Satellite = 'GOES16' | 'GOES18' | 'GOES19';

export interface SectorInfo {
  name: string;
  description: string;
  satellite: Satellite;
  // Path segment as used in NOAA CDN
  pathSegment: string;
  // 'direct' = /GOES19/ABI/CONUS/, 'sector' = /GOES19/ABI/SECTOR/ne/
  pathType: 'sector' | 'direct';
}

// Sector configuration - maps user-friendly IDs to actual NOAA paths
// GOES-East (GOES-16/19) covers Eastern US, Atlantic, Caribbean
// GOES-West (GOES-18) covers Western US, Pacific, Alaska, Hawaii
export const SECTORS: Record<Sector, SectorInfo> = {
  FD: { name: 'Full Disk', description: 'Earth', satellite: 'GOES19', pathSegment: 'FD', pathType: 'direct' },
  CONUS: { name: 'CONUS', description: 'Continental US', satellite: 'GOES19', pathSegment: 'CONUS', pathType: 'direct' },

  // GOES-19/East sectors
  northeast: { name: 'Northeast', description: 'New England', satellite: 'GOES19', pathSegment: 'ne', pathType: 'sector' },
  southeast: { name: 'Southeast', description: 'Florida & Gulf', satellite: 'GOES19', pathSegment: 'se', pathType: 'sector' },
  caribbean: { name: 'Caribbean', description: 'Caribbean Sea', satellite: 'GOES19', pathSegment: 'car', pathType: 'sector' },
  puertorico: { name: 'Puerto Rico', description: 'PR & USVI', satellite: 'GOES19', pathSegment: 'pr', pathType: 'sector' },
  greatlakes: { name: 'Great Lakes', description: 'Great Lakes', satellite: 'GOES19', pathSegment: 'cgl', pathType: 'sector' },
  uppermidwest: { name: 'Upper Midwest', description: 'Upper Midwest', satellite: 'GOES19', pathSegment: 'umv', pathType: 'sector' },
  southernrockies: { name: 'Southern Rockies', description: 'S Rockies', satellite: 'GOES19', pathSegment: 'sr', pathType: 'sector' },
  southernplains: { name: 'Southern Plains', description: 'S Plains', satellite: 'GOES19', pathSegment: 'sp', pathType: 'sector' },
  mexico: { name: 'Mexico', description: 'Mexico', satellite: 'GOES19', pathSegment: 'mex', pathType: 'sector' },

  // GOES-18/West sectors
  alaska: { name: 'Alaska', description: 'Alaska', satellite: 'GOES18', pathSegment: 'ak', pathType: 'sector' },
  hawaii: { name: 'Hawaii', description: 'Hawaii', satellite: 'GOES18', pathSegment: 'hi', pathType: 'sector' },
  pacificnw: { name: 'Pacific NW', description: 'Pacific Northwest', satellite: 'GOES18', pathSegment: 'pnw', pathType: 'sector' },
  pacificsw: { name: 'Pacific SW', description: 'California', satellite: 'GOES18', pathSegment: 'psw', pathType: 'sector' },
  northernrockies: { name: 'Northern Rockies', description: 'N Rockies', satellite: 'GOES18', pathSegment: 'np', pathType: 'sector' },
};

// Base CDN URL
const CDN_BASE = 'https://cdn.star.nesdis.noaa.gov';

// Get the correct path for a sector based on its type
function getSectorPath(sector: Sector): string {
  const info = SECTORS[sector];
  if (info.pathType === 'direct') {
    // CONUS and FD use: /GOES19/ABI/CONUS/GEOCOLOR/
    return `${CDN_BASE}/${info.satellite}/ABI/${info.pathSegment}`;
  } else {
    // Regional sectors use: /GOES19/ABI/SECTOR/ne/GEOCOLOR/
    return `${CDN_BASE}/${info.satellite}/ABI/SECTOR/${info.pathSegment}`;
  }
}

// Build URL for latest image
export function getLatestImageUrl(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR'
): string {
  return `${getSectorPath(sector)}/${imageType}/latest.jpg`;
}

// Get the directory URL for a sector/type combination
export function getDirectoryUrl(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR'
): string {
  return `${getSectorPath(sector)}/${imageType}/`;
}

// Parse directory listing to get available image URLs
// Auto-discovers the correct resolution for each sector
export async function fetchAvailableImages(
  sector: Sector,
  imageType: ImageType = 'GEOCOLOR',
  maxImages: number = 24
): Promise<string[]> {
  const directoryUrl = getDirectoryUrl(sector, imageType);
  const sectorInfo = SECTORS[sector];

  try {
    const response = await fetch(directoryUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch directory: ${response.status}`);
    }

    const html = await response.text();

    // Find all available resolutions for this sector
    // Pattern: TIMESTAMP_SATELLITE-ABI-SECTOR-TYPE-RESOLUTION.jpg
    const resPattern = new RegExp(
      `\\d{11}_${sectorInfo.satellite}-ABI-${sectorInfo.pathSegment}-${imageType}-(\\d+x\\d+)\\.jpg`,
      'gi'
    );
    const resMatches = Array.from(html.matchAll(resPattern));
    const resolutions = new Set(resMatches.map((m) => m[1]));

    if (resolutions.size === 0) {
      console.error('No resolutions found in directory listing');
      return [];
    }

    // Pick a medium-to-large resolution
    const sortedRes = Array.from(resolutions).sort((a, b) => {
      const aSize = parseInt(a.split('x')[0], 10);
      const bSize = parseInt(b.split('x')[0], 10);
      return aSize - bSize;
    });

    // Pick ~60% of the way up the resolution list (biased toward larger)
    const idx = Math.min(Math.floor(sortedRes.length * 0.6), sortedRes.length - 1);
    const resolution = sortedRes[idx];

    // Now find all images at this resolution
    const pattern = new RegExp(
      `(\\d{11})_${sectorInfo.satellite}-ABI-${sectorInfo.pathSegment}-${imageType}-${resolution}\\.jpg`,
      'gi'
    );

    const matches = Array.from(html.matchAll(pattern));
    const timestamps = new Set<string>();
    for (const match of matches) {
      timestamps.add(match[1]);
    }

    // Sort timestamps (oldest first) and take the most recent N
    const sortedTimestamps = Array.from(timestamps).sort();
    const recentTimestamps = sortedTimestamps.slice(-maxImages);

    // Build full URLs
    return recentTimestamps.map(
      (ts) => `${directoryUrl}${ts}_${sectorInfo.satellite}-ABI-${sectorInfo.pathSegment}-${imageType}-${resolution}.jpg`
    );
  } catch (error) {
    console.error('Error fetching available images:', error);
    // Fallback to just latest if directory fetch fails
    return [getLatestImageUrl(sector, imageType)];
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
