import {flags} from '@hebcal/core';
import {formatAliyahWithBook} from '@hebcal/leyning';
import {
  eventsToClassicApiHeader, eventToClassicApiObject,
} from '@hebcal/rest-api';
import {getTriennialForParshaHaShavua} from '@hebcal/triennial';
import {readJSON} from './readJSON.js';

export const pkg = readJSON('../package.json');

export function myEventsToClassicApi(events, options, leyning) {
  const obj = eventsToClassicApiHeader(events, options);
  if (typeof obj.version === 'string') {
    obj.version += '-' + pkg.version;
  }
  obj.items = events.map((ev) => {
    const apiObj = eventToClassicApiObject(ev, options, leyning);
    if (leyning &&
      (ev.getFlags() & flags.PARSHA_HASHAVUA) &&
      ev.getDate().getFullYear() >= 5745) {
      const triReading = getTriennialForParshaHaShavua(ev, options.il);
      const aliyot = triReading?.aliyot;
      if (aliyot) {
        const triAliyot = {};
        for (const [num, aliyah] of Object.entries(aliyot)) {
          if (typeof aliyah !== 'undefined') {
            const k = num === 'M' ? 'maftir' : num;
            triAliyot[k] = formatAliyahWithBook(aliyah);
          }
        }
        apiObj.leyning.triennial = triAliyot;
      }
    }
    return apiObj;
  });
  return obj;
}
