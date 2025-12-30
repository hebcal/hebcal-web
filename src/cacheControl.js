export const CACHE_CONTROL_1_YEAR = cacheControl(365);
export const CACHE_CONTROL_IMMUTABLE = CACHE_CONTROL_1_YEAR + ', immutable';
export const CACHE_CONTROL_30DAYS = cacheControl(30);
export const CACHE_CONTROL_7DAYS = cacheControl(7);

/**
 * @param {number} days
 * @return {string}
 */
export function cacheControl(days) {
  const seconds = Math.trunc(days * 24 * 60 * 60);
  return `public, max-age=${seconds}, s-maxage=${seconds}`;
}
