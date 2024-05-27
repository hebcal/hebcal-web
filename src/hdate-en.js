import {greg} from '@hebcal/hdate/dist/esm/greg';
import {abs2hebrew, getMonthName} from '@hebcal/hdate/dist/esm/hdate-base';
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const dt = new Date();
let abs = greg.greg2abs(dt);
if (dt.getHours() > 19) {
  abs++;
}
const hdt = abs2hebrew(abs);
const mname = getMonthName(hdt.mm, hdt.yy);
const dateStr = ordinal(hdt.dd) + ' of ' + mname + ', ' + hdt.yy;
document.write(dateStr);
