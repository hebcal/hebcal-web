import {describe, it, expect} from 'vitest';
import {makeYahrzeitEvents} from '../src/yahrzeitEvents.js';

const ULID = '01ABCDEFGHJKMNPQRSTVWXYZ00';
const EDIT_URL = `https://www.hebcal.com/yahrzeit/edit/${ULID}`;

/**
 * @param {Object<string,string>} extra
 * @return {Object<string,string>}
 */
function makeQuery(extra) {
  return {
    start: '5785',
    years: '2',
    n1: 'Jane Doe', t1: 'Yahrzeit', x1: '2020-03-14', s1: 'on',
    n2: 'Bob', t2: 'Birthday', y2: '1981', m2: '5', d2: '8',
    n3: 'Sam & Pat', t3: 'Anniversary', x3: '2010-06-20',
    n4: 'My Event', t4: 'Other', x4: '2019-01-01',
    n5: 'שרה בת אברהם', t5: 'Yahrzeit', x5: '2015-11-02',
    ...extra,
  };
}

/**
 * @param {import('@hebcal/core').Event[]} events
 * @param {string} uid
 * @return {import('@hebcal/core').Event}
 */
function findByUid(events, uid) {
  const ev = events.find((e) => e.uid === uid);
  expect(ev, uid).toBeDefined();
  return ev;
}

describe('makeYahrzeitEvents memos', () => {
  it('Yahrzeit with after-sunset date and edit URL', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID, hebdate: 'on'}), false);
    const ev = findByUid(events, `yahrzeit-5785-${ULID}-1`);
    expect(ev.getDesc()).toBe('Jane Doe’s 5th Yahrzeit (19th of Adar)');
    expect(ev.emoji).toBe('🕯️');
    expect(ev.memo).toBe(
        'Hebcal joins you in remembering Jane Doe, whose 5th Yahrzeit occurs on Wednesday, March 19, ' +
        'corresponding to the 19th of Adar, 5785.\\n\\n' +
        'Jane Doe’s Yahrzeit begins at sundown on Tuesday, March 18 and continues until ' +
        'sundown on the day of observance. It is customary to light a memorial candle at dusk ' +
        'as the Yahrzeit begins.\\n\\n' +
        'May your loved one’s soul be bound up in the bond of eternal life and may their memory ' +
        'serve as a continued source of inspiration and comfort to you.' +
        `\\n\\n${EDIT_URL}#row1`);
  });

  it('Yahrzeit whose erev is Saturday lights at nightfall', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID}), false);
    const ev = findByUid(events, `yahrzeit-5786-${ULID}-1`);
    expect(ev.memo).toContain('occurs on Sunday, March 8, corresponding to the 19th of Adar, 5786.');
    expect(ev.memo).toContain('begins at sundown on Saturday, March 7 ');
    expect(ev.memo).toContain('light a memorial candle at nightfall as the Yahrzeit begins');
  });

  it('Yahrzeit candle-lighting phrase follows the day of week of erev', () => {
    const query = makeQuery({years: '20'});
    const events = makeYahrzeitEvents(5, query, false);
    const yahrzeits = events.filter((ev) => ev.type === 'Yahrzeit');
    expect(yahrzeits.length).toBe(40);
    const seen = new Set();
    for (const ev of yahrzeits) {
      const erevDow = ev.getDate().prev().getDay();
      const when = erevDow === 5 ? 'before sundown' : erevDow === 6 ? 'at nightfall' : 'at dusk';
      seen.add(when);
      expect(ev.memo).toContain(`light a memorial candle ${when} as the Yahrzeit begins`);
    }
    expect(seen).toEqual(new Set(['before sundown', 'at nightfall', 'at dusk']));
  });

  it('Birthday', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID}), false);
    const ev = findByUid(events, `birthday-5785-${ULID}-2`);
    expect(ev.getDesc()).toBe('Bob’s 44th Hebrew Birthday');
    expect(ev.emoji).toBe('🎂✡️');
    expect(ev.memo).toBe(
        'Hebcal joins you in honoring Bob, whose 44th Hebrew Birthday occurs on Friday, May 2, ' +
        'corresponding to the 4th of Iyyar, 5785.\\n\\n' +
        'Bob’s Hebrew Birthday begins at sundown on Thursday, May 1 and continues until ' +
        'sundown on the day of observance.\\n\\nMazel Tov!' +
        `\\n\\n${EDIT_URL}#row2`);
  });

  it('Anniversary', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID}), false);
    const ev = findByUid(events, `anniversary-5786-${ULID}-3`);
    expect(ev.getDesc()).toBe('Sam & Pat’s 16th Hebrew Anniversary');
    expect(ev.emoji).toBeUndefined();
    expect(ev.memo).toBe(
        'Hebcal joins you in honoring Sam & Pat, whose 16th Hebrew Anniversary occurs on Tuesday, June 23, ' +
        'corresponding to the 8th of Tamuz, 5786.\\n\\n' +
        'Sam & Pat’s Hebrew Anniversary begins at sundown on Monday, June 22 and continues until ' +
        'sundown on the day of observance.' +
        `\\n\\n${EDIT_URL}#row3`);
  });

  it('Other', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID}), false);
    const ev = findByUid(events, `other-5785-${ULID}-4`);
    expect(ev.getDesc()).toBe('My Event');
    expect(ev.memo).toBe(
        'My Event occurs on Friday, January 24, corresponding to the 24th of Tevet, 5785.\\n\\n' +
        'My Event begins at sundown on Thursday, January 23 and continues until ' +
        'sundown on the day of observance.' +
        `\\n\\n${EDIT_URL}#row4`);
  });

  it('Hebrew name keeps English memo', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID, hebdate: 'on'}), false);
    const ev = findByUid(events, `yahrzeit-5785-${ULID}-5`);
    expect(ev.getDesc()).toBe('יארצייט ה-9 של שרה בת אברהם (כ׳ חשון)');
    expect(ev.memo).toMatch(/^Hebcal joins you in remembering שרה בת אברהם, whose 9th Yahrzeit occurs on Thursday, November 21, corresponding to the 20th of Cheshvan, 5785\./);
    expect(ev.memo.endsWith(`\\n\\n${EDIT_URL}#row5`)).toBe(true);
  });

  it('omits edit URL without ulid', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}), false);
    expect(events.length).toBe(10);
    for (const ev of events) {
      expect(ev.memo).not.toContain('https://');
    }
    const bob = events.find((ev) => ev.type === 'Birthday');
    expect(bob.memo.endsWith('\\n\\nMazel Tov!')).toBe(true);
    expect(bob.uid).toMatch(/^birthday-5785-[0-9a-f]+-2$/);
  });

  it('omits edit URL when dl=1', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID, dl: '1'}), false);
    expect(events.length).toBe(10);
    for (const ev of events) {
      expect(ev.memo).not.toContain('https://');
      expect(ev.uid).toContain(ULID);
    }
  });

  it('reminders copy the Yahrzeit memo', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID}), true);
    const reminder = findByUid(events, `reminder-20250318-${ULID}-1`);
    const yahrzeit = findByUid(events, `yahrzeit-5785-${ULID}-1`);
    expect(reminder.getDesc()).toBe('Jane Doe Yahrzeit reminder');
    expect(reminder.memo).toBe(yahrzeit.memo);
    const heReminder = findByUid(events, `reminder-20241120-${ULID}-5`);
    expect(heReminder.getDesc()).toBe('שרה בת אברהם יארצייט תזכורת');
  });

  it('Yizkor events carry the edit memo', () => {
    const events = makeYahrzeitEvents(5, makeQuery({ulid: ULID, yizkor: 'on'}), false);
    const yizkor = events.filter((ev) => ev.uid.startsWith('yizkor-'));
    expect(yizkor.map((ev) => ev.getDesc())).toEqual([
      'Yizkor (Yom Kippur)', 'Yizkor (Shmini Atzeret)', 'Yizkor (Pesach VIII)', 'Yizkor (Shavuot II)',
      'Yizkor (Yom Kippur)', 'Yizkor (Shmini Atzeret)', 'Yizkor (Pesach VIII)', 'Yizkor (Shavuot II)',
    ]);
    for (const ev of yizkor) {
      expect(ev.memo).toBe(`To edit this Hebcal Yahrzeit + Anniversary Calendar, visit ${EDIT_URL}`);
    }
  });
});
