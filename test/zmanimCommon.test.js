import {describe, it, expect} from 'vitest';
import dayjs from 'dayjs';
import {Location} from '@hebcal/core';
import {ALL_TIMES, getTimesForRange} from '../src/zmanimCommon.js';

const KL_NAMES = [
  'tchilasZmanKidushLevana3Days',
  'tchilasZmanKidushLevana7Days',
  'sofZmanKidushLevanaBetweenMoldos',
  'sofZmanKidushLevana15Days',
];

describe('Kiddush Levana zmanim', () => {
  it('is part of ALL_TIMES', () => {
    for (const name of KL_NAMES) {
      expect(ALL_TIMES).toContain(name);
    }
  });

  it('appears only on the days it occurs', () => {
    const loc = Location.lookup('Jerusalem');
    // Molad of Cheshvan 5787 is Sun 2026-10-11 10:22 Jerusalem time
    const times = getTimesForRange(KL_NAMES, dayjs('2026-10-10'), dayjs('2026-11-10'),
        loc, true, true, false);
    expect(times).toEqual({
      // 3 and 7 days after the molad fall during the day: moved to tzeit
      tchilasZmanKidushLevana3Days: {'2026-10-14': '2026-10-14T18:45:00+03:00'},
      tchilasZmanKidushLevana7Days: {'2026-10-18': '2026-10-18T18:41:00+03:00'},
      // halfway between moldos is at night: rounded down, never up
      sofZmanKidushLevanaBetweenMoldos: {'2026-10-26': '2026-10-26T03:44:00+02:00'},
      // 15 days after the molad falls during the day: moved back to alot haShachar
      sofZmanKidushLevana15Days: {'2026-10-26': '2026-10-26T04:37:00+02:00'},
    });
  });
});
