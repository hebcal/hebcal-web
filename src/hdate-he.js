import {greg2abs} from '@hebcal/hdate/dist/esm/greg';
import {abs2hebrew} from '@hebcal/hdate/dist/esm/hdateBase';
import {gematriyaDate0} from './gematriyaDate';
function hdateStr() {
  const dt = new Date();
  let abs = greg2abs(dt);
  if (dt.getHours() > 19) {
    abs++;
  }
  const hd = abs2hebrew(abs);
  return gematriyaDate0(hd.yy, hd.mm, hd.dd);
}
const str = hdateStr();
document.write(str);
