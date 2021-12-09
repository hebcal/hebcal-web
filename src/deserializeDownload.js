import DownloadProtoBuf from './download_pb';

const objToQmap = {
  major: 'min',
  minor: 'min',
  roshchodesh: 'nx',
  modern: 'mod',
  minorfast: 'mf',
  specialshabbat: 'ss',
  israel: 'i',
  havdalahtzeit: 'M',
  // ishebrewyear: true,
  candlelighting: 'c',
  geonameid: 'geonameid',
  year: 'year',
  // locale: 'lg',
  // havdalahmins: 'm',
  candlelightingmins: 'b',
  // emoji: 'emoji',
  sedrot: 's',
  zip: 'zip',
  // yearnow: false,
  // subscribe: 'subscribe',
  addhebrewdates: 'd',
  addhebrewdatesforevents: 'D',
  omer: 'o',
  dafyomi: 'F',
  // euro: 'euro',
  // geopos: false,
  month: 'month',
  numyears: 'ny',
  latitude: 'latitude',
  longitude: 'longitude',
  tzid: 'tzid',
  start: 'start',
  end: 'end',
};

/**
 * @param {string} data
 * @return {Object<string, string>}
 */
export function deserializeDownload(data) {
  const buff = Buffer.from(data, 'base64');
  const msg = DownloadProtoBuf.Download.deserializeBinary(buff);
  const obj = DownloadProtoBuf.Download.toObject(false, msg);
  const q = {v: '1'};
  for (const [src, dest] of Object.entries(objToQmap)) {
    const val = obj[src];
    const valType = typeof val;
    switch (valType) {
      case 'boolean':
        q[dest] = val ? 'on' : 'off';
        break;
      case 'string':
        if (val.length !== 0) {
          q[dest] = val;
        }
        break;
      case 'number':
        if (val !== 0) {
          q[dest] = val;
        }
        break;
      default:
        break;
    }
  }
  if (q.M === 'off') {
    q.m = obj.havdalahmins;
  }
  q.yt = obj.ishebrewyear ? 'H' : 'G';
  if (obj.yearnow) {
    q.year = 'now';
  }
  q.lg = obj.locale || 's';
  q.emoji = obj.emoji ? '1' : '0';
  q.euro = obj.euro ? '1' : '0';
  q.subscribe = obj.subscribe ? '1' : '0';
  if (obj.geopos) {
    q.latitude = obj.latitude;
    q.longitude = obj.longitude;
    q.geo = 'pos';
  }
  return q;
}
