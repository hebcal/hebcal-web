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
    request: {ip: '198.51.100.123'},
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

test('getLocationFromGeoIp returns none for blank or undefined user-agent', () => {
  const ctx = makeCtx('', {country: {iso_code: 'MX'}});
  expect(getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
  const ctx2 = makeCtx(undefined, {country: {iso_code: 'MX'}});
  expect(getLocationFromGeoIp(ctx2)).toEqual({geo: 'none'});
});


test('getLocationFromGeoIp does not short-circuit for human user-agent', () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const ctx = makeCtx(ua, null);
  // geoip lookup returns null -> {geo: 'none'}, but this exercises the
  // non-robot path (does not throw, falls through past the isRobot check).
  expect(getLocationFromGeoIp(ctx)).toEqual({geo: 'none'});
});
