import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createSettingsStore } from '../../src/lib/settings.js';
import { storageArea } from '../../src/lib/chromeApi.js';
import { SettingsPage } from '../../src/ui/SettingsPage.js';
import './style.css';

const container = document.getElementById('root');
if (container === null) throw new Error('options root element is missing');

const store = createSettingsStore(storageArea);

createRoot(container).render(
  <StrictMode>
    <SettingsPage store={store} permissions={browser.permissions} />
  </StrictMode>,
);
