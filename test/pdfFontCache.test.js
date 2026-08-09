import {describe, it, expect} from 'vitest';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import {calendar} from '@hebcal/core';
import '@hebcal/locales';
import {createPdfDoc, renderPdf} from '../src/pdf.js';
import {installSharedFonts, FONT_FILES} from '../src/pdfFontCache.js';

/**
 * Extracts and inflates every FlateDecode stream. The trailer holds a random
 * /ID and the XMP metadata stream holds the current time, both regenerated per
 * document, so whole-file bytes are never stable — the drawing and ToUnicode
 * streams are what must not change.
 * @param {Buffer} buf
 * @return {string}
 */
function contentStreams(buf) {
  const out = [];
  let i = 0;
  for (;;) {
    const start = buf.indexOf('stream\n', i);
    if (start === -1) break;
    const end = buf.indexOf('\nendstream', start);
    if (end === -1) break;
    const raw = buf.subarray(start + 7, end);
    try {
      out.push(zlib.inflateSync(raw));
    } catch {
      out.push(raw);
    }
    i = end + 5;
  }
  return Buffer.concat(out).toString('latin1')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'TIMESTAMP');
}

function collect(doc, events, options) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderPdf(doc, events, options, {});
    doc.end();
  });
}

/** Renders through createPdfDoc(), i.e. with the shared cache installed. */
function renderShared(options) {
  const events = calendar(options);
  return collect(createPdfDoc('Test Calendar', options), events, options);
}

/** Same render with stock pdfkit font handling, as a control. */
function renderStock(options) {
  const events = calendar(options);
  const doc = new PDFDocument({
    autoFirstPage: false,
    layout: 'landscape',
    margin: 0,
    pdfVersion: '1.5',
    displayTitle: true,
    lang: options?.locale || 'en-US',
  });
  doc.info['Title'] = 'Test Calendar';
  doc.info['Subject'] = 'Test Calendar';
  doc.info['Keywords'] = 'Hebrew calendar, Jewish holidays';
  doc.info['Author'] = 'Hebcal Jewish Calendar (hebcal.com)';
  for (const [name, path] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, path);
  }
  return collect(doc, events, options);
}

const gregOptions = {year: 2026, isHebrewYear: false, addHebrewDates: true, locale: 'en'};
const hebrewOptions = {year: 5786, isHebrewYear: true, addHebrewDates: true, locale: 'he'};

describe('pdfFontCache', () => {
  it('installs the shared shaped-word cache on documents from createPdfDoc', () => {
    // Guards against silently falling back to stock pdfkit, which still
    // renders correctly but about twice as slowly.
    const doc = createPdfDoc('probe', {});
    expect(Object.keys(doc._registeredFonts).sort())
        .toEqual(Object.keys(FONT_FILES).sort());
    doc.font('plain');
    // an own property, i.e. our override rather than pdfkit's prototype method
    expect(Object.hasOwn(doc._font, 'layoutCached')).toBe(true);
    doc.end();
    doc.resume();
  });

  it('shares shaped runs between documents', () => {
    const a = createPdfDoc('a', {});
    const b = createPdfDoc('b', {});
    a.font('plain');
    b.font('plain');
    // EmbeddedFont wrappers stay per-document: each owns its glyph subset
    expect(a._font).not.toBe(b._font);
    // ...but shaping the same word yields the identical cached run
    expect(a._font.layoutCached('Chanukah')).toBe(b._font.layoutCached('Chanukah'));
    for (const doc of [a, b]) {
      doc.end();
      doc.resume();
    }
  });

  it('renders content identical to stock pdfkit', async () => {
    const shared = contentStreams(await renderShared(gregOptions));
    const stock = contentStreams(await renderStock(gregOptions));
    expect(shared.length).toBeGreaterThan(1000);
    expect(shared).toEqual(stock);
  });

  it('renders content identical to stock pdfkit for a Hebrew (RTL) calendar', async () => {
    const shared = contentStreams(await renderShared(hebrewOptions));
    const stock = contentStreams(await renderStock(hebrewOptions));
    expect(shared.length).toBeGreaterThan(1000);
    expect(shared).toEqual(stock);
  });

  it('preserves the ToUnicode CMap, so PDF text stays searchable', async () => {
    // A shared *font* object would corrupt this; a shared layout cache must
    // not. U+2019 and U+02BC map to one glyph, and composite glyphs such as
    // Ç pull in a bare C during subsetting.
    const options = {...gregOptions, locale: 'fr'};
    const shared = contentStreams(await renderShared(options));
    const stock = contentStreams(await renderStock(options));
    expect(shared).toEqual(stock);
    expect(shared).not.toContain('<> ');
  });

  it('is stable across repeated renders using a warm cache', async () => {
    const first = contentStreams(await renderShared(gregOptions));
    const second = contentStreams(await renderShared(gregOptions));
    expect(first).toEqual(second);
  });

  it('leaves PDFDocument.prototype.font untouched', () => {
    const before = PDFDocument.prototype.font;
    const doc = createPdfDoc('probe', {});
    doc.font('plain');
    expect(PDFDocument.prototype.font).toBe(before);
    const stock = new PDFDocument({autoFirstPage: false});
    expect(stock.font).toBe(before);
    doc.end();
    doc.resume();
    stock.end();
    stock.resume();
  });

  it('falls back cleanly when the document is not pdfkit-shaped', () => {
    expect(installSharedFonts({})).toBe(false);
    expect(installSharedFonts(null)).toBe(false);
  });
});
