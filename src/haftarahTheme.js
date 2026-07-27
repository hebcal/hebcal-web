const ORDINAL_WORDS = [
  null, 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
];

/**
 * Formats a HaftTheme (admonition/consolation) as a human-readable string
 * like `"Fifth Haftarah of Consolation"`. The rare `consolation: "3,5"` case
 * (Parashat Re'eh coincides with Rosh Chodesh, displacing the 3rd Haftarah of
 * Consolation onto Ki Teitzei alongside the 5th) is rendered as
 * `"Third and Fifth Haftarah of Consolation"`.
 * @param {{admonition?: number, consolation?: number|string}} [theme]
 * @return {string|undefined}
 */
export function formatHaftarahTheme(theme) {
  if (!theme) {
    return undefined;
  }
  if (typeof theme.admonition === 'number') {
    return `${ORDINAL_WORDS[theme.admonition]} Haftarah of Admonition`;
  }
  if (typeof theme.consolation !== 'undefined') {
    const ordinals = String(theme.consolation).split(',')
        .map((num) => ORDINAL_WORDS[Number(num)])
        .join(' and ');
    return `${ordinals} Haftarah of Consolation`;
  }
  return undefined;
}
