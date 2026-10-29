/**
 * Rasterizes the store icon source to the 128x128 PNG required by the
 * Chrome Web Store and Edge Add-ons consoles.
 *
 * The SVG in `store/assets/icon-source.svg` is the source of truth. Chromium
 * renders it at exactly 128 CSS pixels with a transparent background, so the
 * output is lossless at the required size instead of a resized export.
 *
 * Usage: node scripts/render-store-icon.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'store', 'assets', 'icon-source.svg');
const OUTPUT = path.join(ROOT, 'store', 'assets', 'icon-128.png');

const svg = await readFile(SOURCE, 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>html,body{margin:0;width:128px;height:128px;overflow:hidden;background:transparent}` +
      `svg{display:block}</style></head><body>${svg}</body></html>`,
  );
  await page.screenshot({ path: OUTPUT, omitBackground: true });
  console.log(`icon: ${OUTPUT}`);
} finally {
  await browser.close();
}
