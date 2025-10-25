import {getHolidaysOnDate, HDate, Sedra, ParshaEvent} from '@hebcal/core';

const writeUrls = false;

// Shabbat Shekalim on Rosh Chodesh
const shekalim = new Set();
// Shabbat HaChodesh on Rosh Chodesh
const haChodesh = new Set();
// Shabbat Rosh Chodesh Chanukah
const shRchChanukah = new Set();

const numYears = 1000;
const startYear = 5200;
const endYear = startYear + numYears;

const doubles = new Set();

for (let year = startYear; year < endYear; year++) {
    let count = 0;
    const thisYear = [];
    const isLeapYear = HDate.isLeapYear(year);
    const adarMonthName = isLeapYear ? 'Adar' : 'Adar II';
    const adar1 = new HDate(1, adarMonthName, year);
    if (adar1.getDay() === 6) {
        const adar1ev = getHolidaysOnDate(adar1);
        if (adar1ev.find((ev) => ev.getDesc() === 'Shabbat Shekalim')) {
            shekalim.add(adar1);
            count++;
            thisYear.push('shekalim');
            const sedra = new Sedra(year, false);
            const p = sedra.lookup(adar1);
            const pe = new ParshaEvent(p);
            if (writeUrls) {
                console.log(`${p.parsha[0]} ${year} ${adar1.greg().toISOString().substring(0, 10)} ${pe.url()}`);
            }
        }
    }

    const nisan1 = new HDate(1, 'Nisan', year);
    if (nisan1.getDay() === 6) {
        const nisan1ev = getHolidaysOnDate(nisan1);
        if (nisan1ev.find((ev) => ev.getDesc() === 'Shabbat HaChodesh')) {
            haChodesh.add(nisan1);
            count++;
            thisYear.push('haChodesh');
        }
    }

    const kislev30 = new HDate(30, 'Kislev', year);
    if (kislev30.getDay() === 6) {
        shRchChanukah.add(kislev30);
        count++;
        thisYear.push('shRchChanukah');
    }

    if (count > 1) {
        // console.log(year, thisYear);
        doubles.add(year);
    }
}

console.log(shekalim.size / numYears);
console.log(haChodesh.size / numYears);
console.log(shRchChanukah.size / numYears);

console.log(doubles.size / numYears);

const shekalimYears = new Set(shekalim.values().map((x) => x.getFullYear()));
const haChodeshYears = new Set(haChodesh.values().map((x) => x.getFullYear()));
const shRchChanukahYears = new Set(shRchChanukah.values().map((x) => x.getFullYear()));

const any = shekalimYears.union(haChodeshYears).union(shRchChanukahYears);
console.log(any.size / numYears);
