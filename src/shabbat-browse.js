/* eslint-disable require-jsdoc */
import {HDate, HebrewCalendar, Location} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import createError from 'http-errors';
import {basename} from 'path';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {langTzDefaults} from './common';

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
    const countryAnchor = makeAnchor(country);
    const countryA1 = countryAnchor + '-' + makeAnchor(result.asciiname);
    countryAdmin1[countryA1] = {
      cc,
      country,
      countryAnchor,
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
  ctx.lastModified = dt;
  const sunday = today.day(7);
  const exp = dayjs.tz(sunday.format('YYYY-MM-DD 00:00'), tzid).toDate();
  ctx.set('Expires', exp.toUTCString());
}

async function render(ctx, view, options) {
  const cc = options.countryCode || 'US';
  const ccDefaults = langTzDefaults[cc] || langTzDefaults['US'];
  options.lg = ccDefaults[0];
  options.cc = cc;
  if (basename(ctx.request.path).endsWith('.xml')) {
    const results = options.results;
    const tzid = (results && results[0] && results[0].timezone) || 'America/New_York';
    const today = dayjs.tz(new Date(), tzid);
    ctx.response.remove('Cache-Control');
    expires(ctx, today, tzid);
    ctx.type = 'text/xml';
    options.writeResp = false;
    options.lastmod = today.toDate().toISOString();
    ctx.body = await ctx.render('shabbat-browse-country-xml', options);
    return;
  }
  return ctx.render(view, options);
}

export async function shabbatBrowse(ctx) {
  init();
  const rpath = ctx.request.path;
  const base0 = basename(rpath);
  const base = base0.endsWith('.xml') ? base0.substring(0, base0.length - 4) : base0;
  if (rpath === '/shabbat/browse/') {
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', 'max-age=2592000');
    return ctx.render('shabbat-browse', {
      title: 'Shabbat candle-lighting times for world cities | Hebcal Jewish Calendar',
      continents: Object.values(continents),
    });
  }
  if (rpath === '/shabbat/browse/sitemap.xml') {
    ctx.type = 'text/xml';
    ctx.set('Cache-Control', 'public, max-age=604800'); // 7 days
    ctx.body = await ctx.render('shabbat-browse-sitemap', {
      writeResp: false,
      countries: Object.keys(countryIdToIso),
      lastmod: new Date().toISOString(),
    });
    return;
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
    const {friday, parsha} = makeCandleLighting(ctx, results, countryCode);
    const countryName = `${countryA1.name}, ${isoToCountry[countryCode]}`;
    return render(ctx, 'shabbat-browse-country-small', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryName,
      results,
      friday,
      parsha,
      admin1: {size: 0},
      countryA1,
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
  if (results.length > 299) {
    const listItems = makeAdmin1(admin1);
    const countryUrlToken = makeAnchor(countryName);
    listItems.forEach((a1) => a1.href = countryUrlToken + '-' + a1.id);
    ctx.lastModified = ctx.launchDate;
    ctx.set('Cache-Control', 'max-age=2592000');
    return render(ctx, 'shabbat-browse-admin1', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryCode,
      countryName,
      admin1: listItems,
      results,
    });
  }

  const {friday, parsha} = makeCandleLighting(ctx, results, countryCode);

  if (results.length < 30 || admin1.size === 1 || (results.length / admin1.size) < 1.25) {
    return render(ctx, 'shabbat-browse-country-small', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryCode,
      countryName,
      results,
      admin1,
      friday,
      parsha,
    });
  } else {
    const listItems = makeAdmin1(admin1);
    return render(ctx, 'shabbat-browse-country', {
      title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
      countryCode,
      countryName,
      results,
      admin1: listItems,
      friday,
      parsha,
    });
  }
}

function makeCandleLighting(ctx, results, countryCode) {
  const tzid = (results && results[0] && results[0].timezone) || 'America/New_York';
  const today = dayjs.tz(new Date(), tzid);
  expires(ctx, today, tzid);
  const friday = today.day(5);
  const parsha = getParsha(today.day(6), countryCode === 'IL');
  results.forEach((city) => city.countryCode = countryCode);
  results.forEach((city) => addCandleTime(friday, city));
  return {friday, parsha};
}

function getParsha(saturday, il) {
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const sedra = HebrewCalendar.getSedra(hyear, il);
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

function addCandleTime(friday, city) {
  const location = new Location(city.latitude, city.longitude, city.countryCode === 'IL',
      city.timezone, city.name, city.countryCode, city.geonameid);
  const dt = new Date(friday.year(), friday.month(), friday.date());
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
