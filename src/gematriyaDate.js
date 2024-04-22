import {gematriya, months, isLeapYear} from '@hebcal/hdate';
const ADAR_I = months.ADAR_I;
const monthNames = [
  '',
  'בְּנִיסָן',
  'בְּאִיָיר',
  'בְּסִיוָן',
  'בְּתַמּוּז',
  'בְּאָב',
  'בֶּאֱלוּל',
  'בְּתִשְׁרֵי',
  'בְּחֶשְׁוָן',
  'בְּכִסְלֵו',
  'בְּטֵבֵת',
  'בִּשְׁבָט',
  'בַּאֲדָר',
  'בַּאֲדָר ב׳',
];
function monthName(yy, mm) {
  if (mm === ADAR_I && isLeapYear(yy)) {
    return 'בַּאֲדָר א׳';
  }
  return monthNames[mm];
}
/**
 * @param {number} yy
 * @param {number} mm
 * @param {number} dd
 * @return {string}
 */
export function gematriyaDate0(yy, mm, dd) {
  return gematriya(dd) + ' ' + monthName(yy, mm) + ' ' + gematriya(yy);
}
/**
 * @param {HDate} hdate
 * @return {string}
 */
export function gematriyaDate(hdate) {
  const d = hdate.getDate();
  const m = hdate.getMonth();
  const y = hdate.getFullYear();
  const str = gematriyaDate0(y, m, d);
  return str.normalize();
}
