/**
 * @param {string} val
 * @return {boolean}
 */
export function empty(val) {
  return typeof val !== 'string' || val.length === 0;
}

/**
 * @param {string|undefined|number} val
 * @return {boolean}
 */
export function off(val) {
  return val === undefined || val === 'off' || val == '0';
}
