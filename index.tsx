import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './i18n';
import './src/index.css';
import { Suspense } from 'react';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <App />
    </Suspense>
  </React.StrictMode>
);
