import {describe, it, expect} from 'vitest';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {makeServer} from './testServer.js';
import {jsonForScript} from '../src/common.js';

const server = makeServer(app);

// A </script> inside a <script type="application/json"> data block ends the
// element as far as the HTML parser is concerned, so everything after it
// becomes live markup. jsonForScript() escapes the characters that make that
// possible; these tests pin that behavior down.
describe('jsonForScript', () => {
  it('escapes the characters that can break out of a script element', () => {
    const out = jsonForScript({s: '</script><img src=x onerror=alert(1)>&'});
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
    expect(out).toContain('\\u0026');
  });

  it('escapes U+2028 and U+2029', () => {
    const out = jsonForScript({s: 'a\u2028b\u2029c'});
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('round-trips to a value identical to JSON.stringify', () => {
    const obj = {a: '</script>', b: 'x&y', c: 'p\u2028q', d: [1, 2, {e: '<b>'}]};
    expect(JSON.parse(jsonForScript(obj))).toEqual(obj);
    expect(JSON.stringify(JSON.parse(jsonForScript(obj)))).toBe(JSON.stringify(obj));
  });

  it('leaves JSON structure untouched', () => {
    expect(jsonForScript({a: 1, b: [2, 3]})).toBe('{"a":1,"b":[2,3]}');
  });
});

describe('rendered pages cannot break out of their JSON script blocks', () => {
  const EVIL = '</script><img src=x onerror=alert(1)>';
  it.each([
    ['hebcal results', `/hebcal?v=1&maj=on&year=2026&month=3&set=off&city-typeahead=${encodeURIComponent(EVIL)}`],
    ['shabbat', `/shabbat?geonameid=5128581&set=off&city-typeahead=${encodeURIComponent(EVIL)}`],
    ['holiday detail', '/holidays/yom-kippur-2024'],
    ['parsha index', '/sedrot/'],
  ])('%s', async (name, url) => {
    const res = await request(server).get(url);
    expect(res.status).toBe(200);
    const body = res.text;
    const blocks = [...body.matchAll(
        /<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, content] of blocks) {
      expect(content).not.toContain('</script');
      expect(content).not.toContain('<img');
    }
    expect(body).not.toContain(EVIL);
  });
});
