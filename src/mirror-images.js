/* eslint-disable require-jsdoc */
import holidayMeta from './holidays.json';
import {access} from 'node:fs/promises';
import fs from 'node:fs';
import {WritableStream} from 'node:stream/web';
import pino from 'pino';

const logger = pino();

const ASINs = [];
for (const meta of Object.values(holidayMeta)) {
  if (Array.isArray(meta.books)) {
    for (const book of meta.books) {
      ASINs.push(book.ASIN);
    }
  }
}

main().then(() => {
  logger.info('done');
});

async function main() {
  const toFetch = [];
  for (const asin of ASINs) {
    const fn = `${asin}.01.LZZZZZZZ.jpg`;
    const path = `/var/www/html/i/${fn}`;
    try {
      await access(path, fs.constants.R_OK);
      logger.info(`skipping ${asin}`);
    } catch {
      toFetch.push(asin);
    }
  }
  const promises = [];
  for (const asin of toFetch) {
    const fn = `${asin}.01.LZZZZZZZ.jpg`;
    const path = `/var/www/html/i/${fn}`;
    const url = `https://images.amazon.com/images/P/${fn}`;
    logger.info(url);
    const res = await fetch(url, {
      'headers': {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'referer': 'https://www.amazon.com/',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      },
      'referrerPolicy': 'strict-origin-when-cross-origin',
      'body': null,
      'method': 'GET',
    });
    if (res.ok) {
      const body = res.body;
      const fileStream = fs.createWriteStream(path);
      const stream = new WritableStream({
        write(chunk) {
          fileStream.write(chunk);
        },
      });
      promises.push(new Promise((resolve, reject) => {
        logger.info(`writing ${path}`);
        fileStream.on('finish', resolve);
        body.pipeTo(stream);
        logger.info(`done1 ${asin}`);
      }));
      logger.info(`done2 ${asin}`);
    } else {
      logger.error(`**** NOT OK ${url}`);
    }
  }
  await Promise.all(promises);
  logger.info(`done3`);
}
