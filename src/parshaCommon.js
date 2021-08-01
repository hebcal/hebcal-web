import * as leyning from '@hebcal/leyning';
import {makeAnchor} from '@hebcal/rest-api';

export const torahBookNames = 'Genesis Exodus Leviticus Numbers Deuteronomy DoubledParshiyot'.split(' ');
export const parshaByBook = new Map();
for (const book of torahBookNames) {
  parshaByBook.set(book, new Map());
}

export const sedrot = new Map();
export const doubled = new Map();
for (const [parshaName, reading] of Object.entries(leyning.parshiyot)) {
  const anchor = makeAnchor(parshaName);
  sedrot.set(anchor, parshaName);
  sedrot.set(anchor.replace(/-/g, ''), parshaName);
  if (reading.combined) {
    const [p1, p2] = parshaName.split('-');
    doubled.set(p1, parshaName);
    doubled.set(p2, parshaName);
  }
  const bookId = reading.combined ? 'DoubledParshiyot' : torahBookNames[reading.book - 1];
  parshaByBook.get(bookId).set(anchor, parshaName);
}
