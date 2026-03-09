/**
 * @param {string} countryCode 
 * @return {string}
 */
export function flag(countryCode) {
  return countryCode
    .toUpperCase()
    .split('')
    .map(char => String.fromCodePoint(0x1F1E6 + char.charCodeAt(0) - 65))
    .join('');
}
