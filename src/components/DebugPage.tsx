import { useEffect, useState } from 'react';
import './DebugPage.css';

interface SourceTest {
  name: string;
  url: string;
  type: 'image' | 'json' | 'wms';
  status: 'pending' | 'loading' | 'success' | 'cors-error' | 'referer-error' | 'network-error' | 'timeout';
  responseTime?: number;
  headers?: Record<string, string>;
  error?: string;
  contentType?: string;
}

// All data sources we use or might use
const DATA_SOURCES: Omit<SourceTest, 'status'>[] = [
  // === CURRENTLY WORKING ===
  {
    name: 'Carto Dark (base map)',
    url: 'https://a.basemaps.cartocdn.com/dark_all/5/9/12@2x.png',
    type: 'image',
  },
  {
    name: 'EOX Sentinel-2 (true color base)',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/5/12/9.jpg',
    type: 'image',
  },
  {
    name: 'RainViewer API (radar metadata)',
    url: 'https://api.rainviewer.com/public/weather-maps.json',
    type: 'json',
  },
  {
    name: 'RainViewer Tiles (radar)',
    url: 'https://tilecache.rainviewer.com/v2/radar/1708704600/256/5/9/12/2/1_1.png',
    type: 'image',
  },
  {
    name: 'nowCOAST GOES Visible (grayscale)',
    url: 'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_visible_imagery&CRS=EPSG:3857&BBOX=-8766409.899970295,5009377.085697314,-7514065.628545966,6261721.357121642&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true',
    type: 'image',
  },
  {
    name: 'nowCOAST IR (cloud layer)',
    url: 'https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=goes_longwave_imagery&CRS=EPSG:3857&BBOX=-8766409.899970295,5009377.085697314,-7514065.628545966,6261721.357121642&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true',
    type: 'image',
  },
  {
    name: 'NASA GIBS VIIRS (daily true color)',
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${new Date(Date.now() - 86400000).toISOString().split('T')[0]}/GoogleMapsCompatible_Level9/5/12/9.jpg`,
    type: 'image',
  },
  {
    name: 'IEM KBOX Radar (Boston)',
    url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::BOX-N0Q-0/5/9/12.png',
    type: 'image',
  },
  {
    name: 'IEM MRMS (composite radar)',
    url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-n1p-900913/5/9/12.png',
    type: 'image',
  },

  // === SSEC REALEARTH (REFERER ISSUES) ===
  {
    name: 'SSEC GOES GeoColor (true color)',
    url: 'https://realearth.ssec.wisc.edu/tiles/G19-ABI-CONUS-geo-color/5/9/12.png',
    type: 'image',
  },
  {
    name: 'SSEC GOES IR Enhanced',
    url: 'https://realearth.ssec.wisc.edu/tiles/G19-ABI-CONUS-band13/5/9/12.png',
    type: 'image',
  },
  {
    name: 'SSEC Times API',
    url: 'https://realearth.ssec.wisc.edu/api/times?products=G19-ABI-CONUS-geo-color',
    type: 'json',
  },

  // === NASA GIBS GOES (TESTING) ===
  {
    name: 'NASA GIBS GOES-East GeoColor',
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/${new Date().toISOString().split('T')[0]}/GoogleMapsCompatible_Level8/5/12/9.jpg`,
    type: 'image',
  },
  {
    name: 'NASA GIBS GOES-West GeoColor',
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-West_ABI_GeoColor/default/${new Date().toISOString().split('T')[0]}/GoogleMapsCompatible_Level8/5/12/9.jpg`,
    type: 'image',
  },
  {
    name: 'NASA GIBS Capabilities',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    type: 'json',
  },

  // === ALTERNATIVES ===
  {
    name: 'OpenWeatherMap Satellite (needs API key)',
    url: 'https://tile.openweathermap.org/map/clouds_new/5/9/12.png?appid=demo',
    type: 'image',
  },
];

async function testSource(source: Omit<SourceTest, 'status'>): Promise<SourceTest> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(source.url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Math.round(performance.now() - startTime);

    // Get response headers we care about
    const headers: Record<string, string> = {};
    ['access-control-allow-origin', 'content-type', 'x-frame-options'].forEach(h => {
      const val = response.headers.get(h);
      if (val) headers[h] = val;
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      // Check if it looks like a referer block
      if (response.status === 403) {
        return {
          ...source,
          status: 'referer-error',
          responseTime,
          headers,
          contentType,
          error: `HTTP ${response.status}: Forbidden (likely referer restriction)`,
        };
      }
      return {
        ...source,
        status: 'network-error',
        responseTime,
        headers,
        contentType,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // For JSON, try to parse
    if (source.type === 'json') {
      try {
        await response.json();
      } catch {
        // XML is fine too (capabilities doc)
        const text = await response.text();
        if (!text.includes('<?xml')) {
          return {
            ...source,
            status: 'network-error',
            responseTime,
            headers,
            contentType,
            error: 'Invalid JSON/XML response',
          };
        }
      }
    }

    // For images, check content-type
    if (source.type === 'image') {
      if (!contentType.includes('image/')) {
        // Check if we got an error page instead
        const text = await response.text();
        if (text.includes('blocked') || text.includes('denied') || text.includes('forbidden')) {
          return {
            ...source,
            status: 'referer-error',
            responseTime,
            headers,
            contentType,
            error: 'Got text/error instead of image (referer block?)',
          };
        }
      }
    }

    return {
      ...source,
      status: 'success',
      responseTime,
      headers,
      contentType,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const responseTime = Math.round(performance.now() - startTime);

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return {
          ...source,
          status: 'timeout',
          responseTime,
          error: 'Request timed out after 15s',
        };
      }
      // CORS errors show up as TypeError with specific message
      if (err.message.includes('Failed to fetch') || err.message.includes('CORS')) {
        return {
          ...source,
          status: 'cors-error',
          responseTime,
          error: 'CORS error - blocked by browser (missing Access-Control-Allow-Origin)',
        };
      }
      return {
        ...source,
        status: 'network-error',
        responseTime,
        error: err.message,
      };
    }

    return {
      ...source,
      status: 'network-error',
      responseTime,
      error: 'Unknown error',
    };
  }
}

function StatusBadge({ status }: { status: SourceTest['status'] }) {
  const colors: Record<SourceTest['status'], string> = {
    pending: '#666',
    loading: '#f0ad4e',
    success: '#5cb85c',
    'cors-error': '#d9534f',
    'referer-error': '#f0ad4e',
    'network-error': '#d9534f',
    timeout: '#d9534f',
  };

  const labels: Record<SourceTest['status'], string> = {
    pending: '⏳ Pending',
    loading: '🔄 Loading',
    success: '✅ OK',
    'cors-error': '🚫 CORS',
    'referer-error': '🔒 Referer',
    'network-error': '❌ Error',
    timeout: '⏱️ Timeout',
  };

  return (
    <span className="status-badge" style={{ backgroundColor: colors[status] }}>
      {labels[status]}
    </span>
  );
}

export function DebugPage() {
  const [sources, setSources] = useState<SourceTest[]>(
    DATA_SOURCES.map(s => ({ ...s, status: 'pending' as const }))
  );
  const [testing, setTesting] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const runTests = async () => {
    setTesting(true);
    setSources(DATA_SOURCES.map(s => ({ ...s, status: 'loading' as const })));

    // Test all sources in parallel
    const results = await Promise.all(DATA_SOURCES.map(testSource));
    setSources(results);
    setLastRun(new Date().toLocaleString());
    setTesting(false);
  };

  useEffect(() => {
    runTests();
  }, []);

  const workingCount = sources.filter(s => s.status === 'success').length;
  const errorCount = sources.filter(s => ['cors-error', 'referer-error', 'network-error', 'timeout'].includes(s.status)).length;

  return (
    <div className="debug-page">
      <header className="debug-header">
        <h1>🔧 Weather Loop Debug</h1>
        <p>Data source health check</p>
      </header>

      <div className="debug-summary">
        <div className="summary-item success">
          <span className="summary-value">{workingCount}</span>
          <span className="summary-label">Working</span>
        </div>
        <div className="summary-item error">
          <span className="summary-value">{errorCount}</span>
          <span className="summary-label">Issues</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{sources.length}</span>
          <span className="summary-label">Total</span>
        </div>
      </div>

      <div className="debug-controls">
        <button onClick={runTests} disabled={testing} className="retest-btn">
          {testing ? '🔄 Testing...' : '🔄 Re-test All'}
        </button>
        {lastRun && <span className="last-run">Last run: {lastRun}</span>}
      </div>

      <div className="sources-list">
        {sources.map((source, i) => (
          <div key={i} className={`source-item ${source.status}`}>
            <div className="source-header">
              <span className="source-name">{source.name}</span>
              <StatusBadge status={source.status} />
            </div>

            <div className="source-details">
              <div className="source-url">
                <code>{source.url.length > 100 ? source.url.slice(0, 100) + '...' : source.url}</code>
              </div>

              {source.responseTime && (
                <span className="response-time">{source.responseTime}ms</span>
              )}

              {source.error && (
                <div className="source-error">
                  ⚠️ {source.error}
                </div>
              )}

              {source.headers && Object.keys(source.headers).length > 0 && (
                <div className="source-headers">
                  {Object.entries(source.headers).map(([k, v]) => (
                    <div key={k} className="header-item">
                      <span className="header-key">{k}:</span>
                      <span className="header-value">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <footer className="debug-footer">
        <p>CORS errors = browser blocks the request (missing Access-Control-Allow-Origin header)</p>
        <p>Referer errors = server blocks requests without valid Referer header (GitHub Pages issue)</p>
        <a href="./">← Back to app</a>
      </footer>
    </div>
  );
}
