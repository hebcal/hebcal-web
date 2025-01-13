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

if (argv.length !== 1) {
  console.error(`Usage: node app.js file.csv > src/areyvut-kindness-a-day.json`);
  process.exit(1);
}

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
    const gregDateStr = r[0];
    const dateParts = gregDateStr.split(/\s+/);
    const month = monthNames[dateParts[1]];
    const day = parseInt(dateParts[2]);
    if (isNaN(day)) {
      continue;
    }
    const dt = pad2(month) + '-' + pad2(day);
    const title = cleanStr(r[3]);
    const verseStr = cleanStr(r[4]);
    const sourceStr = cleanStr(r[5]);
    let quote = verseStr;
    if (sourceStr) {
      quote += '\\n\\n' + sourceStr;
    }
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
    const dateParts = record[0].split(/\s+/);
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
  return s.trim()
      .replace(/\.$/, '')
      .replace(/^"(.+)"$/, '$1')
      .replace(/^"(.+)”$/, '$1')
      .replace(/^“(.+)”$/, '$1')
      .replace(/^“(.+)"$/, '$1')
      .replace(/\.$/, '')
      .replace(/\s+/g, ' ')
      .replace(/“\(/, '” (')
      .trim()
      .replace(/^"/, '')
      .replace(/"$/, '')
      .trim()
  ;
}
