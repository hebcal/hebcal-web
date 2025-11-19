import {basename, dirname} from 'node:path';
import {getSedra, parshiot} from '@hebcal/core';
import {makeAnchor} from '@hebcal/rest-api';
import {utmSourceFromRef, yearIsOutsideHebRange} from './common.js';
import dayjs from 'dayjs';

const shortToLong = {
  h: 'holidays',
  s: 'sedrot',
  o: 'omer',
};

export function shortUrlRedir(ctx) {
  const qs = new URLSearchParams(ctx.request.query);
  let utmSource = qs.get('utm_source') || qs.get('us');
  let utmMedium = qs.get('utm_medium') || qs.get('um');
  if (qs.has('uc')) {
    const campaign = qs.get('uc');
    if (campaign.startsWith('pdf-')) {
      utmSource = utmSource || 'pdf';
      utmMedium = utmMedium || 'document';
    } else if (campaign.startsWith('ical-')) {
      utmSource = utmSource || 'js';
      utmMedium = utmMedium || 'icalendar';
    }
    qs.set('utm_campaign', campaign);
    qs.delete('uc');
  }
  if (!utmSource) {
    utmSource = utmSourceFromRef(ctx);
  }
  utmSource = utmSource || 'redir';
  utmMedium = utmMedium || 'redir';
  qs.set('utm_source', utmSource);
  qs.set('utm_medium', utmMedium);
  qs.delete('us');
  qs.delete('um');
  const rpath = ctx.request.path;
  const base = rpath.substring(3);
  const shortStr = rpath[1];
  const dest = shortToLong[shortStr];
  if (!dest) {
    ctx.throw(500, `Unknown short URL '${shortStr}'`);
  }
  let destUrl;
  if (dest === 'sedrot') {
    destUrl = shortParshaRedir(ctx, base, qs);
  }
  if (!destUrl) {
    destUrl = `https://www.hebcal.com/${dest}/${base}?` + qs.toString();
  }
  ctx.redirect(destUrl);
}

function isValidDouble(id) {
  switch (id) {
    case 21: // Vayakhel-Pekudei
    case 26: // Tazria-Metzora
    case 28: // Achrei Mot-Kedoshim
    case 31: // Behar-Bechukotai
    case 38: // Chukat-Balak
    case 41: // Matot-Masei
    case 50: // Nitzavim-Vayeilech
      return true;
  }
  return false;
}

const sedrotBaseUrl = 'https://www.hebcal.com/sedrot/';

function shortParshaRedir(ctx, str, qs) {
  if (!str) {
    return sedrotBaseUrl;
  }
  const code = str.charCodeAt(0);
  if (code < 48 || code > 57) {
    return false; // not a number, let old redirect logic happen
  }
  const parshaStr = basename(str);
  const parshaId = parseInt(parshaStr, 10) - 1;
  if (isNaN(parshaId) || parshaId < 0 || parshaId > parshiot.length - 1) {
    ctx.throw(400, `invalid short redirect parsha: ${parshaStr}`);
  }
  const doubled = parshaStr.endsWith('d');
  if (doubled && !isValidDouble(parshaId)) {
    ctx.throw(400, `invalid short redirect double parsha: ${parshaStr}`);
  }
  const yearStr = dirname(str);
  const year = parseInt(yearStr, 10);
  if (!year) {
    ctx.throw(400, `invalid short redirect parsha: ${str}`);
  }
  if (yearIsOutsideHebRange(year)) {
    ctx.throw(410, `short redirect year out of range: ${yearStr}`);
  }
  const il = yearStr.endsWith('i');
  const sedra = getSedra(year, il);
  const hd = sedra.find(doubled ? -parshaId : parshaId);
  if (hd === null) {
    ctx.throw(404, `short redirect not found: ${str}`);
    return false;
  }
  const name0 = doubled ?
      (parshiot[parshaId] + '-' + parshiot[parshaId + 1]) :
      parshiot[parshaId];
  const name = makeAnchor(name0);
  const d = dayjs(hd.greg());
  const fmtDt = d.format('YYYYMMDD');
  if (il) {
    qs.set('i', 'on');
  }
  return `${sedrotBaseUrl}${name}-${fmtDt}?` + qs.toString();
}
