/* eslint-disable require-jsdoc */
import {greg, abs2hebrew, gematriya, months, isLeapYear} from '@hebcal/hdate';
const TAMUZ = months.TAMUZ;
const ELUL = months.ELUL;
const TISHREI = months.TISHREI;
const KISLEV = months.KISLEV;
const SHVAT = months.SHVAT;
const ADAR_I = months.ADAR_I;
const ADAR_II =months.ADAR_II;
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
    case TAMUZ:
      return 'בְּתַמּוּז';
    case ELUL:
      return 'בֶּאֱלוּל';
    case TISHREI:
      return 'בְּתִשְׁרֵי';
    case KISLEV:
      return 'בְּכִסְלֵו';
    case SHVAT:
      return 'בִּשְׁבָט';
    case ADAR_I:
      return isLeapYear(yy) ? 'בַּאֲדָר א׳' : 'בַּאֲדָר';
    case ADAR_II:
      return 'בַּאֲדָר ב׳';
    default:
      return 'בְּ' + monthNames[mm];
  }
}
function hdateStr() {
  const dt = new Date();
  let abs = greg.greg2abs(dt);
  if (dt.getHours() > 19) {
    abs++;
  }
  const hd = abs2hebrew(abs);
  return gematriya(hd.dd) + ' ' + monthName(hd.yy, hd.mm) + ' ' + gematriya(hd.yy);
}
const str = hdateStr();
document.write(str);
