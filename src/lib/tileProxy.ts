/**
 * Tile Proxy Configuration
 *
 * Routes tile requests through Cloudflare Worker to:
 * - Fix CORS issues (all requests go through our domain)
 * - Cache tiles at edge (reduces rate limiting)
 * - Handle 429/503 errors gracefully
 */

// The proxy URL - in production this is the Cloudflare Worker
// In development, requests go directly to providers (CORS may be an issue)
const PROXY_BASE = import.meta.env.PROD
  ? 'https://weather-tile-proxy.nicklaudethorat.workers.dev'
  : ''; // Empty string means direct access in dev

/**
 * Proxy a RainViewer tile URL
 * RainViewer: tilecache.rainviewer.com → /rainviewer/
 */
export function proxyRainViewerUrl(url: string): string {
  if (!PROXY_BASE) return url;
  return url.replace('https://tilecache.rainviewer.com', `${PROXY_BASE}/rainviewer`);
}

/**
 * Proxy an IEM (Iowa Environmental Mesonet) tile URL
 * IEM: mesonet.agron.iastate.edu → /iem/
 */
export function proxyIemUrl(url: string): string {
  if (!PROXY_BASE) return url;
  return url.replace('https://mesonet.agron.iastate.edu', `${PROXY_BASE}/iem`);
}

/**
 * Proxy a NASA GIBS tile URL
 * GIBS: gibs.earthdata.nasa.gov → /gibs/
 */
export function proxyGibsUrl(url: string): string {
  if (!PROXY_BASE) return url;
  return url.replace('https://gibs.earthdata.nasa.gov', `${PROXY_BASE}/gibs`);
}

/**
 * Get the proxy base URL for building tile URLs
 */
export function getProxyBase(): string {
  return PROXY_BASE;
}

/**
 * Check if we're using the proxy
 */
export function isProxyEnabled(): boolean {
  return !!PROXY_BASE;
}
