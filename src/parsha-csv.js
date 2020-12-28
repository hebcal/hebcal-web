/* eslint-disable require-jsdoc */
import {basename} from 'path';
import {PassThrough} from 'stream';
import * as leyning from '@hebcal/leyning';
import createError from 'http-errors';

const reFullKriyahIL = /^fullkriyah-il-(\d+).csv$/;
const reFullKriyahDiaspora = /^fullkriyah-(\d+).csv$/;
const reTriennial = /^triennial-(\d+)-\d+.csv$/;

export async function parshaCsv(ctx) {
  const rpath = ctx.request.path;
  const base = basename(rpath);
  let matches;
  if ((matches = reFullKriyahIL.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], true, leyning.writeFullKriyahCsv);
  } else if ((matches = reFullKriyahDiaspora.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], false, leyning.writeFullKriyahCsv);
  } else if ((matches = reTriennial.exec(base)) !== null) {
    sendCsv(ctx, base, matches[1], false, leyning.writeTriennialCsv);
  } else {
    throw createError(404, `Sorry, can't find CSV file: ${base}`);
  }
}

function sendCsv(ctx, filename, hyear, il, callback) {
  ctx.type = 'text/csv; charset=utf-8';
  ctx.response.attachment(filename);
  const pt = ctx.body = new PassThrough();
  callback(pt, hyear, il);
  pt.end();
}
