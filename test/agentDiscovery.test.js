import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {datedPages, htmlFragmentToMarkdown} from '../src/agentDiscovery.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Homepage content negotiation', () => {
  it('serves Markdown with Vary: Accept for Accept: text/markdown', async () => {
    const response = await request(server).get('/').set('Accept', 'text/markdown');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(response.headers['vary']).toMatch(/\bAccept\b/);
    expect(response.text).toMatch(/^# Hebcal\n\n## Today\n\n- /);
    expect(response.text).toContain('## When to use Hebcal');
    expect(response.text).not.toContain('<');
  });

  it('turns masthead links into absolute Markdown links', async () => {
    const response = await request(server).get('/?gy=2026&gm=10&gd=15')
        .set('Accept', 'text/markdown');
    expect(response.text).toContain('- Thu, 15 October 2026\n');
    expect(response.text).toContain('- 4th of Cheshvan, 5787\n');
    expect(response.text).toContain('- [Parashat Noach](https://www.hebcal.com/sedrot/noach-20261017)\n');
  });

  it.each([
    'text/html',
    '*/*',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  ])('serves HTML with Vary: Accept for Accept: %s', async (accept) => {
    const response = await request(server).get('/').set('Accept', accept);
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.headers['vary']).toMatch(/\bAccept\b/);
  });

  it('prefers Markdown when it is ranked above HTML', async () => {
    const response = await request(server).get('/')
        .set('Accept', 'text/markdown, text/html;q=0.9');
    expect(response.headers['content-type']).toContain('text/markdown');
  });
});

describe('Homepage HTML metadata', () => {
  it('has Open Graph tags, JSON-LD and sequential headings', async () => {
    const response = await request(server).get('/');
    const html = response.text;
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:image" content="https://www.hebcal.com/android-chrome-512x512.png">');
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    expect(m).not.toBeNull();
    const jsonLD = JSON.parse(m[1]);
    const types = jsonLD['@graph'].map((x) => x['@type']);
    expect(types).toEqual(['Organization', 'WebSite']);
    expect(jsonLD['@graph'][0].contactPoint.url).toBe('https://www.hebcal.com/home/about/contact');
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((x) => Number(x[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
    expect(html).toContain('href="/api-docs/"');
  });
});

describe('Markdown error responses', () => {
  it('returns a Markdown 404 for Accept: text/markdown', async () => {
    const response = await request(server).get('/__no-such-page-xyz')
        .set('Accept', 'text/markdown');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(response.headers['vary']).toMatch(/\bAccept\b/);
    expect(response.text).toMatch(/^# 404 Not Found\n/);
    expect(response.text).toContain('`/__no-such-page-xyz` was not found');
    expect(response.text).toContain('(https://www.hebcal.com/llms.txt)');
  });

  it('includes the exposed message of a thrown error', async () => {
    const response = await request(server).get('/holidays/no-such-holiday-xyz')
        .set('Accept', 'text/markdown');
    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('text/markdown');
  });

  it('still returns HTML 404s to browsers', async () => {
    const response = await request(server).get('/__no-such-page-xyz')
        .set('Accept', 'text/html');
    expect(response.status).toBe(404);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('<h1>404 Not Found</h1>');
  });

  it('still returns JSON 404s to API clients', async () => {
    const response = await request(server).get('/__no-such-page-xyz')
        .set('Accept', 'application/json');
    expect(response.status).toBe(404);
    expect(response.type).toBe('application/json');
    expect(response.body.error).toBe('Not Found');
  });
});

describe('Agent discovery files', () => {
  it('serves /llms.txt with a when-to-use section', async () => {
    const response = await request(server).get('/llms.txt');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.text).toMatch(/^# Hebcal\n\n> /);
    expect(response.text).toContain('## When to use Hebcal');
    expect(response.text).toContain('https://www.hebcal.com/mcp');
    expect(response.text).toContain('https://www.hebcal.com/api-docs/openapi.json');
  });

  it('redirects /openapi.json to the published spec', async () => {
    const response = await request(server).get('/openapi.json');
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/api-docs\/openapi\.json$/);
  });

  it('serves the spec the redirect points to', async () => {
    const response = await request(server).get('/api-docs/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
  });

  it.each(['/developers', '/docs'])('redirects %s to the developer docs', async (url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/home\/developer-apis$/);
  });

  it('serves an RFC 9727 API catalog', async () => {
    const response = await request(server).get('/.well-known/api-catalog');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe(
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"');
    expect(response.headers.link).toContain('rel="api-catalog"');
    const body = JSON.parse(response.text);
    expect(body.linkset.length).toBeGreaterThan(0);
    for (const link of body.linkset) {
      expect(link.anchor).toMatch(/^https:\/\/www\.hebcal\.com\//);
      expect(link['service-desc'][0].href).toBe('https://www.hebcal.com/api-docs/openapi.json');
      expect(link['service-doc'][0].href).toMatch(
          /^https:\/\/www\.hebcal\.com\/home\/\d+\/[a-z-]+$/);
    }
    const hebcal = body.linkset.find((l) => l.anchor.endsWith('/hebcal'));
    expect(hebcal['service-doc'][0].href).toBe(
        'https://www.hebcal.com/home/195/jewish-calendar-rest-api');
  });

  it('answers HEAD on the API catalog', async () => {
    const response = await request(server).head('/.well-known/api-catalog');
    expect(response.status).toBe(200);
    expect(response.headers.link).toContain('rel="api-catalog"');
  });

  it.each([
    '/.well-known/mcp/server-card.json',
    '/server.json',
  ])('serves the MCP server card at %s', async (url) => {
    const response = await request(server).get(url);
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.body.name).toBe('io.github.hebcal/hebcal');
    expect(response.body.remotes).toEqual([
      {type: 'streamable-http', url: 'https://www.hebcal.com/mcp'},
    ]);
  });

  it('lists the sitemaps in robots.txt', async () => {
    const response = await request(server).get('/robots.txt');
    expect(response.text).toContain('\nSitemap: https://www.hebcal.com/sitemap.xml\n');
    expect(response.text).toContain('\nSitemap: https://www.hebcal.com/shabbat/browse/sitemap.xml\n');
    expect(response.text).toContain('\nSitemap: https://www.hebcal.com/home/sitemap.xml\n');
  });

  it('serves a sitemap index that lists only leaf sitemaps', async () => {
    const response = await request(server).get('/sitemap.xml');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/xml');
    const xml = response.text;
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
    expect(locs).toContain('https://www.hebcal.com/sitemap-pages.xml');
    expect(locs).toContain('https://www.hebcal.com/learning/sitemap.txt');
    expect(locs).not.toContain('https://www.hebcal.com/shabbat/browse/sitemap.xml');
    const browse = locs.filter((loc) => /\/shabbat\/browse\/[a-z-]+\.xml$/.test(loc));
    expect(browse.length).toBeGreaterThan(0);
    expect(browse.length).toBeLessThanOrEqual(40);
    expect(browse[0]).toBe('https://www.hebcal.com/shabbat/browse/united-states.xml');
    expect(xml.match(/<lastmod>/g).length).toBe(locs.length);
  });

  it('serves the main-pages sitemap', async () => {
    const response = await request(server).get('/sitemap-pages.xml');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(response.text).toContain('<url><loc>https://www.hebcal.com/</loc></url>');
    expect(response.text).toMatch(/<loc>https:\/\/www\.hebcal\.com\/holidays\/\d{4}-\d{4}<\/loc>/);
  });

  it('lists slowly-changing dated pages', () => {
    expect(datedPages(new Date(2026, 9, 15))).toEqual([
      '/holidays/2026-2027', '/holidays/2026', '/sedrot/5787?i=off', '/sedrot/5787?i=on', '/omer/5787',
    ]);
    expect(datedPages(new Date(2026, 11, 20))[1]).toBe('/holidays/2027');
  });

  it('rejects POST to discovery files', async () => {
    const response = await request(server).post('/llms.txt');
    expect(response.status).toBe(405);
  });
});

describe('htmlFragmentToMarkdown', () => {
  it('converts relative links and strips other markup', () => {
    expect(htmlFragmentToMarkdown('<time datetime="2026-10-15">Thu</time> <small>after sunset</small>'))
        .toBe('Thu after sunset');
    expect(htmlFragmentToMarkdown('<a href="/h/sukkot">Sukkot &amp; more</a>'))
        .toBe('[Sukkot & more](https://www.hebcal.com/h/sukkot)');
    expect(htmlFragmentToMarkdown('<a href="https://example.com/x">x</a>'))
        .toBe('[x](https://example.com/x)');
    expect(htmlFragmentToMarkdown('Chag&nbsp;Sameach!&nbsp;&nbsp;&#1495; &amp;amp;'))
        .toBe('Chag Sameach! \u05d7 &amp;');
  });
});
