import { createRoot } from 'react-dom/client';
import { App } from './App';
import { browserMockApi } from './mockApi';
import './styles.css';

// Outside Electron (plain browser preview) use a mock bridge with sample data.
if (!window.pricer) window.pricer = browserMockApi();

createRoot(document.getElementById('root')!).render(<App />);
