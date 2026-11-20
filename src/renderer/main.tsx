import { createRoot } from 'react-dom/client';
import { App } from './App';
import { browserMockApi } from './mockApi';
import { httpApi, serverAvailable } from './httpApi';
import './styles.css';

// Normally the page is served by the local server (npm start). Opened any other way
// (e.g. a static preview), it falls back to sample data so the UI can still be explored.
void serverAvailable().then((ok) => {
  window.pricer = ok ? httpApi() : browserMockApi();
  createRoot(document.getElementById('root')!).render(<App />);
});
