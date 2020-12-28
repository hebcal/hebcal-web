/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, Location, Sedra} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import {typeaheadScript} from './common';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const geonamesFilename = 'geonames.sqlite3';

const CONTINENT_SQL = 'SELECT Continent, ISO, Country FROM country WHERE Country <> \'\' ORDER BY Continent, Country';

const COUNTRY_SQL = `SELECT g.geonameid, g.name, g.asciiname,
a.name as admin1, a.asciiname as admin1ascii,
g.latitude, g.longitude, g.timezone
FROM geoname g
LEFT JOIN admin1 a on g.country||'.'||g.admin1 = a.key
WHERE g.country = ?
ORDER BY g.name`;

const COUNTRY_ADMIN_SQL = `SELECT g.geonameid, g.name, g.asciiname, g.latitude, g.longitude, g.timezone
FROM geoname g
WHERE g.country = ? AND g.admin1 = ?
ORDER BY g.name`;

const myTypeaheadScript = typeaheadScript.replace('createCityTypeahead(false)', 'createCityTypeahead(true)');

const CONTINENTS = {
  EU: 'Europe',
  NA: 'North America',
  SA: 'South America',
  OC: 'Oceania',
  AS: 'Asia',
  AF: 'Africa',
  AN: 'Antarctica',
};

let didInit = false;
const continents = {};
const countryIdToIso = {};
const isoToCountry = {};
const countryAdmin1 = {};

function init() {
  if (didInit) {
    return;
  }
  const geonamesDb = new Database(geonamesFilename, {fileMustExist: true});
  const geonamesStmt = geonamesDb.prepare(CONTINENT_SQL);
  const results = geonamesStmt.all();
  for (const [iso, name] of Object.entries(CONTINENTS)) {
    continents[iso] = {name, countries: []};
  }
  for (const result of results) {
    const country = result.Country;
    const id = makeAnchor(country);
    continents[result.Continent].countries.push({name: country, href: id});
    countryIdToIso[id] = result.ISO;
    isoToCountry[result.ISO] = result.Country;
  }
  const stmt2 = geonamesDb.prepare('SELECT key,name,asciiname FROM admin1');
  const results2 = stmt2.all();
  for (const result of results2) {
    const [cc, a1id] = result.key.split('.');
    if (cc === 'PS') {
      continue;
    }
    const country = isoToCountry[cc];
    const countryA1 = makeAnchor(country) + '-' + makeAnchor(result.asciiname);
    countryAdmin1[countryA1] = {
      cc,
      admin1: a1id,
      name: result.name,
      asciiname: result.asciiname,
    };
  }
  geonamesDb.close();
  didInit = true;
}

function expires(ctx, today, tzid) {
  const dt = today.toDate();
  ctx.set('Last-Modified', dt.toUTCString());
  const sunday = today.day(7);
  const exp = dayjs.tz(sunday.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

export async function shabbatBrowse(ctx) {
  init();
  const rpath = ctx.request.path;
  const base = basename(rpath);
  if (rpath === '/shabbat/browse/') {
    ctx.set('Last-Modified', ctx.launchUTCString);
    ctx.set('Cache-Control', 'max-age=2592000');
    return ctx.render('shabbat-browse', {
      title: 'Shabbat candle-lighting times for world cities | Hebcal Jewish Calendar',
      continents: Object.values(continents),
      xtra_html: myTypeaheadScript,
    });
  }
  const iso = countryIdToIso[base];
  if (typeof iso !== 'undefined') {
    return countryPage(ctx, iso);
  }
  const countryA1 = countryAdmin1[base];
  if (typeof countryA1 !== 'undefined') {
    const db = new Database(geonamesFilename, {fileMustExist: true});
    const stmt = db.prepare(COUNTRY_ADMIN_SQL);
    const countryCode = countryA1.cc;
    const results = stmt.all(countryCode, countryA1.admin1);
    db.close();
    const today = dayjs();
    expires(ctx, today, results[0].timezone);
    const friday = today.day(5);
    const parsha = getParsha(countryCode);
    results.forEach((city) => addCandleTime(friday, city, countryCode));
    const countryName = `${countryA1.name}, ${isoToCountry[countryCode]}`;
    return ctx.render('shabbat-browse-country-small', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryName,
      results,
      friday,
      parsha,
      admin1: {size: 0},
    });
  }
  throw createError(404, `Browse page not found: ${base}`);
}

async function countryPage(ctx, countryCode) {
  const countryName = isoToCountry[countryCode];
  const db = new Database(geonamesFilename, {fileMustExist: true});
  const stmt = db.prepare(COUNTRY_SQL);
  const results = stmt.all(countryCode);
  db.close();
  const admin1 = results.reduce((map, val) => {
    if (val.admin1ascii !== null) {
      map.set(val.admin1ascii, val.admin1);
    }
    return map;
  }, new Map());

  // console.log(countryName, results.length, admin1.size);
  if (results.length > 499) {
    const listItems = makeAdmin1(admin1);
    const countryUrlToken = makeAnchor(countryName);
    listItems.forEach((a1) => a1.href = countryUrlToken + '-' + a1.id);
    ctx.set('Last-Modified', ctx.launchUTCString);
    ctx.set('Cache-Control', 'max-age=2592000');
    return ctx.render('shabbat-browse-admin1', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryName,
      admin1: listItems,
    });
  }

  const today = dayjs();
  expires(ctx, today, results[0].timezone);
  const friday = today.day(5);
  const parsha = getParsha(countryCode);
  results.forEach((city) => addCandleTime(friday, city, countryCode));

  if (results.length < 30 || admin1.size === 1 || (results.length / admin1.size) < 1.25) {
    return ctx.render('shabbat-browse-country-small', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryName,
      results,
      admin1,
      friday,
      parsha,
    });
  } else {
    const listItems = makeAdmin1(admin1);
    return ctx.render('shabbat-browse-country', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryName,
      results,
      admin1: listItems,
      friday,
      parsha,
    });
  }
}

function getParsha(iso) {
  const saturday = dayjs().day(6);
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const il = iso === 'IL';
  const sedra = new Sedra(hyear, il);
  const parsha0 = sedra.lookup(hd);
  let parsha = null;
  if (parsha0.chag) {
    const events = HebrewCalendar.getHolidaysOnDate(hd, il) || [];
    if (events.length > 0) {
      parsha = events[0].basename();
    }
  } else {
    parsha = parsha0.parsha.join('-');
  }
  return parsha;
}

function makeAdmin1(admin1) {
  const listItems = Array.from(admin1.entries()).map((a1) => {
    const asciiname = a1[0];
    const name = a1[1];
    return {name, id: makeAnchor(asciiname)};
  });
  listItems.sort((a, b) => a.name.localeCompare(b.name));
  return listItems;
}

function addCandleTime(friday, city, countryCode) {
  const location = new Location(city.latitude, city.longitude, countryCode === 'IL',
      city.timezone, city.name, countryCode, city.geonameid);
  const dt = friday.toDate();
  const events = HebrewCalendar.calendar({
    noHolidays: true,
    candlelighting: true,
    location,
    il: location.getIsrael(),
    start: dt,
    end: dt,
  });
  if (events.length && typeof events[0].eventTimeStr === 'string') {
    const timeStr = events[0].eventTimeStr;
    city.isoTime = timeStr;
    city.isoDate = friday.format('YYYY-MM-DD');
    city.fmtTime = HebrewCalendar.reformatTimeStr(timeStr, 'pm', {location});
  }
}
