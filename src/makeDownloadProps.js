import {getDownloadFilename, makeAnchor} from '@hebcal/rest-api';
import {basename} from 'path';
import {urlArgsObj, empty} from './common';
import DownloadProtoBuf from './download_pb';

const dlPrefix = process.env.NODE_ENV == 'production' ?
  'https://download.hebcal.com' : 'http://127.0.0.1:8081';

/**
 * @param {string} str
 * @return {number}
 */
function getInt(str) {
  const n = parseInt(str, 10);
  if (isNaN(n)) {
    return null;
  }
  return n;
}

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
  if (q.yt === 'H') msg.setIshebrewyear(true);
  if (q.c === 'on') msg.setCandlelighting(true);
  const geonameid = getInt(q.geonameid);
  if (geonameid !== null) msg.setGeonameid(geonameid);
  const year = getInt(q.year);
  if (year !== null) {
    msg.setYear(year);
  } else if (q.year === 'now') {
    msg.setYearnow(true);
  }
  if (!empty(q.lg)) msg.setLocale(q.lg);
  const m = getInt(q.m);
  if (m !== null) msg.setHavdalahmins(m);
  if (q.M === 'on' || m === null) msg.setHavdalahtzeit(true);
  const b = getInt(q.b);
  if (b !== null) msg.setCandlelightingmins(b);
  if (q.emoji) msg.setEmoji(true);
  if (q.euro) msg.setEuro(true);
  if (q.hour12) msg.setHour12(true);
  if (q.subscribe) msg.setSubscribe(true);
  const ny = getInt(q.ny);
  if (ny !== null) msg.setNumyears(ny);
  if (!empty(q.zip)) msg.setZip(q.zip);

  if (q.s === 'on') msg.setSedrot(true);
  if (q.o === 'on') msg.setOmer(true);
  if (q.F === 'on') msg.setDafyomi(true);
  if (q.myomi === 'on') msg.setMishnayomi(true);
  if (q.ykk === 'on') msg.setYomkippurkatan(true);

  if (q.d === 'on') msg.setAddhebrewdates(true);
  if (q.D === 'on') msg.setAddhebrewdatesforevents(true);

  if (!empty(q.month) && q.month != 'x') {
    const month = getInt(q.month);
    if (month !== null) msg.setMonth(month);
  }

  if (q.geo === 'pos') msg.setGeopos(true);
  const latitude = parseFloat(q.latitude);
  if (!isNaN(latitude)) msg.setLatitude(latitude);
  const longitude = parseFloat(q.longitude);
  if (!isNaN(longitude)) msg.setLongitude(longitude);
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
