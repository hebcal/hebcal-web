import {Locale, gematriya} from '@hebcal/core';

const heInStr = 'בְּ';
const monthInPrefix = {
  'Tamuz': 'בְּתַמּוּז',
  'Elul': 'בֶּאֱלוּל',
  'Tishrei': 'בְּתִשְׁרֵי',
  'Kislev': 'בְּכִסְלֵו',
  'Sh\'vat': 'בִּשְׁבָט',
  'Adar': 'בַּאֲדָר',
  'Adar I': 'בַּאֲדָר א׳',
  'Adar II': 'בַּאֲדָר ב׳',
};
/**
 * @param {HDate} hdate
 * @return {string}
 */
export function gematriyaDate(hdate) {
  const d = hdate.getDate();
  const monthName = hdate.getMonthName();
  const m = monthInPrefix[monthName] || heInStr + Locale.gettext(monthName, 'he');
  const y = hdate.getFullYear();
  const str = gematriya(d) + ' ' + m + ' ' + gematriya(y);
  return str.normalize();
}
