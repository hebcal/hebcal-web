import {HebrewCalendar, Locale, Location} from '@hebcal/core';
import {makeHebcalOptions} from './common';
import '@hebcal/locales';
import dayjs from 'dayjs';
import querystring from 'querystring';
import {countryNames, getEventCategories, makeAnchor} from '@hebcal/rest-api';

// eslint-disable-next-line require-jsdoc
export async function shabbatApp(ctx) {
  const q = ctx.request.query;
  const p = makeProperties(ctx);
  if (q.cfg === 'i') {
    return ctx.render('shabbat-iframe', p);
  }
  return ctx.render('shabbat', p);
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

/**
 * @param {Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext>} ctx
 * @return {Object}
 */
function makeProperties(ctx) {
  const q = Object.assign(
      querystring.parse(ctx.cookies.get('C') || ''),
      ctx.request.query,
      {c: 'on'},
  );
  let opts0;
  try {
    opts0 = makeHebcalOptions(ctx.db, q);
  } catch (err) {
    ctx.throw(400, err.message);
  }
  q.M = typeof opts0.havdalahMins === 'undefined' ? 'on' : 'off';
  const location = opts0.location || Location.lookup('New York');
  let geoUrlArgs = q.zip ? `zip=${q.zip}` : `geonameid=${location.getGeoId()}`;
  if (typeof opts0.havdalahMins !== 'undefined') {
    geoUrlArgs += '&m=' + opts0.havdalahMins;
  }
  geoUrlArgs += `&M=${q.M}&lg=` + (q.lg || 's');
  q.cityTypeahead = location.getName();
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
  if (q.M === 'off' && !isNaN(opts0.havdalahMins)) {
    options.havdalahMins = opts0.havdalahMins;
  }
  const events = HebrewCalendar.calendar(options);
  const items = events.map((ev) => eventToHtml(ev, options));
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
    location,
    locationName: location.getName(),
    q,
    items,
    hyear: events[0].getDate().getFullYear(),
    geoUrlArgs,
    locale: Locale.getLocaleName(),
    Shabbat: Locale.gettext('Shabbat'),
    title: Locale.gettext('Shabbat') + ' Times for ' + location.getName(),
    summary: briefText.join('. '),
    jsonLD: JSON.stringify(getJsonLD(firstCandles, location)),
    rss_href: '',
  };
}

// eslint-disable-next-line require-jsdoc
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
function eventToHtml(ev, options) {
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
