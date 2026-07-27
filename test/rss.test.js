import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';

const server = makeServer(app);

describe('Hebrew Date RSS Feeds', () => {
  it('should return Today\'s Hebrew Date in English', async () => {
    const response = await request(server)
        .get('/etc/hdate-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should return Today\'s Hebrew Date in Hebrew', async () => {
    const response = await request(server)
        .get('/etc/hdate-he.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should return Today\'s Hebrew Date in German', async () => {
    const response = await request(server)
        .get('/etc/hdate-de.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
  });

  it('should reject POST on /etc/hdate XML with 405', async () => {
    const response = await request(server)
        .post('/etc/hdate-en.xml');
    expect(response.status).toBe(405);
    expect(response.type).toContain('html');
  });
});

describe('Parashat ha-Shavua RSS Feeds', () => {
  it('should return Torah reading RSS in English', async () => {
    const response = await request(server)
        .get('/sedrot/index-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });

  it('should return Torah reading RSS for Israel in English', async () => {
    const response = await request(server)
        .get('/sedrot/israel-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });

  it('should return Torah reading RSS in French', async () => {
    const response = await request(server)
        .get('/sedrot/index-fr.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });
});

describe('Daily Learning RSS Feeds', () => {
  it('should return 200 for /etc/dafyomi RSS feed', async () => {
    const response = await request(server)
        .get('/etc/dafyomi-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
  });

  it('should return 200 for /etc/myomi RSS feed', async () => {
    const response = await request(server)
        .get('/etc/myomi-en.xml');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
  });
});

describe('Shabbat Times RSS Feeds', () => {
  it('should return Shabbat times RSS with city=', async () => {
    const response = await request(server)
        .get('/shabbat?city=Los+Angeles&m=50&cfg=r');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
    // Should contain candle lighting information
    expect(response.text).toMatch(/Candle lighting|Havdalah/i);
  });

  it('should return Shabbat times RSS with geonameid', async () => {
    const response = await request(server)
        .get('/shabbat?cfg=r&geonameid=293397&M=on');
    expect(response.status).toBe(200);
    expect(response.type).toContain('xml');
    expect(response.text).toContain('<?xml');
    expect(response.text).toContain('<rss');
    expect(response.text).toContain('<channel>');
    expect(response.text).toContain('<item>');
  });
});

/**
 * Replaces the values that legitimately change from one run to the next, so a
 * feed can be compared against a fixed expectation.
 * @param {string} xml
 * @return {string}
 */
function normalizeFeed(xml) {
  return xml
      .replaceAll(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>-</lastBuildDate>')
      .replaceAll(/<pubDate>[^<]*<\/pubDate>/g, '<pubDate>-</pubDate>');
}

// These feeds are the reason `eventsToRss2()` and `makeTorahMemoText()` now
// live in this repo instead of @hebcal/rest-api. The expectations below are
// verbatim copies of what the routes emitted before the move.
describe('RSS feed contents', () => {
  it('renders Parashat ha-Shavua with Torah and Haftarah', async () => {
    const response = await request(server)
        .get('/sedrot/index-en.xml?dt=2026-04-15');
    expect(response.status).toBe(200);
    const xml = normalizeFeed(response.text);
    expect(xml).toContain('<title>Hebcal Parashat ha-Shavua (Diaspora)</title>');
    expect(xml).toContain('<link>https://hebcal.com/s/?us=sedrot-diaspora&amp;um=rss</link>');
    expect(xml).toContain(`<item>
<title>Parashat Tazria-Metzora - 18 April 2026</title>
<link>https://hebcal.com/s/5786/27d?us=sedrot-diaspora&amp;um=rss</link>
<guid isPermaLink="false">https://www.hebcal.com/sedrot/tazria-metzora-20260418#20260418-parashat-tazria-metzora-18-april-2026</guid>
<description><![CDATA[<p>Torah: Leviticus 12:1-15:33; Numbers 28:9-15</p>
<p>Haftarah: Isaiah 66:1-24 | Shabbat Rosh Chodesh</p>]]></description>
<category>parashat</category>
<pubDate>-</pubDate>
</item>`);
  });

  it('renders Parashat ha-Shavua for Israel', async () => {
    const response = await request(server)
        .get('/sedrot/israel-en.xml?dt=2026-04-15');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>Hebcal Parashat ha-Shavua (Israel)</title>');
    expect(response.text).toContain(
        '<link>https://hebcal.com/s/5786i/27d?us=sedrot-israel&amp;um=rss</link>');
  });

  it('renders Shabbat candle lighting times and holiday descriptions', async () => {
    const response = await request(server)
        .get('/shabbat?cfg=r&geonameid=5128581&b=18&M=on&gy=2026&gm=4&gd=15');
    expect(response.status).toBe(200);
    const xml = normalizeFeed(response.text);
    expect(xml).toContain('<title>Shabbat Times for New York, USA - Hebcal</title>');
    expect(xml).toContain(`<item>
<title>Havdalah: 8:22pm</title>
<link>https://www.hebcal.com/shabbat?geonameid=5128581&amp;ue=off&amp;b=18&amp;td=8.5&amp;lg=s&amp;dt=2026-04-18&amp;utm_source=shabbat1c&amp;utm_medium=rss#20260418-havdalah</link>
<guid isPermaLink="false">https://www.hebcal.com/shabbat?geonameid=5128581&amp;ue=off&amp;b=18&amp;td=8.5&amp;lg=s&amp;dt=2026-04-18#20260418-havdalah</guid>
<description>Saturday, April 18, 2026</description>
<category>havdalah</category>
<pubDate>-</pubDate>
</item>`);
    expect(xml).toContain('<geo:lat>40.71427</geo:lat>');
  });

  it('renders the custom calendar feed with holiday memos', async () => {
    const response = await request(server)
        .get('/hebcal?v=1&cfg=rss&maj=on&s=on&year=2026&month=4');
    expect(response.status).toBe(200);
    const xml = normalizeFeed(response.text);
    expect(xml).toContain('<title>Hebcal Diaspora April 2026</title>');
    expect(xml).toContain('<description>Torah: Leviticus 12:1-15:33; Numbers 28:9-15\n' +
      'Haftarah: Isaiah 66:1-24 | Shabbat Rosh Chodesh</description>');
  });
});
