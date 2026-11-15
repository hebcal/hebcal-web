import {describe, it, expect} from 'vitest';
import {makeYahrzeitEvents} from '../src/yahrzeitEvents.js';


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
 * @param {string} name entry name, e.g. `Jane Doe`
 * @param {number} hyear Hebrew year of the observance
 * @return {import('@hebcal/core').Event}
 */
function find(events, name, hyear) {
  const ev = events.find((e) => e.name === name && e.getDate().getFullYear() === hyear);
  expect(ev, `${name} ${hyear}`).toBeDefined();
  return ev;
}

describe('makeYahrzeitEvents memos', () => {
  it('Yahrzeit with after-sunset date and edit URL', () => {
    const events = makeYahrzeitEvents(5, makeQuery({hebdate: 'on'}));
    const ev = find(events, 'Jane Doe', 5785);
    expect(ev.getDesc()).toBe('Jane Doe’s 5th Yahrzeit (19th of Adar)');
    expect(ev.emoji).toBe('🕯️');
    expect(ev.memo).toBe(
        'Hebcal joins you in remembering Jane Doe, whose 5th Yahrzeit occurs on Wednesday, March 19, ' +
        'corresponding to the 19th of Adar, 5785.\n\n' +
        'Jane Doe’s Yahrzeit begins at sundown on Tuesday, March 18 and continues until ' +
        'sundown on the day of observance. It is customary to light a memorial candle at dusk ' +
        'as the Yahrzeit begins.\n\n' +
        'May your loved one’s soul be bound up in the bond of eternal life and may their memory ' +
        'serve as a continued source of inspiration and comfort to you.');
  });

  it('Yahrzeit whose erev is Saturday lights at nightfall', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}));
    const ev = find(events, 'Jane Doe', 5786);
    expect(ev.memo).toContain('occurs on Sunday, March 8, corresponding to the 19th of Adar, 5786.');
    expect(ev.memo).toContain('begins at sundown on Saturday, March 7 ');
    expect(ev.memo).toContain('light a memorial candle at nightfall as the Yahrzeit begins');
  });

  it('Yahrzeit candle-lighting phrase follows the day of week of erev', () => {
    const query = makeQuery({years: '20'});
    const events = makeYahrzeitEvents(5, query);
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
    const events = makeYahrzeitEvents(5, makeQuery({}));
    const ev = find(events, 'Bob', 5785);
    expect(ev.getDesc()).toBe('Bob’s 44th Hebrew Birthday');
    expect(ev.emoji).toBe('🎂✡️');
    expect(ev.memo).toBe(
        'Hebcal joins you in honoring Bob, whose 44th Hebrew Birthday occurs on Friday, May 2, ' +
        'corresponding to the 4th of Iyyar, 5785.\n\n' +
        'Bob’s Hebrew Birthday begins at sundown on Thursday, May 1 and continues until ' +
        'sundown on the day of observance.\n\nMazel Tov!');
  });

  it('Anniversary', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}));
    const ev = find(events, 'Sam & Pat', 5786);
    expect(ev.getDesc()).toBe('Sam & Pat’s 16th Hebrew Anniversary');
    expect(ev.emoji).toBeUndefined();
    expect(ev.memo).toBe(
        'Hebcal joins you in honoring Sam & Pat, whose 16th Hebrew Anniversary occurs on Tuesday, June 23, ' +
        'corresponding to the 8th of Tamuz, 5786.\n\n' +
        'Sam & Pat’s Hebrew Anniversary begins at sundown on Monday, June 22 and continues until ' +
        'sundown on the day of observance.');
  });

  it('Other', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}));
    const ev = find(events, 'My Event', 5785);
    expect(ev.getDesc()).toBe('My Event');
    expect(ev.memo).toBe(
        'My Event occurs on Friday, January 24, corresponding to the 24th of Tevet, 5785.\n\n' +
        'My Event begins at sundown on Thursday, January 23 and continues until ' +
        'sundown on the day of observance.');
  });

  it('Hebrew name keeps English memo', () => {
    const events = makeYahrzeitEvents(5, makeQuery({hebdate: 'on'}));
    const ev = find(events, 'שרה בת אברהם', 5785);
    expect(ev.getDesc()).toBe('יארצייט ה-9 של שרה בת אברהם (כ׳ חשון)');
    expect(ev.memo).toMatch(/^Hebcal joins you in remembering שרה בת אברהם, whose 9th Yahrzeit occurs on Thursday, November 21, corresponding to the 20th of Cheshvan, 5785\./);
  });

  it('Birthday memo ends with Mazel Tov', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}));
    expect(events.length).toBe(10);
    const bob = events.find((ev) => ev.type === 'Birthday');
    expect(bob.memo.endsWith('\n\nMazel Tov!')).toBe(true);
  });

  it('adds Yizkor dates when yizkor=on', () => {
    const events = makeYahrzeitEvents(5, makeQuery({yizkor: 'on'}));
    const yizkor = events.filter((ev) => ev.getDesc().startsWith('Yizkor ('));
    expect(yizkor.map((ev) => ev.getDesc())).toEqual([
      'Yizkor (Yom Kippur)', 'Yizkor (Shmini Atzeret)', 'Yizkor (Pesach VIII)', 'Yizkor (Shavuot II)',
      'Yizkor (Yom Kippur)', 'Yizkor (Shmini Atzeret)', 'Yizkor (Pesach VIII)', 'Yizkor (Shavuot II)',
    ]);
    for (const ev of yizkor) {
      expect(ev.emoji).toBe('🕯️');
      expect(ev.memo).toBeUndefined();
    }
  });
});

describe('makeYahrzeitEvents anniversary numbers (an)', () => {
  it('includes numbers when an is missing (legacy calendars)', () => {
    const events = makeYahrzeitEvents(5, makeQuery({}));
    expect(find(events, 'Jane Doe', 5785).getDesc()).toBe('Jane Doe’s 5th Yahrzeit');
  });

  it('includes numbers when an=on', () => {
    const events = makeYahrzeitEvents(5, makeQuery({an: 'on'}));
    expect(find(events, 'Jane Doe', 5785).getDesc()).toBe('Jane Doe’s 5th Yahrzeit');
  });

  for (const an of ['off', '0', 0]) {
    it(`omits numbers from titles and memos when an=${JSON.stringify(an)}`, () => {
      const events = makeYahrzeitEvents(5, makeQuery({an, hebdate: 'on'}));
      const jane = find(events, 'Jane Doe', 5785);
      expect(jane.getDesc()).toBe('Jane Doe’s Yahrzeit (19th of Adar)');
      expect(jane.memo).toMatch(/^Hebcal joins you in remembering Jane Doe, whose Yahrzeit occurs on Wednesday, March 19,/);
      expect(jane.anniversary).toBe(5);
      const bob = find(events, 'Bob', 5785);
      expect(bob.getDesc()).toBe('Bob’s Hebrew Birthday (4th of Iyyar)');
      expect(bob.memo).toMatch(/^Hebcal joins you in honoring Bob, whose Hebrew Birthday occurs on/);
      const sam = find(events, 'Sam & Pat', 5786);
      expect(sam.getDesc()).toBe('Sam & Pat’s Hebrew Anniversary (8th of Tamuz)');
      expect(sam.memo).toMatch(/^Hebcal joins you in honoring Sam & Pat, whose Hebrew Anniversary occurs on/);
      const other = find(events, 'My Event', 5785);
      expect(other.getDesc()).toBe('My Event (24th of Tevet)');
      const sarah = find(events, 'שרה בת אברהם', 5785);
      expect(sarah.getDesc()).toBe('יארצייט של שרה בת אברהם (כ׳ חשון)');
    });
  }

  it('omits the number from Hebrew-name birthdays and anniversaries', () => {
    const query = {
      start: '5785', years: '1', an: 'off',
      n1: 'דוד', t1: 'Birthday', x1: '1981-05-08',
      n2: 'דוד ושרה', t2: 'Anniversary', x2: '2010-06-20',
    };
    const events = makeYahrzeitEvents(2, query);
    const titles = new Set(events.map((ev) => ev.getDesc()));
    expect(titles).toEqual(new Set(['יום הולדת לדוד', 'יום נישואין לדוד ושרה']));
  });
});
