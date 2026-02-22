import { useState } from 'react';
import { WeatherLoop } from './components/WeatherLoop';
import { GlobeView } from './components/GlobeView';
import { MapView } from './components/MapView';
import { Globe, LayoutGrid, Map } from 'lucide-react';
import './App.css';

type ViewType = 'flat' | 'globe' | 'map';

function App() {
  const [view, setView] = useState<ViewType>('map'); // Default to new map view

  return (
    <div className="app">
      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >
          <Map size={18} />
          <span>Map</span>
        </button>
        <button
          className={`toggle-btn ${view === 'flat' ? 'active' : ''}`}
          onClick={() => setView('flat')}
        >
          <LayoutGrid size={18} />
          <span>GOES</span>
        </button>
        <button
          className={`toggle-btn ${view === 'globe' ? 'active' : ''}`}
          onClick={() => setView('globe')}
        >
          <Globe size={18} />
          <span>Globe</span>
        </button>
      </div>

      {/* Content */}
      {view === 'map' && <MapView />}
      {view === 'flat' && <WeatherLoop />}
      {view === 'globe' && <GlobeView />}
    </div>
  );
}

export default App;
