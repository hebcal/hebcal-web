import { critical } from 'critical';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
    src: `${SITE}/hebcal?v=1&year=2026&yt=G&i=off&maj=on&min=on&nx=on&mf=on&ss=on&mod=on&s=on&mm=0&lg=s&c=on&geo=geoname&zip=&geonameid=5128581&b=18&M=on&m=&ue=off`,
    out: 'views/partials/critical-hebcal-results.css',
  },
];

async function fetchHTML(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// Drop the page's own stylesheets (the previously generated critical <style>
// and the deferred main.css <link>) so the main CSS passed via `css` below is
// the only input -- otherwise last run's output feeds back into this run.
function stripStyles(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '');
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
    const darkHtml = injectDarkMode(stripStyles(html));

    // critical v9: the render engine (Playwright) measures what is actually
    // painted above the fold at each viewport; the static engine would keep
    // every rule that matches anywhere in the document.
    const result = await critical({
      html: darkHtml,
      engine: 'render',
      dimensions: DIMENSIONS,
      css: ['static/i/' + pkg.config.mainCss],
      base: '.',
    });
    for (const w of result.report.warnings) console.warn(`  ! ${w}`);

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
