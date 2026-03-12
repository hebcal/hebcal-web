import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import {app} from '../src/app-www.js';
import {DOCUMENT_ROOT} from '../src/common.js';

// Lag BaOmer has photo.fn = "myazv2ldos.webp" with 640 and 800 dimensions
const PHOTO_STEM = 'myazv2ldos';
const PHOTO_WEBP = PHOTO_STEM + '.webp';
const PHOTO_AVIF = PHOTO_STEM + '.avif';

// Smallest valid 1x1 WebP (lossy, 26 bytes)
const MINIMAL_WEBP = Buffer.from(
    '52494646' + // "RIFF"
    '1a000000' + // file size (little-endian)
    '57454250' + // "WEBP"
    '56503820' + // "VP8 "
    '0c000000' + // chunk size
    '3001009d' + // VP8 bitstream start
    '012a0100' +
    '0100023e' +
    'db2522',
    'hex',
);

// Minimal AVIF: a valid ftyp+mdat box that identifies as AVIF
const MINIMAL_AVIF = Buffer.from(
    '00000018' + // box size = 24
    '66747970' + // "ftyp"
    '61766966' + // major_brand = "avif"
    '00000000' + // minor_version
    '61766966' + // compatible_brands[0] = "avif"
    '6d696631', // compatible_brands[1] = "mif1"
    'hex',
);

const imageDir640 = path.join(DOCUMENT_ROOT, 'i', 'is', '640');
const webpPath = path.join(imageDir640, PHOTO_WEBP);
const avifPath = path.join(imageDir640, PHOTO_AVIF);

beforeAll(() => {
  fs.mkdirSync(imageDir640, {recursive: true});
  fs.writeFileSync(webpPath, MINIMAL_WEBP);
  fs.writeFileSync(avifPath, MINIMAL_AVIF);
});

afterAll(() => {
  fs.rmSync(webpPath, {force: true});
  fs.rmSync(avifPath, {force: true});
});

describe('Holiday detail page image formats', () => {
  it('should include an <img> with webp srcset for lag-baomer', async () => {
    const res = await request(app.callback()).get('/holidays/lag-baomer');
    expect(res.status).toBe(200);
    expect(res.type).toContain('html');
    expect(res.text).toContain(PHOTO_WEBP);
  });

  it('should include a <source type="image/avif"> for lag-baomer when avif file exists', async () => {
    const res = await request(app.callback()).get('/holidays/lag-baomer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('type="image/avif"');
    expect(res.text).toContain(PHOTO_AVIF);
  });

  it('should wrap images in a <picture> element for lag-baomer', async () => {
    const res = await request(app.callback()).get('/holidays/lag-baomer');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<picture>');
    expect(res.text).toContain('</picture>');
  });

  it('avif source should list multiple widths in srcset for lag-baomer', async () => {
    const res = await request(app.callback()).get('/holidays/lag-baomer');
    expect(res.status).toBe(200);
    // srcset should contain 800w, 640w, and 400w variants
    const avifSrcset = res.text.match(
        /type="image\/avif"[^>]*srcset="([^"]+)"/,
    );
    expect(avifSrcset).not.toBeNull();
    const srcset = avifSrcset[1];
    expect(srcset).toContain('800w');
    expect(srcset).toContain('640w');
    expect(srcset).toContain('400w');
    expect(srcset).toContain(PHOTO_AVIF);
  });
});
