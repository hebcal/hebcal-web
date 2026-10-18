import {readFileSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HDate} from '@hebcal/hdate';
import dayjs from 'dayjs';
import {CACHE_CONTROL_7DAYS} from './cacheControl.js';
import {getDefaultHebrewYear} from './dateUtil.js';
import {browseSitemapSlugsForIso} from './shabbat-browse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ORIGIN = 'https://www.hebcal.com';
export const OPENAPI_PATH = '/api-docs/openapi.json';
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';

/**
 * llms.txt (https://llmstxt.org/), also the body of the Markdown homepage
 */
const llmsMarkdown = readFileSync(
    path.join(__dirname, '..', 'views', 'llms.md'), 'utf8');

export function llmsTxt(ctx) {
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.type = 'text/plain; charset=utf-8';
  ctx.body = llmsMarkdown;
}

/**
 * Whether the client prefers Markdown over HTML (and JSON). A browser's
 * `Accept: text/html,...,*\/*;q=0.8` and a bare `*\/*` both resolve to HTML,
 * because `ctx.accepts()` breaks ties by the order of the types offered here.
 * @param {any} ctx
 * @return {boolean}
 */
export function prefersMarkdown(ctx) {
  return ctx.accepts('html', 'json', 'text/markdown') === 'text/markdown';
}

const API_CATALOG_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

/**
 * Human-readable documentation page for each REST endpoint (the
 * `service-doc` link), from https://www.hebcal.com/home/developer-apis
 */
const API_DOCS = {
  '/hebcal': '/home/195/jewish-calendar-rest-api',
  '/converter': '/home/219/hebrew-date-converter-rest-api',
  '/shabbat': '/home/197/shabbat-times-rest-api',
  '/zmanim': '/home/1663/zmanim-halachic-times-api',
  '/leyning': '/home/4277/leyning-torah-reading-api',
  '/yahrzeit': '/home/1705/yahrzeit-anniversary-api',
};

/**
 * RFC 9727 API catalog. Every REST endpoint is described by the one
 * OpenAPI document (service-desc), but each has its own service-doc page.
 */
const apiCatalogBody = JSON.stringify({
  linkset: Object.entries(API_DOCS)
      .map(([p, doc]) => ({
        'anchor': ORIGIN + p,
        'service-desc': [{
          href: ORIGIN + OPENAPI_PATH,
          type: 'application/vnd.oai.openapi+json',
        }],
        'service-doc': [{
          href: ORIGIN + doc,
          type: 'text/html',
        }],
      })),
}, null, 2);

export function apiCatalog(ctx) {
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Link', `<${ORIGIN}/.well-known/api-catalog>; rel="api-catalog"`);
  ctx.type = API_CATALOG_TYPE;
  ctx.body = apiCatalogBody;
}

/**
 * MCP server card for the Streamable HTTP server at /mcp (served by
 * hebcal-api-go). Mirrors the `io.github.hebcal/hebcal` entry published to
 * registry.modelcontextprotocol.io; bump `version` when that is republished.
 */
const mcpServerCardBody = JSON.stringify({
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: 'io.github.hebcal/hebcal',
  title: 'Hebcal Jewish Calendar',
  description: 'Jewish calendar tools: Hebrew/Gregorian date conversion, ' +
    'Jewish holidays, Shabbat candle-lighting times, weekly Torah portion, ' +
    'Daf Yomi and Yahrzeit dates.',
  version: '0.9.9',
  websiteUrl: ORIGIN + '/home/5027/jewish-calendar-model-context-protocol-mcp',
  icons: [
    {src: ORIGIN + '/favicon.svg', mimeType: 'image/svg+xml', sizes: ['any']},
    {src: ORIGIN + '/android-chrome-512x512.png', mimeType: 'image/png', sizes: ['512x512']},
    {src: ORIGIN + '/android-chrome-192x192.png', mimeType: 'image/png', sizes: ['192x192']},
  ],
  repository: {
    url: 'https://github.com/hebcal/hebcal-mcp',
    source: 'github',
  },
  remotes: [{
    type: 'streamable-http',
    url: ORIGIN + '/mcp',
  }],
}, null, 2);

export function mcpServerCard(ctx) {
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.type = 'application/json';
  ctx.body = mcpServerCardBody;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/** Top-level pages that no other sitemap lists */
const MAIN_PAGES = [
  '/',
  '/hebcal',
  '/converter',
  '/holidays/',
  '/shabbat/browse/',
  '/sedrot/',
  '/sedrot/grid',
  '/yahrzeit',
  '/ical/',
  '/api-docs/',
];

/**
 * Top countries by visits (Matomo, Jan-Sep 2026), ISO 3166 codes in rank order.
 * Excludes countries with no meaningful Jewish population whose traffic is
 * essentially bots (China, Singapore, Hong Kong, Japan, South Korea, Vietnam,
 * Indonesia, Bangladesh, Nigeria, Malaysia).
 */
const TOP_COUNTRIES = [
  'US', 'IL', 'CA', 'GB', 'BR', 'AU', 'MX', 'DE', 'FR', 'ZA',
  'AR', 'CO', 'NL', 'IN', 'ES', 'PH', 'PL', 'SE', 'IT', 'RO',
  'CH', 'BE', 'CL', 'VE', 'BM', 'TR', 'PA', 'DK', 'IE', 'HU',
  'NZ', 'EC', 'AT', 'FI', 'CZ',
];

/**
 * `/sitemap.xml` is a sitemap index. The protocol forbids an index from
 * listing another index, so only the per-country Shabbat sitemaps for the
 * top countries are listed here. The full set is reachable through
 * `/shabbat/browse/sitemap.xml` (itself an index), and that index and the
 * WordPress index at `/home/sitemap.xml` are advertised from robots.txt.
 * @param {any} ctx
 */
export function sitemapIndex(ctx) {
  const lastmod = dayjs().day(0).format('YYYY-MM-DD');
  const locs = [
    '/sitemap-pages.xml',
    '/learning/sitemap.txt',
    '/omer/sitemap.txt',
    '/sitemap_zips.txt',
    ...browseSitemapSlugsForIso(TOP_COUNTRIES).map((c) => `/shabbat/browse/${c}.xml`),
  ];
  const entries = locs.map((loc) =>
    `<sitemap>\n<loc>${ORIGIN}${loc}</loc>\n<lastmod>${lastmod}</lastmod>\n</sitemap>\n`);
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.type = 'text/xml';
  ctx.body = XML_HEADER + `<sitemapindex xmlns="${SITEMAP_NS}">\n` +
    entries.join('') + '</sitemapindex>\n';
}

/**
 * Pages linked from the homepage that change at most monthly: the holiday
 * calendars for the current Hebrew year, the current (or, from 10 December,
 * next) Gregorian year, and the Torah readings and Omer count for the Hebrew year. Mirrors
 * the links in `views/homepage.ejs`. Daily/weekly pages (this week's parsha,
 * daily learning) are deliberately omitted.
 * @param {Date} [today]
 * @return {string[]}
 */
export function datedPages(today = new Date()) {
  const hy = getDefaultHebrewYear(new HDate(today));
  const gy = today.getFullYear();
  const gm = today.getMonth() + 1;
  const holidayGy = (gm === 12 && today.getDate() >= 10) ? gy + 1 : gy;
  return [
    `/holidays/${hy - 3761}-${hy - 3760}`,
    `/holidays/${holidayGy}`,
    `/sedrot/${hy}?i=off`,
    `/sedrot/${hy}?i=on`,
    `/omer/${hy}`,
  ];
}

export function sitemapPages(ctx) {
  const entries = [...MAIN_PAGES, ...datedPages()].map((loc) => `<url><loc>${ORIGIN}${loc}</loc></url>\n`);
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  ctx.type = 'text/xml';
  ctx.body = XML_HEADER + `<urlset xmlns="${SITEMAP_NS}">\n` +
    entries.join('') + '</urlset>\n';
}

/**
 * Converts one of our own masthead HTML fragments to Markdown: links become
 * absolute Markdown links and every other tag is dropped.
 * @param {string} html
 * @return {string}
 */
export function htmlFragmentToMarkdown(html) {
  return html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs, (_, href, text) => {
        const url = href.startsWith('/') ? ORIGIN + href : href;
        return `[${text.replace(/<[^>]+>/g, '')}](${url})`;
      })
      .replace(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&apos;', '\'')
      .replaceAll('&quot;', '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replaceAll('&amp;', '&')
      .replace(/\s+/g, ' ')
      .trim();
}

/**
 * Markdown rendering of the homepage: today's masthead (date, Hebrew date,
 * parsha, holidays, candle-lighting), then the llms.txt overview.
 * @param {any} ctx
 */
export function homepageMarkdown(ctx) {
  const today = ctx.state.items.map((item) => '- ' + htmlFragmentToMarkdown(item));
  if (ctx.state.holidayBlurb) {
    today.push('- ' + htmlFragmentToMarkdown(ctx.state.holidayBlurb));
  }
  const [title, ...rest] = llmsMarkdown.split('\n');
  ctx.type = MARKDOWN_TYPE;
  ctx.body = [
    title,
    '',
    '## Today',
    '',
    ...today,
    ...rest,
  ].join('\n');
}

/**
 * Error middleware for clients that prefer Markdown. Mount it just inside
 * koa-error, which only knows HTML, text and JSON: given
 * `Accept: text/markdown` it would send no body at all. Everyone else's
 * errors are re-thrown to koa-error untouched.
 * @param {any} ctx
 * @param {Function} next
 */
export async function markdownErrors(ctx, next) {
  try {
    await next();
    if (ctx.status === 404 && !ctx.body) {
      ctx.throw(404);
    }
  } catch (err) {
    // the body depends on Accept: Markdown here, else HTML/JSON/text
    ctx.vary('Accept');
    if (!prefersMarkdown(ctx)) {
      throw err;
    }
    const status = typeof err.status === 'number' ? err.status : 500;
    ctx.status = status;
    ctx.app.emit('error', err, ctx);
    const statusText = http.STATUS_CODES[status] || 'Error';
    const reqPath = ctx.request.path.replace(/[`\r\n]/g, '');
    const lines = [`# ${status} ${statusText}`, ''];
    if (status === 404) {
      lines.push(`The requested URL \`${reqPath}\` was not found on this server.`);
    } else {
      lines.push(`The request for \`${reqPath}\` could not be completed.`);
    }
    if (err.expose && err.message !== statusText) {
      lines.push('', err.message);
    }
    lines.push('',
        'These may help:',
        '',
        `- [Hebcal home page](${ORIGIN}/)`,
        `- [Overview for AI agents (llms.txt)](${ORIGIN}/llms.txt)`,
        `- [REST API documentation](${ORIGIN}/api-docs/)`,
        `- [Sitemap](${ORIGIN}/sitemap.xml)`,
        '');
    ctx.type = MARKDOWN_TYPE;
    ctx.body = lines.join('\n');
  }
}
