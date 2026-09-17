import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/styles/globals.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento #root para montar la aplicación.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: el service worker sólo cachea el shell estático (nunca /api).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* la aplicación funciona igual sin service worker */
    });
  });
}
