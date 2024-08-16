import {getDownloadFilename, makeAnchor} from '@hebcal/rest-api';
import {basename} from 'path';
import {empty, off} from './empty.js';
import {urlArgsObj} from './common.js';
import {isoDateStringToDate} from './dateUtil.js';
import DownloadProtoBuf from './download_pb.cjs';

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
 * @private
 * @param {string} str
 * @return {boolean}
 */
function on(str) {
  return str === 'on' || str === '1';
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
  if (on(q.maj)) msg.setMajor(true);
  if (on(q.min)) msg.setMinor(true);
  if (on(q.nx)) msg.setRoshchodesh(true);
  if (on(q.mod)) msg.setModern(true);
  if (on(q.mf)) msg.setMinorfast(true);
  if (on(q.ss)) msg.setSpecialshabbat(true);
  if (on(q.i)) msg.setIsrael(true);
  if (q.yt === 'H') msg.setIshebrewyear(true);
  if (on(q.c)) msg.setCandlelighting(true);
  const geonameid = getInt(q.geonameid);
  if (geonameid !== null) msg.setGeonameid(geonameid);
  const year = getInt(q.year);
  if (year !== null) {
    msg.setYear(year);
    delete q.start;
    delete q.end;
  } else if (q.year === 'now') {
    msg.setYearnow(true);
    delete q.start;
    delete q.end;
  }
  if (!empty(q.lg)) msg.setLocale(q.lg);
  const m = getInt(q.m);
  if (m !== null) msg.setHavdalahmins(m);
  if (q.M === 'on' || m === null) msg.setHavdalahtzeit(true);
  const b = getInt(q.b);
  if (b !== null) msg.setCandlelightingmins(b);
  if (on(q.emoji) || q.emoji === true) {
    msg.setEmoji(true);
  }
  if (q.euro) msg.setEuro(true);
  if (!empty(q.h12)) {
    msg.setHour12(off(query.h12) ? 2 : 1);
  }
  if (q.subscribe) msg.setSubscribe(true);
  const ny = getInt(q.ny);
  if (ny !== null) msg.setNumyears(ny);
  if (!empty(q.zip)) msg.setZip(q.zip);

  if (on(q.s)) msg.setSedrot(true);
  if (on(q.o)) msg.setOmer(true);
  if (on(q.F)) msg.setDafyomi(true);
  if (on(q.myomi)) msg.setMishnayomi(true);
  if (on(q.nyomi)) msg.setNachyomi(true);
  if (on(q.ykk)) msg.setYomkippurkatan(true);
  if (on(q.yyomi)) msg.setYerushalmiyomi(true);
  if (on(q.dr1)) msg.setRambam1(true);
  if (on(q.dcc)) msg.setChofetzchaim(true);
  if (on(q.dshl)) msg.setShemirathalashon(true);
  if (on(q.dps)) msg.setPsalms(true);
  if (on(q.dw)) msg.setDafweekly(true);
  if (on(q.dty)) msg.setTanakhyomi(true);
  if (on(q.dpa)) msg.setPirkeiavotsummer(true);

  if (on(q.ue)) msg.setUseelevation(true);

  if (on(q.d)) msg.setAddhebrewdates(true);
  if (on(q.D)) msg.setAddhebrewdatesforevents(true);

  if (!empty(q.month) && q.month != 'x') {
    const month = getInt(q.month);
    if (month !== null) msg.setMonth(month);
  }

  if (!empty(q.start)) {
    const dt = isoDateStringToDate(q.start);
    const secs = Math.trunc(dt.getTime() / 1000);
    msg.setStart(secs);
  }
  if (!empty(q.end)) {
    const dt = isoDateStringToDate(q.end);
    const secs = Math.trunc(dt.getTime() / 1000);
    msg.setEnd(secs);
  }

  if (q.geo === 'pos') {
    msg.setGeopos(true);
    const latitude = parseFloat(q.latitude);
    if (!isNaN(latitude)) msg.setLatitude(latitude);
    const longitude = parseFloat(q.longitude);
    if (!isNaN(longitude)) msg.setLongitude(longitude);
    if (!empty(q.tzid)) msg.setTzid(q.tzid);
    if (!empty(q['city-typeahead'])) msg.setCityname(q['city-typeahead']);
    const elev = parseFloat(q.elev);
    if (elev > 0) msg.setElev(elev);
  }

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
 * @param {import('@hebcal/core').CalOptions} options
 */
export function makeDownloadProps(ctx, q, options) {
  const dlFilename = getDownloadFilename(options);
  const dlhref = downloadHref2(q, dlFilename);
  const subFilename = getSubFilename(options.location);
  const emoji = typeof q.emoji === 'string' ? q.emoji : '1';
  const subical = downloadHref2(q, subFilename, {year: 'now', subscribe: '1', emoji}) + '.ics';
  const url = ctx.state.url = {
    pdf: dlhref + '.pdf',
    ics1year: downloadHref2(q, dlFilename, {ny: '1', emoji}) + '.ics',
    subical,
    webcal: subical.replace(/^https/, 'webcal').replace(/^http/, 'webcal'),
    gcal: subical.replace(/^https/, 'http'),
    csv_usa: dlhref + '_usa.csv',
    csv_eur: downloadHref2(q, dlFilename, {euro: '1'}) + '_eur.csv',
    dlFilename,
  };
  ctx.state.filename = {
    ics: dlFilename + '.ics',
    pdf: dlFilename + '.pdf',
    csv_usa: basename(url.csv_usa),
    csv_eur: basename(url.csv_eur),
  };
}
