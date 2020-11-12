/* eslint-disable require-jsdoc */
import Database from 'better-sqlite3';
import {typeaheadScript} from './common';
import {makeAnchor} from '@hebcal/rest-api';

const CONTINENT_SQL = 'SELECT Continent, ISO, Country FROM country order by Continent, Country';
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

export async function shabbatBrowseIndex(ctx) {
  const geonamesFilename = 'geonames.sqlite3';
  const geonamesDb = new Database(geonamesFilename, {fileMustExist: true});
  const geonamesStmt = geonamesDb.prepare(CONTINENT_SQL);
  const results = geonamesStmt.all();
  const continents = {};
  for (const [iso, name] of Object.entries(CONTINENTS)) {
    continents[iso] = {name, countries: []};
  }
  for (const result of results) {
    const country = result.Country;
    if (country !== '') {
      continents[result.Continent].countries.push({
        name: country,
        href: makeAnchor(country),
      });
    }
  }
  await ctx.render('shabbat-browse', {
    title: 'Shabbat candle-lighting times for world cities | Hebcal Jewish Calendar',
    continents: Object.values(continents),
    xtra_html: myTypeaheadScript,
  });
  geonamesDb.close();
}
