import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { initCatalogAutoUpdate } from './lib/storage';
import './index.css';

registerSW({ immediate: true });
initCatalogAutoUpdate();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
