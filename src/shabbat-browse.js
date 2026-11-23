import {HDate, reformatTimeStr, Location, Zmanim, calendar, getHolidaysOnDate,
  getSedra} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import dayjs from 'dayjs';
import {basename} from 'node:path';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {langTzDefaults} from './lang.js';
import {geonameIdDefaultCandleMins} from './urlArgs.js';
import {checkFreshETag} from './etag.js';
import {CACHE_CONTROL_7DAYS,
  CACHE_CONTROL_30DAYS,
} from './cacheControl.js';
import {expiresSaturdayNight} from './dateUtil.js';
import {flag} from './emoji-flag.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * @typedef {import('koa').Context} Context
 * @typedef {import('node:sqlite').StatementSync} StatementSync
 * @typedef {import('dayjs').Dayjs} Dayjs
 */

/**
 * A geonames row from COUNTRY_SQL or COUNTRY_ADMIN_SQL. The `admin1*`
 * columns come only from COUNTRY_SQL; `href`, `countryCode` and the
 * candle-lighting fields are added by addHref() and makeCandleLighting().
 * @typedef {Object} CityRow
 * @property {number} geonameid
 * @property {string} name
 * @property {string} asciiname
 * @property {string|null} [admin1]
 * @property {string|null} [admin1ascii]
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} elevation
 * @property {string} timezone
 * @property {string} [href]
 * @property {string} [countryCode]
 * @property {string} [isoDate]
 * @property {string} [fmtTime]
 * @property {string} [isoDateTime]
 */

/**
 * An admin1 (state/province) browse page, keyed in countryAdmin1 by
 * `<country anchor>-<admin1 anchor>`.
 * @typedef {Object} CountryAdmin1
 * @property {string} cc ISO 3166 country code
 * @property {string} country country name
 * @property {string} countryAnchor country URL slug
 * @property {string} admin1 geonames admin1 code
 * @property {string} name admin1 name
 * @property {string} asciiname admin1 ASCII name
 */

/**
 * @typedef {Object} Admin1ListItem
 * @property {string} name display name
 * @property {string} id URL anchor
 * @property {string} [href] browse page slug
 */

/**
 * Cities smaller than this are excluded from the browse pages and sitemaps.
 * We don't want to encourage crawlers to index a city that might disappear
 * from a future version of the geonames database.
 */
const MIN_POPULATION = 1600;

/**
 * Higher thresholds for countries with so many cities that the browse
 * sitemap and pages become huge and slow to render. Keyed by ISO 3166 code.
 */
const MIN_POPULATION_BY_COUNTRY = {
  US: 10000,
  CN: 50000,
  IN: 50000,
  BR: 50000,
  PH: 10000,
};

/**
 * SQL boolean expression: is `col` populous enough for its country?
 * @param {string} popCol population column
 * @param {string} ccCol country (ISO 3166) column
 * @return {string}
 */
function populousSql(popCol, ccCol) {
  const whens = Object.entries(MIN_POPULATION_BY_COUNTRY)
      .map(([cc, min]) => `WHEN '${cc}' THEN ${min}`).join(' ');
  return `${popCol} >= CASE ${ccCol} ${whens} ELSE ${MIN_POPULATION} END`;
}

const CONTINENT_SQL = `SELECT Continent, ISO, Country FROM country
WHERE Continent <> 'AN'
AND ISO NOT IN ('', 'AN', 'AQ', 'BV', 'CS', 'HM', 'IO', 'PS', 'UM')
ORDER BY Continent, Country`;

/**
 * City counts per (country, admin1), using the same filter as COUNTRY_SQL.
 * One scan at startup tells us which countries and admin1s get a browse
 * page, and lets a large country's admin1 index render with no city query.
 */
const POPULOUS_ADMIN1_SQL = `SELECT country, admin1, count(*) AS numCities
FROM geoname
WHERE ${populousSql('population', 'country')}
GROUP BY country, admin1`;

const COUNTRY_SQL = `SELECT g.geonameid, g.name, g.asciiname,
a.name as admin1, a.asciiname as admin1ascii,
g.latitude, g.longitude, g.gtopo30 as elevation, g.timezone
FROM geoname g
LEFT JOIN admin1 a on g.country||'.'||g.admin1 = a.key
WHERE g.country = ? AND ${populousSql('g.population', 'g.country')}
ORDER BY g.name`;

const COUNTRY_ADMIN_SQL = `SELECT g.geonameid, g.name, g.asciiname, g.latitude, g.longitude,
g.gtopo30 as elevation, g.timezone
FROM geoname g
WHERE g.country = ? AND g.admin1 = ? AND ${populousSql('g.population', 'g.country')}
ORDER BY g.name`;

const CONTINENTS = {
  EU: 'Europe',
  NA: 'North America',
  SA: 'South America',
  OC: 'Oceania',
  AS: 'Asia',
  AF: 'Africa',
};

let didInit = false;
/** @type {Object<string, {name: string, countries: {name: string, href: string}[]}>} */
const continents = {};
/** @type {Object<string, string>} country URL slug => ISO 3166 code */
const countryIdToIso = {};
/** @type {Object<string, string>} ISO 3166 code => country name */
const isoToCountry = {};
/** @type {Object<string, CountryAdmin1>} */
const countryAdmin1 = {};
/** @type {Object<string, number>} ISO 3166 code => number of cities COUNTRY_SQL returns */
const countryNumCities = {};
/** @type {Object<string, Admin1ListItem[]>} ISO 3166 code => the admin1 index of a large country */
const countryAdmin1List = {};
let numCountries = 0;

/**
 * Countries with more cities than this show only a list of admin1 links.
 */
const MAX_CITIES_ON_COUNTRY_PAGE = 299;

/**
 * Prepared statements keyed by the GeoDb's geonames connection. GeoDb swaps
 * in a new connection when geonames.sqlite3 changes on disk, so a WeakMap
 * re-prepares against the new one and lets the old one be collected.
 * @type {WeakMap<import('node:sqlite').DatabaseSync, Map<string, StatementSync>>}
 */
const stmtCache = new WeakMap();

/**
 * Returns a cached prepared statement on `ctx.db.geonamesDb`.
 * @param {Context} ctx
 * @param {string} sql
 * @return {StatementSync}
 */
function prepareGeonames(ctx, sql) {
  const db = ctx.db.geonamesDb;
  let stmts = stmtCache.get(db);
  if (stmts === undefined) {
    stmts = new Map();
    stmtCache.set(db, stmts);
  }
  let stmt = stmts.get(sql);
  if (stmt === undefined) {
    stmt = db.prepare(sql);
    stmts.set(sql, stmt);
  }
  return stmt;
}

/**
 * Builds the country/admin1 indexes from geonames, once per process.
 * Uses the shared `ctx.db.geonamesDb` connection, which it must not close.
 * @param {Context} ctx
 */
function init(ctx) {
  if (didInit) {
    return;
  }
  const geonamesDb = ctx.db.geonamesDb;
  const populousA1 = new Map();
  for (const r of geonamesDb.prepare(POPULOUS_ADMIN1_SQL).all()) {
    populousA1.set(r.country + '.' + r.admin1, r.numCities);
    countryNumCities[r.country] = (countryNumCities[r.country] || 0) + r.numCities;
  }
  const geonamesStmt = geonamesDb.prepare(CONTINENT_SQL);
  const results = geonamesStmt.all();
  for (const [iso, name] of Object.entries(CONTINENTS)) {
    continents[iso] = {name, countries: []};
  }
  for (const result of results) {
    const country = result.Country;
    const continent = result.Continent;
    if (!country || !continents[continent] || !countryNumCities[result.ISO]) {
      continue;
    }
    const id = makeAnchor(country);
    continents[continent].countries.push({name: country, href: id});
    const iso = result.ISO;
    countryIdToIso[id] = iso;
    isoToCountry[iso] = result.Country;
  }
  numCountries = Object.keys(countryIdToIso).length;
  const admin1ByCountry = {};
  const stmt2 = geonamesDb.prepare('SELECT key,name,asciiname FROM admin1');
  const results2 = stmt2.all();
  for (const result of results2) {
    const [cc, a1id] = result.key.split('.');
    const country = isoToCountry[cc];
    if (!country || !populousA1.has(result.key)) {
      continue;
    }
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
    // same shape as countryPage() builds from a country's cities
    const a1 = admin1ByCountry[cc] ??= new Map();
    a1.set(result.asciiname, result.name);
  }
  for (const [cc, a1] of Object.entries(admin1ByCountry)) {
    if (countryNumCities[cc] > MAX_CITIES_ON_COUNTRY_PAGE) {
      const listItems = makeAdmin1(a1);
      const countryUrlToken = makeAnchor(isoToCountry[cc]);
      listItems.forEach((item) => item.href = countryUrlToken + '-' + item.id);
      countryAdmin1List[cc] = listItems;
    }
  }
  didInit = true;
}

/**
 * Renders `view`, or the country sitemap XML when the request path ends
 * in `.xml`. Sets `props.lg` and `props.cc` from the country code.
 * @param {Context} ctx
 * @param {string} view EJS template name
 * @param {Object<string, any>} props template locals
 * @return {Promise<any>}
 */
function render(ctx, view, props) {
  const cc = props.countryCode || 'US';
  const ccDefaults = langTzDefaults[cc] || langTzDefaults['US'];
  props.lg = ccDefaults[0];
  props.cc = cc;
  if (basename(ctx.request.path).endsWith('.xml')) {
    return renderBrowseCountryXml(props, ctx);
  }
  return ctx.render(view, props);
}

/**
 * Renders the `shabbat-browse-country-xml` sitemap into `ctx.body`,
 * expiring Saturday night in the first city's time zone.
 * @param {Object<string, any>} props template locals
 * @param {Context} ctx
 * @return {Promise<void>}
 */
async function renderBrowseCountryXml(props, ctx) {
  const tzid = props?.results?.[0]?.timezone || 'America/New_York';
  ctx.response.remove('Cache-Control');
  const now = new Date();
  expiresSaturdayNight(ctx, now, tzid);
  ctx.type = 'text/xml';
  props.writeResp = false;
  const today = dayjs.tz(now, tzid);
  const pastSunday = today.day(0);
  props.lastmod = pastSunday.format('YYYY-MM-DD');
  ctx.body = await ctx.render('shabbat-browse-country-xml', props);
}

/**
 * Sets `r.href` to the city's `/shabbat` URL with country defaults.
 * @param {CityRow} r
 * @param {string} countryCode ISO 3166 code
 */
function addHref(r, countryCode) {
  const b = geonameIdDefaultCandleMins(r.geonameid, countryCode);
  const ccDefaults = langTzDefaults[countryCode] || langTzDefaults['US'];
  const lg = ccDefaults[0] || 's';
  r.href = `/shabbat?geonameid=${r.geonameid}&ue=off&b=${b}&M=on&lg=${lg}&set=off`;
}

/**
 * Top countries by visits (Matomo, Jan-Sep 2026), ISO 3166 codes in rank order.
 * Excludes countries with no meaningful Jewish population whose traffic is
 * essentially bots (China, Singapore, Hong Kong, Japan, South Korea, Vietnam,
 * Indonesia, Bangladesh, Nigeria, Malaysia).
 */
const TOP_COUNTRIES = [
  'US', 'IL', 'CA', 'GB', 'BR', 'AU', 'MX', 'DE', 'FR', 'ZA',
  'AR', 'CO', 'NL', 'IN', 'ES', 'PH', 'PL', 'SE', 'IT', 'RO',
  'CH', 'BE', 'CL', 'VE', 'BM', 'TR', 'PA', 'DK', 'IE', 'HU',
  'NZ', 'EC', 'AT', 'FI', 'CZ',
];

/**
 * Country slugs that have a per-country browse sitemap
 * (`/shabbat/browse/<slug>.xml`), with the TOP_COUNTRIES first in rank
 * order and the remaining countries after them.
 * @param {Context} ctx
 * @return {string[]}
 */
function browseSitemapCountries(ctx) {
  const top = browseSitemapSlugsForIso(ctx, TOP_COUNTRIES);
  const topSet = new Set(top);
  return [...top, ...Object.keys(countryIdToIso).filter((id) => !topSet.has(id))];
}

/**
 * Per-country browse sitemap slugs for the given ISO 3166 codes, in the
 * order given. Countries with no populous city (no sitemap) are skipped.
 * @param {Context} ctx
 * @param {string[]} isoCodes ISO 3166 codes
 * @return {string[]}
 */
export function browseSitemapSlugsForIso(ctx, isoCodes) {
  init(ctx);
  const isoToId = new Map(Object.entries(countryIdToIso).map(([id, iso]) => [iso, id]));
  return isoCodes.map((iso) => isoToId.get(iso)).filter(Boolean);
}

/**
 * Handles `/shabbat/browse/`, its sitemap index, and the per-country and
 * per-admin1 pages (`/shabbat/browse/<slug>[.xml]`).
 * @param {Context} ctx
 * @return {Promise<any>}
 */
export async function shabbatBrowse(ctx) {
  init(ctx);
  const rpath = ctx.request.path;
  if (rpath === '/shabbat/browse/') {
    ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
    if (checkFreshETag(ctx, ctx.request.query, {numCountries})) {
      return;
    }
    return ctx.render('shabbat-browse', {
      title: 'Shabbat candle-lighting times for world cities - Hebcal',
      continents: Object.values(continents),
    });
  }
  if (rpath === '/shabbat/browse/sitemap.xml') {
    ctx.type = 'text/xml';
    ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
    if (checkFreshETag(ctx, ctx.request.query, {numCountries})) {
      return;
    }
    ctx.body = await ctx.render('shabbat-browse-sitemap', {
      writeResp: false,
      countries: browseSitemapCountries(ctx),
      lastmod: dayjs().day(0).format('YYYY-MM-DD'),
    });
    return;
  }
  const base0 = basename(rpath);
  const base = base0.endsWith('.xml') ? base0.substring(0, base0.length - 4) : base0;
  const iso = countryIdToIso[base];
  if (iso !== undefined) {
    return countryPage(ctx, iso);
  }
  const countryA1 = countryAdmin1[base];
  if (countryA1 !== undefined) {
    return countryAdmin1Page(ctx, countryA1);
  }
  ctx.throw(404, `Browse page not found: ${base}`);
}

/**
 * Lists every populous city in one admin1 with this week's candle-lighting.
 * @param {Context} ctx
 * @param {CountryAdmin1} countryA1
 * @return {Promise<any>|undefined}
 */
function countryAdmin1Page(ctx, countryA1) {
  const countryCode = countryA1.cc;
  const results = prepareGeonames(ctx, COUNTRY_ADMIN_SQL).all(countryCode, countryA1.admin1);
  const tzid = results?.[0]?.timezone || 'America/New_York';
  const now = new Date();
  const saturday = dayjs.tz(now, tzid).day(6);
  const eTagAttrs = {
    countryCode,
    admin1: countryA1.admin1,
    tzid,
    numCities: results.length,
    yy: saturday.year(),
    mm: saturday.month(),
    dd: saturday.date(),
  };
  expiresSaturdayNight(ctx, now, tzid);
  if (checkFreshETag(ctx, ctx.request.query, eTagAttrs)) {
    return;
  }
  results.forEach((r) => addHref(r, countryCode));
  const {friday, parsha} = makeCandleLighting(ctx, results, countryCode);
  const countryName = `${countryA1.name}, ${isoToCountry[countryCode]}`;
  const props = {
    title: `${countryName} Shabbat Times - Hebcal`,
    countryName,
    results,
    friday,
    parsha,
    admin1: {size: 0},
    countryA1,
    flag: flag(countryCode),
  };
  return render(ctx, 'shabbat-browse-country-small', props);
};

/**
 * A large country's HTML page lists only its admin1 sub-pages, which
 * init() has already computed, so it needs no city query.
 * @param {Context} ctx
 * @param {string} countryCode ISO 3166 code
 * @return {Promise<any>|undefined}
 */
function countryAdmin1IndexPage(ctx, countryCode) {
  const countryName = isoToCountry[countryCode];
  const admin1 = countryAdmin1List[countryCode];
  // cache if the list of cities and admin1s is stable
  ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
  const eTagAttrs = {
    countryCode,
    numCities: countryNumCities[countryCode],
    numAdmin1: admin1.length,
  };
  if (checkFreshETag(ctx, ctx.request.query, eTagAttrs)) {
    return;
  }
  return render(ctx, 'shabbat-browse-admin1', {
    title: `${countryName} Shabbat Times - Hebcal`,
    countryCode,
    flag: flag(countryCode),
    countryName,
    admin1,
  });
}

/**
 * A country's browse page (or `.xml` sitemap): its cities with this week's
 * candle-lighting, or an admin1 index for a large country.
 * @param {Context} ctx
 * @param {string} countryCode ISO 3166 code
 * @return {Promise<any>|undefined}
 */
function countryPage(ctx, countryCode) {
  if (countryAdmin1List[countryCode] !== undefined &&
      !basename(ctx.request.path).endsWith('.xml')) {
    return countryAdmin1IndexPage(ctx, countryCode);
  }
  const countryName = isoToCountry[countryCode];
  const results = prepareGeonames(ctx, COUNTRY_SQL).all(countryCode);
  results.forEach((r) => addHref(r, countryCode));
  const admin1 = results.reduce((map, val) => {
    if (val.admin1ascii !== null) {
      map.set(val.admin1ascii, val.admin1);
    }
    return map;
  }, new Map());

  const tzid = results?.[0]?.timezone || 'America/New_York';
  const eTagAttrs = {
    countryCode,
    tzid,
    numCities: results.length,
  };

  if (results.length > MAX_CITIES_ON_COUNTRY_PAGE) {
    // normally only the .xml sitemap gets here; countryAdmin1IndexPage()
    // serves the HTML unless none of the country's admin1 codes resolved
    // cache if the list of cities and timezone is stable
    ctx.set('Cache-Control', CACHE_CONTROL_30DAYS);
    if (checkFreshETag(ctx, ctx.request.query, eTagAttrs)) {
      return;
    }
    const listItems = makeAdmin1(admin1);
    const countryUrlToken = makeAnchor(countryName);
    listItems.forEach((a1) => a1.href = countryUrlToken + '-' + a1.id);
    return render(ctx, 'shabbat-browse-admin1', {
      title: `${countryName} Shabbat Times - Hebcal`,
      countryCode,
      flag: flag(countryCode),
      countryName,
      admin1: listItems,
      results,
    });
  }

  const now = new Date();
  const saturday = dayjs.tz(now, tzid).day(6);
  eTagAttrs.yy = saturday.year();
  eTagAttrs.mm = saturday.month();
  eTagAttrs.dd = saturday.date();
  expiresSaturdayNight(ctx, now, tzid);
  if (checkFreshETag(ctx, ctx.request.query, eTagAttrs)) {
    return;
  }

  const {friday, parsha} = makeCandleLighting(ctx, results, countryCode);

  if (results.length < 30 || admin1.size === 1 || (results.length / admin1.size) < 1.25) {
    return render(ctx, 'shabbat-browse-country-small', {
      title: `${countryName} Shabbat Times - Hebcal`,
      countryCode,
      flag: flag(countryCode),
      countryName,
      results,
      admin1,
      friday,
      parsha,
    });
  } else {
    const listItems = makeAdmin1(admin1);
    return render(ctx, 'shabbat-browse-country', {
      title: `${countryName} Shabbat Times - Hebcal`,
      countryCode,
      flag: flag(countryCode),
      countryName,
      results,
      admin1: listItems,
      friday,
      parsha,
    });
  }
}

/**
 * Adds `countryCode` and this Friday's candle-lighting time to each city.
 * @param {Context} ctx
 * @param {CityRow[]} results
 * @param {string} countryCode ISO 3166 code
 * @return {{friday: Dayjs, parsha: string|null}}
 */
function makeCandleLighting(ctx, results, countryCode) {
  const tzid = results?.[0]?.timezone || 'America/New_York';
  const now = new Date();
  const today = dayjs.tz(now, tzid);
  const friday = today.day(5);
  const parsha = getParsha(today.day(6), countryCode === 'IL');
  results.forEach((city) => city.countryCode = countryCode);
  results.forEach((city) => addCandleTime(friday, city));
  return {friday, parsha};
}

/**
 * Name of the parsha read on `saturday`, or of the holiday that displaces it.
 * @param {Dayjs} saturday
 * @param {boolean} il Israel schedule
 * @return {string|null}
 */
function getParsha(saturday, il) {
  const hd = new HDate(saturday.toDate());
  const hyear = hd.getFullYear();
  const sedra = getSedra(hyear, il);
  const parsha0 = sedra.lookup(hd);
  let parsha = null;
  if (parsha0.chag) {
    const events = getHolidaysOnDate(hd, il) || [];
    if (events.length > 0) {
      parsha = events[0].basename();
    }
  } else {
    parsha = parsha0.parsha.join('-');
  }
  return parsha;
}

/**
 * Converts an admin1 map into list items sorted by display name.
 * @param {Map<string, string>} admin1 ASCII name => display name
 * @return {Admin1ListItem[]}
 */
function makeAdmin1(admin1) {
  const listItems = Array.from(admin1.entries()).map((a1) => {
    const asciiname = a1[0];
    const name = a1[1];
    return {name, id: makeAnchor(asciiname)};
  });
  listItems.sort((a, b) => a.name.localeCompare(b.name));
  return listItems;
}

/**
 * Sets the city's `isoDate`, `fmtTime` and `isoDateTime` for candle-lighting
 * on `friday`. Cities without a time zone are logged and skipped.
 * @param {Dayjs} friday
 * @param {CityRow} city
 */
function addCandleTime(friday, city) {
  const elevation = (city.elevation && city.elevation > 0) ? city.elevation : 0;
  if (!city.timezone) {
    console.log(city);
    return;
  }
  const location = new Location(city.latitude, city.longitude, city.countryCode === 'IL',
      city.timezone, city.name, city.countryCode, city.geonameid, elevation);
  const dt = new Date(friday.year(), friday.month(), friday.date());
  const events = calendar({
    noHolidays: true,
    candlelighting: true,
    location,
    il: location.getIsrael(),
    start: dt,
    end: dt,
  });
  if (events.length && typeof events[0].eventTimeStr === 'string') {
    const timeStr = events[0].eventTimeStr;
    city.isoDate = friday.format('YYYY-MM-DD');
    city.fmtTime = reformatTimeStr(timeStr, 'pm', {location});
    const tzid = location.getTzid();
    city.isoDateTime = Zmanim.formatISOWithTimeZone(tzid, events[0].eventTime);
  }
}
