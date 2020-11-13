/* eslint-disable require-jsdoc */
import {HebrewCalendar, Location, Sedra, HDate} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import send from 'koa-send';
import {typeaheadScript} from './common';
import {basename} from 'path';

const DOCUMENT_ROOT = '/var/www/html';
const geonamesFilename = 'geonames.sqlite3';

const CONTINENT_SQL = 'SELECT Continent, ISO, Country FROM country WHERE Country <> \'\' ORDER BY Continent, Country';

const COUNTRY_SQL = `SELECT g.geonameid, g.name, g.asciiname,
a.name as admin1, a.asciiname as admin1ascii,
g.latitude, g.longitude, g.timezone
FROM geoname g
LEFT JOIN admin1 a on g.country||'.'||g.admin1 = a.key
WHERE g.country = ?
ORDER BY g.asciiname`;

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

const continents = {};
const countryIdToIso = {};
const isoToCountry = {};

function init() {
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
  geonamesDb.close();
}

init();

export async function shabbatBrowse(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  const iso = countryIdToIso[base];
  if (rpath === '/shabbat/browse/') {
    ctx.set('Last-Modified', ctx.launchUTCString);
    ctx.set('Cache-Control', 'public');
    await ctx.render('shabbat-browse', {
      title: 'Shabbat candle-lighting times for world cities | Hebcal Jewish Calendar',
      continents: Object.values(continents),
      xtra_html: myTypeaheadScript,
    });
  } else if (typeof iso !== 'undefined') {
    const countryName = isoToCountry[iso];
    const geonamesDb = new Database(geonamesFilename, {fileMustExist: true});
    const geonamesStmt = geonamesDb.prepare(COUNTRY_SQL);
    const results = geonamesStmt.all(iso);
    geonamesDb.close();
    const admin1 = results.reduce((map, val) => {
      if (val.admin1ascii !== null) {
        map.set(val.admin1ascii, val.admin1);
      }
      return map;
    }, new Map());
    console.log(countryName, results.length, admin1.size);
    const saturday = dayjs().day(6);
    const parsha = getParsha(saturday, iso);
    if (results.length < 30 || admin1.size === 1 || (results.length / admin1.size < 1.15)) {
      results.forEach((r) => r.countryCode = iso);
      results.forEach((r) => addCandleTime(r));
      await ctx.render('shabbat-browse-country-small', {
        title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
        countryName,
        results,
        admin1,
        saturday,
        parsha,
      });
      return;
    } else if (results.length > 499) {
      const listItems = makeAdmin1(admin1);
      listItems.forEach((a1) => a1.href = base + '-' + a1.id);
      await ctx.render('shabbat-browse-admin1', {
        title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
        countryName,
        admin1: listItems,
      });
      return;
    } else {
      results.forEach((r) => r.countryCode = iso);
      results.forEach((r) => addCandleTime(r));
      const listItems = makeAdmin1(admin1);
      await ctx.render('shabbat-browse-country', {
        title: `${countryName} Shabbat Times | Hebcal Jewish Calendar`,
        countryName,
        results,
        admin1: listItems,
        saturday,
        parsha,
      });
      return;
    }
  } else {
    console.log(base, iso);
    ctx.type = 'html';
    ctx.set('Cache-Control', 'public');
    await send(ctx, ctx.path, {root: DOCUMENT_ROOT});
  }
}

function getParsha(saturday, iso) {
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

function addCandleTime(r) {
  const location = new Location(r.latitude, r.longitude, r.countryCode === 'IL', r.timezone,
      r.name, r.countryCode, r.geonameid);
  const friday = dayjs().day(5);
  const dt = friday.toDate();
  const events = HebrewCalendar.calendar({
    noHolidays: true,
    candlelighting: true,
    location,
    il: location.getIsrael(),
    start: dt,
    end: dt,
  });
  r.time = events[0].eventTimeStr;
}
