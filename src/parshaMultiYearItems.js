import {HDate, ParshaEvent, parshiot} from '@hebcal/core';
import {getLeyningForParshaHaShavua} from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {simchatTorahDate} from './dateUtil.js';
import {
  doubled,
  doubledParshiyot,
  getParshaYear,
  VEZOT_HABERAKHAH,
} from './parshaCommon.js';

const YEARS_PRE = 3;
const YEARS_TOTAL = 24;
const itemsIsrael = new Map();
const itemsDiaspora = new Map();

/**
 * @param {string} parshaName
 * @param {boolean} il
 * @return {any[]}
 */
export function getParshaMultiYearItems(parshaName, il) {
  const map = il ? itemsIsrael : itemsDiaspora;
  if (map.size === 0) {
    const currentHebYear = new HDate().getFullYear();
    const startYear = currentHebYear - YEARS_PRE;
    const endYear = currentHebYear + YEARS_TOTAL - YEARS_PRE - 1;
    let events = [];
    for (let yr = startYear; yr <= endYear; yr++) {
      const events0 = getParshaYear(yr, il);
      events = events.concat(events0);
    }
    const allParshiot = [].concat(parshiot, doubledParshiyot);
    for (const parshaName of allParshiot) {
      map.set(parshaName, getAllParshaEvents(parshaName, il, events));
    }
  }
  return map.get(parshaName);
}

function makeVezotEvents(il) {
  const startYear = new HDate().getFullYear() - YEARS_PRE;
  const events = [];
  for (let i = 0; i < YEARS_TOTAL; i++) {
    const hyear = startYear + i;
    const hd = simchatTorahDate(hyear, il);
    const pe = new ParshaEvent({hdate: hd, parsha: [VEZOT_HABERAKHAH], il});
    events.push(pe);
  }
  return events;
}

/**
 * Returns Parsha events during 24-year period that match this parshaName
 * @param {string} parshaName
 * @param {boolean} il
 * @param {Event[]} events
 * @return {any[]}
 */
function getAllParshaEvents(parshaName, il, allEvents) {
  if (parshaName === VEZOT_HABERAKHAH) {
    return makeVezotEvents(il).map((ev) => {
      return eventToItem(ev, il);
    });
  }
  const prefix = 'Parashat ';
  const descs = [prefix + parshaName];
  const pair = doubled.get(parshaName);
  if (pair) {
    descs.push(prefix + pair);
  }
  const events = allEvents.filter((ev) => descs.indexOf(ev.getDesc()) !== -1);
  return events.map(function(ev) {
    return eventToItem(ev, il);
  });
}

function eventToItem(ev, il) {
  const desc = ev.getDesc().substring(9);
  const item = {
    event: ev,
    desc: desc,
    anchor: makeAnchor(desc),
    d: dayjs(ev.greg()),
    hyear: ev.getDate().getFullYear(),
  };
  const fk = getLeyningForParshaHaShavua(ev, il);
  if (fk.reason?.haftara) {
    item.haftara = fk.haftara;
    item.haftaraReason = fk.reason.haftara;
  }
  if (fk.reason?.M) {
    item.maftir = fk.fullkriyah.M;
  }
  return item;
}
