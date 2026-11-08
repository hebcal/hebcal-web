/**
 * Regenerates the inlined above-the-fold CSS in views/partials/critical-*.css.
 *
 * This is a rare, manual step and is NOT part of `npm run build`. Re-run it
 * only after a change to the SCSS or to the markup above the fold on the
 * converter, holiday year/detail or /hebcal results pages. `critical` and
 * `playwright` are deliberately not in package.json (Chromium alone is
 * hundreds of MB). Run it via ./extract-critical.sh, which installs them with
 * `npm install --no-save` and starts a dev server on :8080 if needed. The
 * next plain `npm install` prunes both packages again.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import postcss from 'postcss';

let critical;
try {
  ({ critical } = await import('critical'));
  await import('playwright');
} catch {
  console.error('extract-critical.js needs critical and playwright, which are not\n' +
    'in package.json. Run ./extract-critical.sh instead.');
  process.exit(1);
}

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

// critical v9's render engine strips pseudo-classes from a selector before
// asking whether it matches anything above the fold, so rules that only apply
// once the user interacts (.btn:hover, .form-control:focus, ...) are always
// kept. None of them can affect first paint, so drop them. A pseudo-class
// inside :not() is a negation that applies at rest (.btn:not(:disabled)), so
// those are ignored when deciding. ::placeholder is deliberately NOT here:
// the navbar's empty search box shows its placeholder at first paint.
const INTERACTION_PSEUDO = /:(?:hover|focus|focus-visible|focus-within|active|disabled)(?![\w-])/;

function onlyAppliesOnInteraction(selector) {
  return INTERACTION_PSEUDO.test(selector.replace(/:not\([^()]*\)/g, ''));
}

function dropInteractionRules(css) {
  const root = postcss.parse(css);
  let dropped = 0;
  root.walkRules((rule) => {
    const keep = rule.selectors.filter((sel) => !onlyAppliesOnInteraction(sel));
    if (keep.length === rule.selectors.length) return;
    dropped += rule.selectors.length - keep.length;
    if (keep.length) {
      rule.selector = keep.join(',');
    } else {
      rule.remove();
    }
  });
  // Remove @media/@supports blocks left empty.
  root.walkAtRules((at) => {
    if (at.nodes && at.nodes.length === 0) at.remove();
  });
  return { root, dropped };
}

// critical v9 emits the same @font-face / @media block more than once (its
// own dedupe pass only merges plain rules). Keep the LAST copy of each
// identical top-level block, which leaves the cascade unchanged.
function dropDuplicateBlocks(root) {
  const seen = new Set();
  let removed = 0;
  for (const node of [...root.nodes].reverse()) {
    const text = node.toString();
    if (seen.has(text)) {
      node.remove();
      removed++;
    } else {
      seen.add(text);
    }
  }
  return removed;
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
    const { root, dropped } = dropInteractionRules(result.css);
    const dupes = dropDuplicateBlocks(root);
    const css = root.toString();

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, css, 'utf-8');
    console.log(`  ✓ Written to ${out} (${css.length} bytes, ` +
      `dropped ${dropped} interaction-only selectors, ${dupes} duplicate blocks)`);
  } catch (err) {
    console.error(`  ✗ Failed for ${src}:`, err.message);
    process.exit(1);
  }
}

for (const page of PAGES) {
  await extractCritical(page);
}

console.log('\nDone.');
