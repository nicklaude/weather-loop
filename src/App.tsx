import { useState } from 'react';
import { WeatherLoop } from './components/WeatherLoop';
import { GlobeView } from './components/GlobeView';
import { Globe, LayoutGrid } from 'lucide-react';
import './App.css';

function App() {
  const [view, setView] = useState<'flat' | 'globe'>('flat');

  return (
    <div className="app">
      {/* View Toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === 'flat' ? 'active' : ''}`}
          onClick={() => setView('flat')}
        >
          <LayoutGrid size={18} />
          <span>Flat</span>
        </button>
        <button
          className={`toggle-btn ${view === 'globe' ? 'active' : ''}`}
          onClick={() => setView('globe')}
        >
          <Globe size={18} />
          <span>3D Globe</span>
        </button>
      </div>

      {/* Content */}
      {view === 'flat' ? <WeatherLoop /> : <GlobeView />}
    </div>
  );
}

export default App;
