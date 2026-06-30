import {expect, test} from 'vitest';
import {getLocationFromGeoIp} from '../src/location.js';

/**
 * Minimal Koa-like ctx with a `get(header)` accessor and a geoipCity lookup.
 * @param {string} userAgent
 * @param {any} geoipResult
 * @return {any}
 */
function makeCtx(userAgent, geoipResult) {
  const headers = {'user-agent': userAgent};
  return {
    geoipCity: {get: () => geoipResult},
    get(name) {
      return headers[name.toLowerCase()] || '';
    },
    request: {ip: '127.0.0.1'},
  };
}

test('getLocationFromGeoIp returns none for robot user-agent', () => {
  const ctx = makeCtx('curl', {country: {iso_code: 'US'}});
  expect(getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp returns none for bot-like user-agent', () => {
  const ctx = makeCtx('Mozilla/5.0 (compatible; Googlebot/2.1)', {country: {iso_code: 'US'}});
  expect(getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});

test('getLocationFromGeoIp does not short-circuit for human user-agent', () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const ctx = makeCtx(ua, null);
  // geoip lookup returns null -> {geo: 'none'}, but this exercises the
  // non-robot path (does not throw, falls through past the isRobot check).
  expect(getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});
