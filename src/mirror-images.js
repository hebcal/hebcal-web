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
  for (const asin of ASINs) {
    const path = `/var/www/html/i/${asin}.01.MZZZZZZZ.jpg`;
    try {
      await access(path, fs.constants.R_OK);
      logger.info(`skipping ${asin}`);
    } catch {
      const url = `http://images.amazon.com/images/P/${asin}.01.MZZZZZZZ.jpg`;
      logger.info(url);
      const res = await fetch(url);
      if (res.ok) {
        const body = res.body;
        const fileStream = fs.createWriteStream(path);
        const stream = new WritableStream({
          write(chunk) {
            fileStream.write(chunk);
          },
        });
        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          body.pipeTo(stream);
        });
      } else {
        logger.error(`**** NOT OK ${url}`);
      }
    }
  }
}
