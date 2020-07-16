/* eslint-disable require-jsdoc */
import {HebrewCalendar, Locale, Location} from '@hebcal/core';
import {makeHebcalOptions} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';
import querystring from 'querystring';
import {countryNames, getEventCategories, makeAnchor} from '@hebcal/rest-api';

export async function shabbatApp(ctx) {
  makeItems(ctx);
  const q = ctx.request.query;
  if (q.cfg === 'i') {
    return ctx.render('shabbat-iframe', {});
  } else if (q.cfg === 'j') {
    const html = await ctx.render('shabbat-js', {writeResp: false});
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Cache-Control', 'max-age=86400');
    ctx.type = 'text/javascript';
    ctx.body = html.split('\n').map((line) => {
      return 'document.write("' + line.replace(/"/g, '\\"') + '");\n';
    }).join('');
  } else {
    const p = makePropsForFullHtml(ctx);
    return ctx.render('shabbat', p);
  }
}

/**
 * Gets start and end days for filtering relevant hebcal events
 * @param {Date} now
 * @return {dayjs.Dayjs[]}
 */
function getStartAndEnd(now) {
  const midnight = dayjs(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = midnight.day();
  const saturday = midnight.add(6 - dow, 'day');
  const fiveDaysAhead = midnight.add(5, 'day');
  const endOfWeek = fiveDaysAhead.isAfter(saturday) ? fiveDaysAhead : saturday;
  return [midnight, endOfWeek];
}

function makeItems(ctx) {
  const q = Object.assign(
      querystring.parse(ctx.cookies.get('C') || ''),
      {c: 'on', tgt: '_top'},
      ctx.request.query,
  );
  let opts0;
  try {
    opts0 = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  const location = opts0.location || Location.lookup('New York');
  q['city-typeahead'] = location.getName();
  const [midnight, endOfWeek] = getStartAndEnd(new Date());
  const options = {
    start: midnight.toDate(),
    end: endOfWeek.toDate(),
    candlelighting: true,
    location,
    locale: opts0.locale,
    il: opts0.il,
    sedrot: true,
  };
  q.M = typeof opts0.havdalahMins === 'undefined' ? 'on' : 'off';
  if (q.M === 'off' && !isNaN(opts0.havdalahMins)) {
    options.havdalahMins = opts0.havdalahMins;
  }
  const events = HebrewCalendar.calendar(options);
  ctx.state.q = q;
  ctx.state.hyear = events[0].getDate().getFullYear();
  ctx.state.items = events.map((ev) => eventToItem(ev, options));
  ctx.state.location = location;
  ctx.state.title = Locale.gettext('Shabbat') + ' Times for ' + location.getName();
  ctx.state.Shabbat = Locale.gettext('Shabbat');

  let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
  if (typeof options.havdalahMins !== 'undefined') {
    geoUrlArgs += '&m=' + options.havdalahMins;
  }
  geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
  ctx.state.geoUrlArgs = geoUrlArgs;
}

function makePropsForFullHtml(ctx) {
  const items = ctx.state.items;
  const location = ctx.state.location;
  const briefText = items.map((i) => {
    const date = i.d.format('MMM D');
    if (i.fmtTime) {
      return `${i.desc} at ${i.fmtTime} on ${date}`;
    } else if (i.cat === 'parashat') {
      return i.desc;
    } else {
      return `${i.desc} on ${date}`;
    }
  });
  const firstCandles = items.find((i) => i.desc === 'Candle lighting');
  return {
    summary: briefText.join('. '),
    jsonLD: JSON.stringify(getJsonLD(firstCandles, location)),
    locationName: location.getName(),
  };
}

function getJsonLD(item, location) {
  const admin1 = location.admin1 || '';
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    'name': `Candle Lighting for ${location.getShortName()} at ${item.fmtTime}`,
    'startDate': `${item.isoDate}T${item.isoTime}:00`,
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'eventStatus': 'https://schema.org/EventScheduled',
    'location': {
      '@type': 'Place',
      'name': location.getName(),
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': location.getShortName(),
        'addressRegion': admin1,
        'addressCountry': countryNames[location.getCountryCode()],
      },
      'geo': {
        '@type': 'GeoCoordinates',
        'latitude': location.getLatitude(),
        'longitude': location.getLongitude(),
      },
    },
  };
}

/**
 * @param {Event} ev
 * @param {HebrewCalendar.Options} options
 * @return {Object}
 */
function eventToItem(ev, options) {
  const desc = ev.getDesc();
  const hd = ev.getDate();
  const d = dayjs(hd.greg());
  const attrs = ev.getAttrs();
  const fmtDate = d.format('dddd, D MMMM YYYY');
  const isoDate = d.format('YYYY-MM-DD');
  const categories = getEventCategories(ev);
  const cat0 = categories[0];
  const id = d.format('YYYYMMDD') + '-' + makeAnchor(desc);
  if (desc.startsWith('Candle lighting') || desc.startsWith('Havdalah')) {
    const hourMin = HebrewCalendar.reformatTimeStr(attrs.eventTimeStr, 'pm', options);
    const subj = ev.render();
    const shortDesc = subj.substring(0, subj.indexOf(':'));
    return {
      id,
      desc: shortDesc,
      cat: cat0,
      d,
      isoDate,
      isoTime: attrs.eventTimeStr,
      fmtDate,
      fmtTime: hourMin,
    };
  } else {
    return {
      id,
      desc: ev.render(),
      cat: cat0,
      d,
      isoDate,
      fmtDate,
      url: ev.url(),
    };
  }
}
