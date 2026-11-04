import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#2F6FEB"/>
<circle cx="50" cy="50" r="28" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="14"/>
<path d="M50 22 A28 28 0 0 1 76.6 58.7" fill="none" stroke="#ffffff" stroke-width="14"/>
<path d="M76.6 58.7 A28 28 0 0 1 36 74.2" fill="none" stroke="#FFD166" stroke-width="14"/>
</svg>`;
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, s] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<style>body{margin:0}</style>${svg(s)}`);
  await p.screenshot({ path: `public/icons/${name}.png` });
}
await b.close();
