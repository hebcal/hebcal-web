import {greg2abs} from '@hebcal/hdate/dist/esm/greg';
import {gematriya} from '@hebcal/hdate/dist/esm/gematriya';
import {abs2hebrew, months, isLeapYear} from '@hebcal/hdate/dist/esm/hdateBase';

const ADAR_I = months.ADAR_I;
const monthNames = [
  '',
  'ניסן',
  'אייר',
  'סיון',
  'תמוז',
  'אב',
  'אלול',
  'תשרי',
  'חשון',
  'כסלו',
  'טבת',
  'שבט',
  'אדר',
  'אדר ב׳',
];
const dt = new Date();
let abs = greg2abs(dt);
if (dt.getHours() > 19) {
  abs++;
}
const hd = abs2hebrew(abs);
const monthName = hd.mm === ADAR_I && isLeapYear(hd.yy) ? 'אדר א׳' : monthNames[hd.mm];
const str = gematriya(hd.dd) + ' ' + monthName + ' ' + gematriya(hd.yy);
document.write(str);
