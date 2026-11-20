import { createRoot } from 'react-dom/client';
import { App } from './App';
import { browserMockApi } from './mockApi';
import { httpApi, serverState } from './httpApi';
import { PinScreen } from './components/PinScreen';
import './styles.css';

// Normally the page is served by the local server (npm start). Opened any other way
// (e.g. a static preview), it falls back to sample data so the UI can still be explored.
// On a phone (preview over the local network) the PIN comes first and the app is read-only.
void serverState().then((state) => {
  const root = createRoot(document.getElementById('root')!);
  if (state === 'pin') {
    root.render(<PinScreen />);
    return;
  }
  window.pricer = state === 'none' ? browserMockApi() : httpApi();
  window.pricerReadOnly = state === 'readonly';
  if (window.pricerReadOnly) document.documentElement.classList.add('readonly');
  root.render(<App />);
});
