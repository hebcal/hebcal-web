import {getDownloadFilename, makeAnchor} from '@hebcal/rest-api';
import {basename} from 'path';
import {urlArgsObj, empty} from './common';
import DownloadProtoBuf from './download_pb';

const dlPrefix = process.env.NODE_ENV == 'production' ?
  'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {Object.<string,string>} query
 * @param {string} filename
 * @param {Object.<string,string>} override
 * @return {string}
 */
export function downloadHref2(query, filename, override={}) {
  const q = urlArgsObj(query, override);
  const msg = new DownloadProtoBuf.Download();
  if (q.maj === 'on') msg.setMajor(true);
  if (q.min === 'on') msg.setMinor(true);
  if (q.nx === 'on') msg.setRoshchodesh(true);
  if (q.mod === 'on') msg.setModern(true);
  if (q.mf === 'on') msg.setMinorfast(true);
  if (q.ss === 'on') msg.setSpecialshabbat(true);
  if (q.i === 'on') msg.setIsrael(true);
  if (q.M === 'on') msg.setHavdalahtzeit(true);
  if (q.yt === 'H') msg.setIshebrewyear(true);
  if (q.c === 'on') msg.setCandlelighting(true);
  if (!empty(q.geonameid)) msg.setGeonameid(q.geonameid);
  if (!empty(q.year)) {
    if (q.year === 'now') {
      msg.setYearnow(true);
    } else {
      msg.setYear(+q.year);
    }
  }
  if (!empty(q.lg)) msg.setLocale(q.lg);
  if (!empty(q.m)) msg.setHavdalahmins(+q.m);
  if (!empty(q.b)) msg.setCandlelightingmins(+q.b);
  if (q.emoji) msg.setEmoji(true);
  if (q.euro) msg.setEuro(true);
  if (q.subscribe) msg.setSubscribe(true);
  if (q.ny) msg.setNumyears(+q.ny);
  if (!empty(q.zip)) msg.setZip(q.zip);

  if (q.s === 'on') msg.setSedrot(true);
  if (q.o === 'on') msg.setOmer(true);
  if (q.F === 'on') msg.setDafyomi(true);

  if (q.d === 'on') msg.setAddhebrewdates(true);
  if (q.D === 'on') msg.setAddhebrewdatesforevents(true);

  if (!empty(q.month) && q.month != 'x') {
    msg.setMonth(+q.month);
  }

  if (!empty(q.latitude)) msg.setLatitude(+q.latitude);
  if (!empty(q.longitude)) msg.setLongitude(+q.longitude);
  if (!empty(q.tzid)) msg.setTzid(q.tzid);
  if (!empty(q.start)) msg.setStart(q.start);
  if (!empty(q.end)) msg.setEnd(q.end);

  const msgBin = msg.serializeBinary();
  const encoded = Buffer.from(msgBin)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  return `${dlPrefix}/v4/${encoded}/${filename}`;
}

/**
 * @param {Location} location
 * @return {string}
 */
function getSubFilename(location) {
  let fileName = 'hebcal';
  if (location) {
    const name = location.zip || location.asciiname || location.getShortName();
    fileName += '_' + makeAnchor(name).replace(/[-]/g, '_');
  }
  return fileName;
}

/**
 * @param {any} ctx
 * @param {any} q
 * @param {HebrewCalendar.Options} options
 */
export function makeDownloadProps(ctx, q, options) {
  const dlFilename = getDownloadFilename(options);
  const dlhref = downloadHref2(q, dlFilename);
  const subFilename = getSubFilename(options.location);
  const subical = downloadHref2(q, subFilename, {year: 'now', subscribe: '1', emoji: '1'}) + '.ics';
  const url = ctx.state.url = {
    pdf: dlhref + '.pdf',
    ics: downloadHref2(q, dlFilename, {emoji: '1'}) + '.ics',
    ics1year: downloadHref2(q, dlFilename, {ny: '1', emoji: '1'}) + '.ics',
    subical,
    webcal: subical.replace(/^https/, 'webcal').replace(/^http/, 'webcal'),
    gcal: subical.replace(/^https/, 'http'),
    csv_usa: dlhref + '_usa.csv',
    csv_eur: downloadHref2(q, dlFilename, {euro: '1'}) + '_eur.csv',
    dlFilename,
  };
  ctx.state.filename = {
    ics: basename(url.ics),
    pdf: basename(url.pdf),
    csv_usa: basename(url.csv_usa),
    csv_eur: basename(url.csv_eur),
  };
}
