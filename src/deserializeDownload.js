import DownloadProtoBuf from './download_pb';

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
  q.emoji = msg.getEmoji() ? '1' : '0';
  q.euro = msg.getEuro() ? '1' : '0';
  q.subscribe = msg.getSubscribe() ? '1' : '0';
  q.ny = msg.getNumyears() || undefined;
  q.zip = msg.getZip() || undefined;
  if (msg.getSedrot()) q.s = 'on';
  if (msg.getOmer()) q.o = 'on';
  if (msg.getDafyomi()) q.F = 'on';
  if (msg.getAddhebrewdates()) q.d = 'on';
  if (msg.getAddhebrewdatesforevents()) q.D = 'on';
  q.month = msg.getMonth() || undefined;
  if (msg.getGeopos()) {
    q.latitude = msg.getLatitude();
    q.longitude = msg.getLongitude();
    q.geo = 'pos';
  }
  q.tzid = msg.getTzid() || undefined;
  q.start = msg.getStart() || undefined;
  q.end = msg.getEnd() || undefined;
  return q;
}
