import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Clear old caches on startup, then register updated SW
if ('serviceWorker' in navigator) {
  caches.keys().then(keys => keys.forEach(k => { if (k !== 'tabby-pulse-v2') caches.delete(k); }));
  navigator.serviceWorker.register('/sw.js');
}
