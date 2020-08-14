/* eslint-disable require-jsdoc */
import {HDate} from '@hebcal/core';
import {gematriyaDate} from './converter';

function expires(ctx, dt) {
  const exp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1, 0, 0, 0);
  ctx.set('Expires', exp.toUTCString());
}

export function hdateJavascript(ctx) {
  const rpath = ctx.request.path;
  const dt = new Date();
  const hd = new HDate(dt);
  ctx.set('Last-Modified', dt.toUTCString());
  expires(ctx, dt);
  ctx.type = 'application/javascript';
  const dateStr = rpath === '/etc/hdate-en.js' ? hd.render() : gematriyaDate(hd);
  ctx.body = 'document.write("' + dateStr + '");\n';
}

const hmToArg = {
  'Sh\'vat': 'Shvat',
  'Adar I': 'Adar1',
  'Adar II': 'Adar2',
};

export async function hdateXml(ctx) {
  const rpath = ctx.request.path;
  const dt = new Date();
  const hd = new HDate(dt);
  const utcString = dt.toUTCString();
  const hebrew = rpath === '/etc/hdate-he.xml';
  const hm = hd.getMonthName();
  const props = {
    writeResp: false,
    title: hebrew ? gematriyaDate(hd) : hd.render(),
    lang: hebrew ? 'he' : 'en',
    lastBuildDate: utcString,
    year: dt.getFullYear(),
    hy: hd.getFullYear(),
    hm: hmToArg[hm] || hm,
    hd: hd.getDate(),
  };
  ctx.set('Last-Modified', utcString);
  expires(ctx, dt);
  ctx.type = 'text/xml';
  ctx.body = await ctx.render('hdate-xml', props);
}
