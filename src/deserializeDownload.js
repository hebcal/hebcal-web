import DownloadProtoBuf from './download_pb.cjs';

/**
 * @param {string} data
 * @return {Object<string, string>}
 */
export function deserializeDownload(data) {
  const buff = Buffer.from(data, 'base64');
  const msg = DownloadProtoBuf.Download.deserializeBinary(buff);
  const q = {v: '1'};
  if (msg.getMajor()) q.maj = 'on';
  if (msg.getMinor()) q.min = 'on';
  if (msg.getRoshchodesh()) q.nx = 'on';
  if (msg.getModern()) q.mod = 'on';
  if (msg.getMinorfast()) q.mf = 'on';
  if (msg.getSpecialshabbat()) q.ss = 'on';
  if (msg.getIsrael()) q.i = 'on';
  q.M = msg.getHavdalahtzeit() ? 'on' : 'off';
  if (q.M === 'off') {
    q.m = msg.getHavdalahmins();
  }
  q.yt = msg.getIshebrewyear() ? 'H' : 'G';
  if (msg.getCandlelighting()) q.c = 'on';
  q.geonameid = msg.getGeonameid() || undefined;
  if (msg.getYearnow()) {
    q.year = 'now';
  } else {
    const year = msg.getYear();
    if (year) q.year = year;
  }
  q.lg = msg.getLocale() || 's';
  q.b = msg.getCandlelightingmins() || undefined;
  q.emoji = msg.getEmoji() ? '1' : undefined;
  q.euro = msg.getEuro() ? '1' : undefined;
  switch (msg.getHour12()) {
    case 1:
      q.h12 = '1';
      break;
    case 2:
      q.h12 = '0';
      break;
    default:
      // don't set q.h12
      break;
  }
  q.subscribe = msg.getSubscribe() ? '1' : undefined;
  q.ny = msg.getNumyears() || undefined;
  q.zip = msg.getZip() || undefined;
  if (msg.getSedrot()) q.s = 'on';
  if (msg.getOmer()) q.o = 'on';
  if (msg.getDafyomi()) q.F = 'on';
  if (msg.getMishnayomi()) q.myomi = 'on';
  if (msg.getPerekyomi()) q.dpy = 'on';
  if (msg.getNachyomi()) q.nyomi = 'on';
  if (msg.getAddhebrewdates()) q.d = 'on';
  if (msg.getAddhebrewdatesforevents()) q.D = 'on';
  if (msg.getYomkippurkatan()) q.ykk = 'on';
  if (msg.getYerushalmiyomi()) q.yyomi = 'on';
  if (msg.getYyschottenstein()) q.yys = 'on';
  if (msg.getRambam1()) q.dr1 = 'on';
  if (msg.getRambam3()) q.dr3 = 'on';
  if (msg.getChofetzchaim()) q.dcc = 'on';
  if (msg.getShemirathalashon()) q.dshl = 'on';
  if (msg.getDafweekly()) q.dw = 'on';
  if (msg.getPsalms()) q.dps = 'on';
  if (msg.getTanakhyomi()) q.dty = 'on';
  if (msg.getPirkeiavotsummer()) q.dpa = 'on';
  if (msg.getArukhhashulchanyomi()) q.ahsy = 'on';
  if (msg.getUseelevation()) q.ue = 'on';
  if (msg.getYizkor()) q.yzkr = 'on';
  if (msg.getShabbatmevarchim()) q.mvch = 'on';
  q.month = msg.getMonth() || undefined;
  if (msg.getGeopos()) {
    q.latitude = msg.hasOldLatitude() ? msg.getOldLatitude() : msg.getLatitude();
    q.longitude = msg.hasOldLongitude() ? msg.getOldLongitude() : msg.getLongitude();
    const elev = msg.getElev();
    if (elev > 0) {
      q.elev = elev;
    }
    q['city-typeahead'] = msg.getCityname() || undefined;
    q.geo = 'pos';
  }
  q.tzid = msg.getTzid() || undefined;
  if (msg.hasStartStr()) {
    q.start = msg.getStartStr();
  } else {
    const secs = msg.getStart();
    if (secs !== 0) {
      q.start = new Date(secs*1000).toISOString().substring(0, 10);
    }
  }
  if (msg.hasEndStr()) {
    q.end = msg.getEndStr();
  } else {
    const secs = msg.getEnd();
    if (secs !== 0) {
      q.end = new Date(secs*1000).toISOString().substring(0, 10);
    }
  }
  return q;
}
