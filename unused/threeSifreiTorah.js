import {getHolidaysOnDate, HDate} from '@hebcal/core';

// Shabbat Shekalim on Rosh Chodesh
const shekalim = new Set();
// Shabbat HaChodesh on Rosh Chodesh
const haChodesh = new Set();
// Shabbat Rosh Chodesh Chanukah
const shRchChanukah = new Set();

const numYears = 3000;
const startYear = 4000;
const endYear = startYear + numYears;

const doubles = new Set();

for (let year = startYear; year < endYear; year++) {
    let count = 0;
    const thisYear = [];
    const adarMonthName = HDate.isLeapYear(year) ? 'Adar' : 'Adar II';
    const adar1 = new HDate(1, adarMonthName, year);
    if (adar1.getDay() === 6) {
        const adar1ev = getHolidaysOnDate(adar1);
        if (adar1ev.find((ev) => ev.getDesc() === 'Shabbat Shekalim')) {
            shekalim.add(adar1);
            count++;
            thisYear.push('shekalim');
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
