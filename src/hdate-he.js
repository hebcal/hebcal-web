/* eslint-disable require-jsdoc */
import {greg, abs2hebrew, gematriya, months, isLeapYear} from '@hebcal/hdate';
const monthNames = [
  '',
  'נִיסָן',
  'אִיָיר',
  'סִיוָן',
  'תַּמּוּז',
  'אָב',
  'אֱלוּל',
  'תִּשְׁרֵי',
  'חֶשְׁוָן',
  'כִּסְלֵו',
  'טֵבֵת',
  'שְׁבָט',
  'אַדָר',
  'אַדָר ב׳',
];
function monthName(yy, mm) {
  switch (mm) {
    case months.TAMUZ:
      return 'בְּתַמּוּז';
    case months.ELUL:
      return 'בֶּאֱלוּל';
    case months.TISHREI:
      return 'בְּתִשְׁרֵי';
    case months.KISLEV:
      return 'בְּכִסְלֵו';
    case months.SHVAT:
      return 'בִּשְׁבָט';
    case months.ADAR_I:
      return isLeapYear(yy) ? 'בַּאֲדָר א׳' : 'בַּאֲדָר';
    case months.ADAR_II:
      return 'בַּאֲדָר ב׳';
    default:
      return 'בְּ' + monthNames[mm];
  }
}
export function hdateStr() {
  const dt = new Date();
  let abs = greg.greg2abs(dt);
  if (dt.getHours() > 19) {
    abs++;
  }
  const hd = abs2hebrew(abs);
  return gematriya(hd.dd) + ' ' + monthName(hd.yy, hd.mm) + ' ' + gematriya(hd.yy);
}
