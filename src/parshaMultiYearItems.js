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

const currentHebYear = new HDate().getFullYear();
const startYear = currentHebYear - YEARS_PRE;
const endYear = currentHebYear + YEARS_TOTAL - YEARS_PRE - 1;
let allEvtsIsrael = [];
let allEvtsDiaspora = [];
for (let yr = startYear; yr <= endYear; yr++) {
  const evtsIsrael = getParshaYear(yr, true);
  allEvtsIsrael = allEvtsIsrael.concat(evtsIsrael);
  const evtsDiaspora = getParshaYear(yr, false);
  allEvtsDiaspora = allEvtsDiaspora.concat(evtsDiaspora);
}
const itemsIsrael = new Map();
const itemsDiaspora = new Map();
const allParshiot = [].concat(parshiot, doubledParshiyot);
for (const parshaName of allParshiot) {
  itemsIsrael.set(parshaName, getAllParshaEvents(parshaName, true));
  itemsDiaspora.set(parshaName, getAllParshaEvents(parshaName, false));
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
 * @return {any[]}
 */
function getAllParshaEvents(parshaName, il) {
  if (parshaName === VEZOT_HABERAKHAH) {
    return makeVezotEvents(il).map((ev) => {
      return eventToItem(ev, il);
    });
  }
  const allEvents = il ? allEvtsIsrael : allEvtsDiaspora;
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

/**
 * @param {string} parshaName
 * @param {boolean} il
 * @return {any[]}
 */
export function getParshaMultiYearItems(parshaName, il) {
  const map = il ? itemsIsrael : itemsDiaspora;
  const items = map.get(parshaName);
  return items;
}
