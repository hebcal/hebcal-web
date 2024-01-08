import dayjs from 'dayjs';
import fs from 'fs';

(async () => {
  const startD = dayjs(new Date(2023, 3, 23));
  const endD = dayjs(new Date(2023, 4, 2));
  const out = {};
  for (let d = startD; d.isBefore(endD); d = d.add(1, 'd')) {
    const key = d.format('YYYY-MM-DD');
    console.log(key);
    const url = `https://www.sefaria.org/api/calendars?year=${d.year()}&month=${d.month()+1}&day=${d.date()}`;
    const response = await fetch(url);
    const responseData = await response.json();
    const items = responseData.calendar_items;
    for (const item of items) {
      if (item.title?.en === 'Daily Rambam') {
        out[key] = item.ref;
      }
    }
  }
  fs.writeFileSync('rambam.json', JSON.stringify(out));
})();
