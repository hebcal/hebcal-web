/* eslint-disable max-len */
import {describe, it, expect} from 'vitest';
import {
  buildAllCalendars,
  buildChofetzChaimCalendar,
  buildRegularCalendar,
  getStartAndEnd,
  renderCalendar,
  staticCalendarConfig,
} from '../src/staticCalendars.js';
import {dailyLearningConfig} from '../src/urlArgs.js';

// `makeStaticCalendars.js` regenerates these multi-year feeds weekly from
// cron, so nothing exercises them on a normal request. Pinning a `today` and
// a `dtstamp` makes the output fully deterministic.
const TODAY = new Date(2026, 3, 15);
const DTSTAMP = '20260415T120000Z';

/**
 * @param {string} slug
 * @return {any}
 */
function regular(slug) {
  return buildRegularCalendar(
      staticCalendarConfig.find((cfg) => cfg.downloadSlug === slug), TODAY);
}

/**
 * Returns the VEVENT block whose SUMMARY matches
 * @param {string} ics
 * @param {string} summary
 * @return {string|undefined}
 */
function vevent(ics, summary) {
  return ics.split('BEGIN:VEVENT')
      .find((block) => block.includes(`SUMMARY:${summary}\r\n`))
      ?.split('END:VEVENT')[0];
}

/**
 * Undoes RFC 5545 line folding. Folding happens at 75 octets, which for
 * Hebrew lands mid-word and makes a literal expectation unreadable.
 * @param {string} ics
 * @return {string}
 */
function unfold(ics) {
  return ics.replaceAll('\r\n ', '');
}

/**
 * Returns the DESCRIPTION of the matching VEVENT, unfolded back into one
 * string.
 * @param {string} ics
 * @param {string} summary
 * @return {string|undefined}
 */
function description(ics, summary) {
  return /\r\nDESCRIPTION:([\s\S]*?)\r\n(?![ \t])/
      .exec(unfold(vevent(ics, summary) ?? ''))?.[1];
}

describe('getStartAndEnd', () => {
  it('spans 90 days back to `years` forward less 60 days', () => {
    const {start, end} = getStartAndEnd(TODAY, 5);
    expect(start.greg().toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(end.greg().toISOString().slice(0, 10)).toBe('2031-02-14');

    const tenYears = getStartAndEnd(TODAY, 10);
    expect(tenYears.start.greg().toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(tenYears.end.greg().toISOString().slice(0, 10)).toBe('2036-02-15');
  });
});

describe('Torah readings feed', () => {
  it('renders the calendar preamble', async () => {
    const {ics} = await renderCalendar(regular('torah-readings-diaspora'), DTSTAMP);
    expect(ics.split('\r\n').slice(0, 11)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      expect.stringMatching(/^PRODID:-\/\/hebcal\.com\/NONSGML Hebcal Calendar v1/),
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-LOTUS-CHARSET:UTF-8',
      'REFRESH-INTERVAL;VALUE=DURATION:P7D',
      'X-PUBLISHED-TTL:P7D',
      'X-WR-CALNAME:Torah Readings (Diaspora)',
      'X-WR-CALDESC:Parashat ha-Shavua - Weekly Torah Portion from Hebcal.com',
      'X-APPLE-CALENDAR-COLOR:#257E4A',
    ]);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('combines the parsha summary, Torah reading and URL in DESCRIPTION', async () => {
    const {ics} = await renderCalendar(regular('torah-readings-diaspora'), DTSTAMP);
    expect(vevent(ics, 'Parashat Emor')).toBe(
        '\r\n' +
        'DTSTAMP:20260415T120000Z\r\n' +
        'CATEGORIES:Parsha\r\n' +
        'SUMMARY:Parashat Emor\r\n' +
        'DTSTART;VALUE=DATE:20260502\r\n' +
        'DTEND;VALUE=DATE:20260503\r\n' +
        'UID:hebcal-20260502-4287acbc\r\n' +
        'TRANSP:TRANSPARENT\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'DESCRIPTION:Emor (“Say”) opens with laws regulating priestly behavior\\\r\n' +
        ' , working in the Tabernacle\\, and consuming sacrifices and priestly food. \r\n' +
        ' It describes the biblical holidays of Passover\\, Shavuot\\, Rosh Hashanah\\,\r\n' +
        '  Yom Kippur\\, and Sukkot\\, and ends with a story about a blasphemer and hi\r\n' +
        ' s punishment.\\n\\nTorah: Leviticus 21:1-24:23\\nHaftarah: Ezekiel 44:15-31\\n\r\n' +
        ' \\nhttps://hebcal.com/s/5786/31?uc=ical-torah-readings-diaspora\r\n');
  });

  // torah-readings-israel-he and torah-readings-israel cover the same dates
  // and differ only by `locale`, so they are the sharpest check that the
  // Hebrew prose reaches the published .ics and that English is unaffected.
  it('uses Hebrew prose in the Israel Hebrew feed', async () => {
    const {ics} = await renderCalendar(regular('torah-readings-israel-he'), DTSTAMP);
    expect(description(ics, 'פָּרָשַׁת בֹּא')).toBe(
        'בפרשת בא מסופר על שלוש המכות האחרונות שהאל מביא על מצרים. אחרי מכת ' +
        'הארבה נופל חושך כבד על מצרים במשך שלושה ימים. אלוהים מצווה את בני ישראל ' +
        'להקריב את קורבן הפסח\\, למרוח דם על מזוזות הבית\\, ולא לצאת מפתח הבית ' +
        'כדי להינצל ממוות. באותו לילה המשחית הורג את כל בכורות מצרים במכה ' +
        'האחרונה\\, מכת בכורות. פרעה והמצרים מגרשים את בני ישראל ממצרים.' +
        '\\n\\nTorah: Exodus 10:1-13:16\\nHaftarah: Jeremiah 46:13-28' +
        '\\n\\nhttps://hebcal.com/s/5786i/15?uc=ical-torah-readings-israel-he');
  });

  it('keeps English prose in the Israel English feed', async () => {
    const {ics} = await renderCalendar(regular('torah-readings-israel'), DTSTAMP);
    expect(description(ics, 'Parashat Bo')).toBe(
        'Bo (“Come”) recounts the last three plagues that God inflicts on the ' +
        'Egyptians: locusts\\, darkness\\, and death of firstborns. God commands ' +
        'the Israelites to offer a Passover lamb sacrifice. After the last ' +
        'plague\\, Pharaoh and the Egyptians demand that the Israelites leave.' +
        '\\n\\nTorah: Exodus 10:1-13:16\\nHaftarah: Jeremiah 46:13-28' +
        '\\n\\nhttps://hebcal.com/s/5786i/15?uc=ical-torah-readings-israel');
  });

  // makeStaticCalendars.js renders every feed in one process, and
  // renderCalendar() writes ev.memo for the .csv. Israel and Israel Hebrew
  // must not pick up each other's prose.
  it('renders the two Israel feeds independently of each other', async () => {
    const hebrew = regular('torah-readings-israel-he');
    const english = regular('torah-readings-israel');
    expect(hebrew.events[0]).not.toBe(english.events[0]);
    await renderCalendar(hebrew, DTSTAMP);
    const {ics} = await renderCalendar(english, DTSTAMP);
    expect(description(ics, 'Parashat Bo')).toMatch(/^Bo \(“Come”\) recounts/);
    expect(description(ics, 'Parashat Tzav')).toMatch(/^In Tzav \(“Command”\)/);
  });

  it('swaps the parsha memo for the special Shabbat name in the CSV', async () => {
    const {csv} = await renderCalendar(regular('torah-readings-diaspora'), DTSTAMP);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('"Subject","Start Date","Start Time","End Date","End Time",' +
      '"All day event","Description","Show time as","Location"');
    // the .ics description (parsha summary) must not leak into the .csv
    expect(csv).not.toContain('Emor (“Say”) opens');
    expect(rows).toContain('"Parashat Emor","5/2/2026",,,,"true","","3","Torah Reading"');
    expect(rows).toContain('"Parashat Tzav","3/28/2026",,,,"true","Shabbat HaGadol","3","Torah Reading"');
    expect(rows).toContain('"Parashat Bamidbar","5/16/2026",,,,"true","Machar Chodesh","3","Torah Reading"');
    expect(rows).toContain('"Parashat Tazria-Metzora","4/18/2026",,,,"true","Rosh Chodesh Iyyar","3","Torah Reading"');
  });
});

describe('Jewish holidays feed', () => {
  it('combines the holiday description, Torah reading and URL', async () => {
    const {ics} = await renderCalendar(regular('jewish-holidays'), DTSTAMP);
    expect(vevent(ics, 'Shavuot I')).toBe(
        '\r\n' +
        'DTSTAMP:20260415T120000Z\r\n' +
        'CATEGORIES:Holiday\r\n' +
        'SUMMARY:Shavuot I\r\n' +
        'DTSTART;VALUE=DATE:20260522\r\n' +
        'DTEND;VALUE=DATE:20260523\r\n' +
        'UID:hebcal-20260522-547670dd\r\n' +
        'TRANSP:OPAQUE\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:OOF\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'DESCRIPTION:Festival of Weeks. Commemorates the giving of the Torah at Mou\r\n' +
        ' nt Sinai\\n\\nTorah: Exodus 19:1-20:23\\; Numbers 28:26-31\\nHaftarah: Ezekiel\r\n' +
        '  1:1-28\\, 3:12\\n\\nhttps://hebcal.com/h/shavuot-2026?uc=ical-jewish-holiday\r\n' +
        ' s\r\n');
  });
});

describe('Omer feed', () => {
  it('renders the count in English, Hebrew and transliteration, with an alarm', async () => {
    const {ics} = await renderCalendar(regular('omer'), DTSTAMP);
    expect(vevent(ics, '33rd day of the Omer')).toBe(
        '\r\n' +
        'DTSTAMP:20260415T120000Z\r\n' +
        'SUMMARY:33rd day of the Omer\r\n' +
        'DTSTART;VALUE=DATE:20260505\r\n' +
        'DTEND;VALUE=DATE:20260506\r\n' +
        'UID:hebcal-20260505-d6c08345\r\n' +
        'TRANSP:TRANSPARENT\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'DESCRIPTION:Today is 33 days\\, which are 4 weeks and 5 days of the Omer\\n\\\r\n' +
        ' nהַיּוֹם שְׁלוֹשָׁה וּשְׁלוֹשִׁים יוֹם\\,\r\n' +
        '  שֶׁהֵם אַרְבָּעָה שָׁבוּעוֹת וַחֲמִ\r\n' +
        ' שָּׁה יָמִים לָעֽוֹמֶר\\n\\nSplendor within Splendor\\nה\r\n' +
        ' וֹד שֶׁבְּהוֹד\\nHod sheb\'Hod\r\n' +
        'BEGIN:VALARM\r\n' +
        'ACTION:DISPLAY\r\n' +
        'DESCRIPTION:Event reminder\r\n' +
        'TRIGGER:-P0DT3H30M0S\r\n' +
        'END:VALARM\r\n');
  });
});

describe('Hebrew date feed', () => {
  it('has no DESCRIPTION', async () => {
    const {ics} = await renderCalendar(regular('hdate-en'), DTSTAMP);
    expect('BEGIN:VEVENT' + ics.split('BEGIN:VEVENT')[1].split('END:VEVENT')[0] + 'END:VEVENT').toBe(
        'BEGIN:VEVENT\r\n' +
        'DTSTAMP:20260415T120000Z\r\n' +
        'SUMMARY:26th of Tevet\r\n' +
        'DTSTART;VALUE=DATE:20260115\r\n' +
        'DTEND;VALUE=DATE:20260116\r\n' +
        'UID:hebcal-20260115-78b8ac9b\r\n' +
        'TRANSP:TRANSPARENT\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'END:VEVENT');
  });

  it('writes a UTF-8 BOM for non-English CSV', async () => {
    const {csv} = await renderCalendar(regular('hdate-he'), DTSTAMP);
    expect(csv.startsWith('\uFEFF"Subject"')).toBe(true);
    const en = await renderCalendar(regular('hdate-en'), DTSTAMP);
    expect(en.csv.startsWith('"Subject"')).toBe(true);
  });
});

describe('Chofetz Chaim feed', () => {
  it('carries its own two-part memo and stable UID', async () => {
    const cfg = dailyLearningConfig.find((c) => c.downloadSlug === 'chofetz-chaim');
    const {ics} = await renderCalendar(buildChofetzChaimCalendar(cfg, TODAY), DTSTAMP);
    expect('BEGIN:VEVENT' + ics.split('BEGIN:VEVENT')[1].split('END:VEVENT')[0] + 'END:VEVENT').toBe(
        'BEGIN:VEVENT\r\n' +
        'DTSTAMP:20260415T120000Z\r\n' +
        'CATEGORIES:Chofetz Chaim\r\n' +
        'SUMMARY:Tziyurim 4-5 / Book I\\, Shar Hatvuna 11.3-11.4\r\n' +
        'DTSTART;VALUE=DATE:20260115\r\n' +
        'DTEND;VALUE=DATE:20260116\r\n' +
        'UID:hebcal-20260115-chofetz-chaim\r\n' +
        'TRANSP:TRANSPARENT\r\n' +
        'X-MICROSOFT-CDO-BUSYSTATUS:FREE\r\n' +
        'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n' +
        'CLASS:PUBLIC\r\n' +
        'DESCRIPTION:Sefer Chofetz Chaim\\, 26 Tevet\\nIllustrations 4-5\\nhttps://www\r\n' +
        ' .sefaria.org/Chofetz_Chaim%2C_Illustrations%2C_Illustration_4?lang=bi&utm_\r\n' +
        ' source=hebcal.com&utm_medium=icalendar&utm_campaign=ical-chofetz-chaim\\n\\n\r\n' +
        ' Shemirat HaLashon\\, 26 Tevet\\nBook I\\, The Gate of Discerning 11.3-11.4\\nh\r\n' +
        ' ttps://www.sefaria.org/Shemirat_HaLashon%2C_Book_I%2C_The_Gate_of_Discerni\r\n' +
        ' ng.11.3?lang=bi&utm_source=hebcal.com&utm_medium=icalendar&utm_campaign=ic\r\n' +
        ' al-chofetz-chaim\\n\\n\r\n' +
        'LOCATION:Chofetz Chaim\r\n' +
        'END:VEVENT');
  });
});

describe('every published feed', () => {
  it('builds the expected list of slugs', () => {
    const slugs = [...buildAllCalendars(TODAY)].map((cal) => cal.file);
    expect(slugs).toEqual([
      'jewish-holidays-v2', 'jewish-holidays-all-v2', 'jewish-holidays',
      'jewish-holidays-all', 'hdate-en', 'hdate-he', 'hdate-he-v2', 'omer',
      'torah-readings-diaspora', 'torah-readings-israel',
      'torah-readings-israel-he', 'yom-kippur-katan', 'rosh-chodesh',
      'mevarchim', 'yizkor-diaspora', 'yizkor-il', 'daf-yomi', 'mishna-yomi',
      'perek-yomi', 'nach-yomi', 'tanakh-yomi', 'psalms', '929', 'rambam1',
      'rambam3', 'sefer-hamitzvot', 'yerushalmi-vilna',
      'yerushalmi-schottenstein', 'chofetz-chaim', 'dirshu-amud-hayomi',
      'daf-weekly', 'pirkei-avot', 'ahs-yomi', 'ksa-yomi',
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // A feed built in a Hebrew locale carries Hebrew event titles, so the
  // calendar name a subscriber sees in their app should be Hebrew too.
  it('names every Hebrew-locale feed in Hebrew', async () => {
    const hebrew = /[֐-׿]/;
    const seen = [];
    for (const cfg of staticCalendarConfig) {
      if (!/^he/i.test(cfg.locale ?? '')) {
        continue;
      }
      seen.push(cfg.downloadSlug);
      expect(cfg.title, cfg.downloadSlug).toMatch(hebrew);
      expect(cfg.caldesc, cfg.downloadSlug).toMatch(hebrew);
    }
    expect(seen).toEqual([
      'hdate-he', 'hdate-he-v2', 'torah-readings-israel-he', 'yizkor-il',
    ]);
  });

  // Commas are escaped as `\,` in the .ics per RFC 5545.
  it('carries the Hebrew name through to X-WR-CALNAME', async () => {
    const expected = {
      'hdate-he': ['תאריך עברי (עם ניקוד)',
        'מציג את התאריך העברי בכל יום מימות השבוע\\, עם ניקוד'],
      'hdate-he-v2': ['תאריך עברי',
        'מציג את התאריך העברי בכל יום מימות השבוע\\, ללא ניקוד'],
      'torah-readings-israel-he': ['פרשת השבוע בישראל',
        'פרשת השבוע - קריאת התורה השבועית מאתר Hebcal.com'],
      'yizkor-il': ['יזכור (ישראל)',
        'תפילת אזכרה אשכנזית לזכר הנפטרים\\, הנאמרת בבית הכנסת בארבעה מועדים בשנה'],
    };
    for (const [slug, [name, desc]] of Object.entries(expected)) {
      const {ics} = await renderCalendar(regular(slug), DTSTAMP);
      expect(unfold(ics), slug).toContain(`X-WR-CALNAME:${name}\r\n`);
      expect(unfold(ics), slug).toContain(`X-WR-CALDESC:${desc}\r\n`);
    }
  });

  // The English siblings must not drift along with them.
  it('leaves the English feeds named in English', async () => {
    for (const [slug, name] of Object.entries({
      'torah-readings-israel': 'Torah Readings (Israel English)',
      'torah-readings-diaspora': 'Torah Readings (Diaspora)',
      'hdate-en': 'Hebrew calendar dates (en)',
      'yizkor-diaspora': 'Yizkor (Diaspora)',
    })) {
      const {ics} = await renderCalendar(regular(slug), DTSTAMP);
      expect(unfold(ics), slug).toContain(`X-WR-CALNAME:${name}\r\n`);
    }
  });

  it('renders a well-formed .ics and .csv', async () => {
    for (const calendar of buildAllCalendars(TODAY)) {
      const {file, events} = calendar;
      expect(events.length, file).toBeGreaterThan(30);
      const {ics, csv} = await renderCalendar(calendar, DTSTAMP);
      const numEvents = ics.split('BEGIN:VEVENT').length - 1;
      expect(numEvents, file).toBe(events.length);
      expect(ics.startsWith('BEGIN:VCALENDAR\r\n'), file).toBe(true);
      expect(ics.endsWith('END:VCALENDAR\r\n'), file).toBe(true);
      expect(ics, file).toContain('X-WR-CALNAME:');
      expect(ics.split('END:VEVENT').length - 1, file).toBe(numEvents);
      // every line must be folded to 75 octets or less
      const tooLong = ics.split('\r\n').find(
          (line) => Buffer.byteLength(line, 'utf-8') > 75);
      expect(tooLong, file).toBe(undefined);
      expect(csv, file).toContain('"Subject","Start Date"');
      expect(csv.split('\r\n').filter((l) => l.length).length - 1, file)
          .toBe(events.length);
    }
  }, 120000);
});
