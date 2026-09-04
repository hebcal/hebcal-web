import {expect, test} from 'vitest';
import {getLocationFromGeoIp, getLocationFromQuery} from '../src/location.js';

/**
 * Minimal Koa-like ctx with a `get(header)` accessor and a geoipClient that
 * resolves to the supplied lookup result (mimicking the hebcal-geoip2 service).
 * @param {string} userAgent
 * @param {any} geoipResult
 * @return {any}
 */
function makeCtx(userAgent, geoipResult) {
  const headers = {'user-agent': userAgent};
  return {
    geoipClient: {lookup: async () => geoipResult},
    get(name) {
      return headers[name.toLowerCase()] || '';
    },
    request: {ip: '198.51.100.123'},
  };
}

test('getLocationFromGeoIp returns none for robot user-agent', async () => {
  const ctx = makeCtx('curl', {country: {iso_code: 'US'}});
  expect(await getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp returns none for bot-like user-agent', async () => {
  const ctx = makeCtx('Mozilla/5.0 (compatible; Googlebot/2.1)', {country: {iso_code: 'US'}});
  expect(await getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp returns none for blank or undefined user-agent', async () => {
  const ctx = makeCtx('', {country: {iso_code: 'MX'}});
  expect(await getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
  const ctx2 = makeCtx(undefined, {country: {iso_code: 'MX'}});
  expect(await getLocationFromGeoIp(ctx2)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp returns none when geoip client is absent', async () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const ctx = makeCtx(ua, {country: {iso_code: 'US'}});
  delete ctx.geoipClient;
  expect(await getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp does not short-circuit for human user-agent', async () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const ctx = makeCtx(ua, null);
  // service returns null (unknown IP or unreachable) -> {geo: 'none'}, but this
  // exercises the non-robot path (does not throw, falls through past isRobot).
  expect(await getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

// Pins the two url-decoding leniency hacks for a latitude/longitude
// request's tzid: a raw UTC offset like "+03:00" (whose "+" url-decodes to
// " "), and "Etc/GMT+5" (whose "+" likewise url-decodes to " ", landing as
// "Etc/GMT 5").
test.each([
  ['Etc/GMT+5', 'Etc/GMT+5'], // untouched, already valid
  ['Etc/GMT 5', 'Etc/GMT+5'], // "+" url-decoded to " "
  ['Etc/GMT 12', 'Etc/GMT+12'], // two-digit offset
  [' 03:00', 'Etc/GMT+3'], // "+03:00" url-decoded to " 03:00"
  ['-02:00', 'Etc/GMT-2'],
])('getLocationFromQuery tzid=%s leniency', (tzid, want) => {
  const query = {latitude: '41.85', longitude: '-87.65', tzid};
  const loc = getLocationFromQuery({}, query);
  expect(loc.getTzid()).toBe(want);
});
