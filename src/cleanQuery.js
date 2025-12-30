import {empty} from './empty.js';
import {
  hebcalFormDefaults,
  negativeOpts,
  booleanOpts,
  numberOpts,
  allGeoKeys,
  dailyLearningOpts,
} from './urlArgs.js';

const allKeys = new Set(['ulid', 'cfg', 'start', 'end', 'id', 'v', 'em', 'mm']);
for (const key of [].concat(allGeoKeys,
    Object.keys(booleanOpts),
    Object.keys(dailyLearningOpts),
    Object.keys(hebcalFormDefaults),
    Object.keys(negativeOpts),
    Object.keys(numberOpts),
)) {
  allKeys.add(key);
}

/**
 * @param {Object.<string,string>} query
 */
export function cleanQuery(query) {
  for (const key of allKeys) {
    const value = query[key];
    if (!empty(value)) {
      const cleanStr = value.replaceAll(/[<>&"'`]/g, '');
      if (value !== cleanStr) {
        query[key] = cleanStr;
      }
    }
  }
}
