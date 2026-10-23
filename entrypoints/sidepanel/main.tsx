import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, createDeps } from '../../src/ui/App.js';
import './style.css';

const container = document.getElementById('root');
if (container === null) throw new Error('side panel root element is missing');

createRoot(container).render(
  <StrictMode>
    <App deps={createDeps()} />
  </StrictMode>,
);
