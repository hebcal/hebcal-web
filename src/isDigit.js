/**
 * decimal-digit character test
 * @param {string} str
 * @param {number} idx
 * @return {boolean}
 */
export function isDigit(str, idx) {
  const code = str.codePointAt(idx);
  return code >= 48 && code <= 57;
}
