import { generate } from 'critical';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'path';
import postcss from 'postcss';

const fileUrl = new URL('package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(fileUrl, 'utf8'));

const SITE = 'http://localhost:8080';

const DIMENSIONS = [
  { width: 375, height: 812 },   // mobile
  { width: 768, height: 1024 },  // tablet
  { width: 1300, height: 900 },  // desktop
];

const PAGES = [
  {
    src: `${SITE}/converter?gd=14&gm=3&gy=2026&g2h=1`,
    out: 'views/partials/critical-converter.css',
  },
  {
    src: `${SITE}/holidays/2025-2026`,
    out: 'views/partials/critical-holiday-year.css',
  },
  {
    src: `${SITE}/holidays/pesach-1711`,
    out: 'views/partials/critical-holiday-detail.css',
  },
  {
    src: `${SITE}/shabbat?geonameid=5128581`,
    out: 'views/partials/critical-shabbat.css',
  },
];

async function fetchHTML(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function injectDarkMode(html) {
  // Set data-bs-theme=dark on the <html> element
  return html.replace(
    /(<html[^>]*)\bdata-bs-theme="[^"]*"/i,
    '$1data-bs-theme="dark"'
  ).replace(
    /(<html(?![^>]*data-bs-theme)[^>]*)(>)/i,
    '$1 data-bs-theme="dark"$2'
  );
}

async function extractCritical({ src, out }) {
  console.log(`Extracting critical CSS for ${src} ...`);
  try {
    const html = await fetchHTML(src);
    const darkHtml = injectDarkMode(html);

    const result = await generate({
      html: darkHtml,
      dimensions: DIMENSIONS,
      css: ['static/i/' + pkg.config.mainCss],
      penthouse: { renderWaitTime: 500 },
      rebase: false,
      base: '.',
    });

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, result.css, 'utf-8');
    console.log(`  ✓ Written to ${out} (${result.css.length} bytes)`);
  } catch (err) {
    console.error(`  ✗ Failed for ${src}:`, err.message);
    process.exit(1);
  }
}

for (const page of PAGES) {
  await extractCritical(page);
}

console.log('\nDone.');
