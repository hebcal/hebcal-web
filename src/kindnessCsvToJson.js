/* eslint-disable require-jsdoc */
import fs from 'fs';
import {parse} from 'csv-parse';
import {pad2} from '@hebcal/rest-api';

const monthNames = {
  'January': 1,
  'February': 2,
  'March': 3,
  'April': 4,
  'May': 5,
  'June': 6,
  'July': 7,
  'August': 8,
  'September': 9,
  'October': 10,
  'November': 11,
  'December': 12,
};

const argv = process.argv.slice(2);

main()
    .then(() => {
      console.error('Success!');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });

async function main() {
  const filename = argv[0];
  console.error(`Reading ${filename}`);
  const obj = {};
  const records = await processFile(filename);
  for (const r of records) {
    const dateParts = r[0].split(' ');
    const month = monthNames[dateParts[1]];
    const day = parseInt(dateParts[2]);
    const dt = pad2(month) + '-' + pad2(day);
    const title = cleanStr(r[2]);
    const quote = cleanStr(r[3]);
    obj[dt] = [title, quote];
  }
  console.log(JSON.stringify(obj, null, 1));
}

async function processFile(filename) {
  const records = [];
  const rs = fs.createReadStream(filename);
  const parser = rs.pipe(parse({
    // CSV options if any
  }));
  for await (const record of parser) {
    const dateParts = record[0].split(' ');
    const month = monthNames[dateParts[1]];
    if (!month) {
      continue;
    }
    records.push(record);
  }
  return records;
}

/**
 * @return {string}
 * @param {string} s
 */
function cleanStr(s) {
  return s.trim().replace(/\.$/, '').replace(/\s+/g, ' ').replace(/“\(/, '” (').trim();
}
