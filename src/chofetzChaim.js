import {months, HDate} from '@hebcal/core';

const Nisan = months.NISAN;
const Iyyar = months.IYYAR;
const Sivan = months.SIVAN;
const Tamuz = months.TAMUZ;
const Av = months.AV;
const Elul = months.ELUL;
const Tishrei = months.TISHREI;
const Cheshvan = months.CHESHVAN;
const Kislev = months.KISLEV;
const Teves = months.TEVET;
const Shvat = months.SHVAT;
const Adar = months.ADAR_I;
const Adar1 = months.ADAR_I;
const Adar2 = months.ADAR_II;

const intro = 'Introduction to the Laws of the Prohibition of Lashon Hara and Rechilut';
const Hakdamah = 'Preface';
const Psichah = `${intro}, Opening Comments`;
const Lavin = `${intro}, Negative Commandments`;
const Asin = `${intro}, Positive Commandments`;
const Arurin = `${intro}, Curses`;
const HilchosLH = 'Part One, The Prohibition Against Lashon Hara';
const HilchosRechilus = 'Part Two, The Prohibition Against Rechilut';
const Tziyurim = 'Illustrations';

const simple = [
  [[1, Tishrei, 1, Shvat, 1, Sivan], Hakdamah, 1, 4],
  [[2, Tishrei, 2, Shvat, 2, Sivan], Hakdamah, 5, 10],
  [[3, Tishrei, 3, Shvat, 3, Sivan], Hakdamah, 11, 16],
  [[4, Tishrei, 4, Shvat, 4, Sivan], Hakdamah, 17, 22],
  [[5, Tishrei, 5, Shvat, 5, Sivan], Hakdamah, 23, 27],
  [[6, Tishrei, 6, Shvat, 6, Sivan], Hakdamah, 28, 34],
  [[7, Tishrei, 6, Shvat, 6, Sivan], Hakdamah, 0, 0],
  [[8, Tishrei, 7, Shvat, 7, Sivan], Psichah, 1, 4],
  [[9, Tishrei, 8, Shvat, 8, Sivan], Psichah, 5, 11],
  [[10, Tishrei, 9, Shvat, 9, Sivan], Lavin, 1, 2],
  [[11, Tishrei, 10, Shvat, 10, Sivan], Lavin, 3, 4],
  [[12, Tishrei, 11, Shvat, 11, Sivan], Lavin, 5, 6],
  [[13, Tishrei, 12, Shvat, 12, Sivan], Lavin, 7, 9],
  [[14, Tishrei, 13, Shvat, 13, Sivan], Lavin, 10, 11],
  [[15, Tishrei, 14, Shvat, 14, Sivan], Lavin, 12, 13],
  [[16, Tishrei, 15, Shvat, 15, Sivan], Lavin, 14, 15],
  [[17, Tishrei, 16, Shvat, 16, Sivan], Lavin, 16, 17],
  [[18, Tishrei, 17, Shvat, 17, Sivan], Asin, 1, 2],
  [[19, Tishrei, 18, Shvat, 18, Sivan], Asin, 3, 4],
  [[20, Tishrei, 19, Shvat, 19, Sivan], Asin, 5, 6],
  [[21, Tishrei, 20, Shvat, 20, Sivan], Asin, 7, 8],
  [[22, Tishrei, 21, Shvat, 21, Sivan], Asin, 9, 10],
  [[23, Tishrei, 22, Shvat, 22, Sivan], Asin, 11, 12],
  [[24, Tishrei, 23, Shvat, 23, Sivan], Asin, 13, 14],
  [[25, Tishrei, 24, Shvat, 24, Sivan], Arurin],
  [[26, Tishrei, 25, Shvat, 25, Sivan], HilchosLH, 1.1, 1.2],
  [[27, Tishrei, 26, Shvat, 26, Sivan], HilchosLH, 1.3, 1.4],
  [[28, Tishrei, 27, Shvat, 27, Sivan], HilchosLH, 1.5, 1.6],
  [[29, Tishrei, 28, Shvat, 28, Sivan], HilchosLH, 1.7, 1.9],
  [[30, Tishrei, 29, Shvat, 29, Sivan], HilchosLH, 2.1, 2.2],
  [[1, Cheshvan, 30, Shvat, 30, Sivan], HilchosLH, 2.3, 2.4],
  [[2, Cheshvan, 1, Adar, 1, Tamuz], HilchosLH, 2.5, 2.6],
  [[3, Cheshvan, 2, Adar, 2, Tamuz], HilchosLH, 2.7, 2.8],
  [[4, Cheshvan, 3, Adar, 3, Tamuz], HilchosLH, 2.9, 2.10],
  [[5, Cheshvan, 4, Adar, 4, Tamuz], HilchosLH, 2.11, 2.11],
  [[6, Cheshvan, 5, Adar, 5, Tamuz], HilchosLH, 2.12, 2.13],
  [[7, Cheshvan, 6, Adar, 6, Tamuz], HilchosLH, 3.1, 3.2],
  [[8, Cheshvan, 7, Adar, 7, Tamuz], HilchosLH, 3.3, 3.4],
  [[9, Cheshvan, 8, Adar, 8, Tamuz], HilchosLH, 3.5, 3.6],
  [[10, Cheshvan, 9, Adar, 9, Tamuz], HilchosLH, 3.7, 3.8],
  [[11, Cheshvan, 10, Adar, 10, Tamuz], HilchosLH, 4.1, 4.2],
  [[12, Cheshvan, 11, Adar, 11, Tamuz], HilchosLH, 4.3, 4.4],
  [[13, Cheshvan, 12, Adar, 12, Tamuz], HilchosLH, 4.5, 4.6],
  [[14, Cheshvan, 13, Adar, 13, Tamuz], HilchosLH, 4.7, 4.8],
  [[15, Cheshvan, 14, Adar, 14, Tamuz], HilchosLH, 4.9, 4.10],
  [[16, Cheshvan, 15, Adar, 15, Tamuz], HilchosLH, 4.11, 4.11],
  [[17, Cheshvan, 16, Adar, 16, Tamuz], HilchosLH, 4.12, 5.1],
  [[18, Cheshvan, 17, Adar, 17, Tamuz], HilchosLH, 5.2, 5.4],
  [[19, Cheshvan, 18, Adar, 18, Tamuz], HilchosLH, 5.5, 5.6],
  [[20, Cheshvan, 19, Adar, 19, Tamuz], HilchosLH, 5.7, 5.8],
  [[21, Cheshvan, 20, Adar, 20, Tamuz], HilchosLH, 6.1, 6.2],
  [[22, Cheshvan, 21, Adar, 21, Tamuz], HilchosLH, 6.3, 6.4],
  [[23, Cheshvan, 22, Adar, 22, Tamuz], HilchosLH, 6.5, 6.6],
  [[24, Cheshvan, 23, Adar, 23, Tamuz], HilchosLH, 6.7, 6.8],
  [[25, Cheshvan, 24, Adar, 24, Tamuz], HilchosLH, 6.9, 6.10],
  [[26, Cheshvan, 25, Adar, 25, Tamuz], HilchosLH, 6.11, 6.12],
  [[27, Cheshvan, 26, Adar, 26, Tamuz], HilchosLH, 7.1, 7.2],
  [[28, Cheshvan, 27, Adar, 27, Tamuz], HilchosLH, 7.3, 7.4],
  [[29, Cheshvan, 28, Adar, 28, Tamuz], HilchosLH, 7.5, 7.6],
  [[30, Cheshvan, 29, Adar, 29, Tamuz], HilchosLH, 7.7, 7.8],
  [[1, Kislev, 1, Nisan, 1, Av], HilchosLH, 7.9, 7.9],
  [[2, Kislev, 2, Nisan, 2, Av], HilchosLH, 7.10, 7.12],
  [[3, Kislev, 3, Nisan, 3, Av], HilchosLH, 7.13, 7.14],
  [[4, Kislev, 4, Nisan, 4, Av], HilchosLH, 8.1, 8.2],
  [[5, Kislev, 5, Nisan, 5, Av], HilchosLH, 8.3, 8.4],
  [[6, Kislev, 6, Nisan, 6, Av], HilchosLH, 8.5, 8.7],
  [[7, Kislev, 7, Nisan, 7, Av], HilchosLH, 8.8, 8.9],
  [[8, Kislev, 8, Nisan, 8, Av], HilchosLH, 8.10, 8.11],
  [[9, Kislev, 9, Nisan, 9, Av], HilchosLH, 8.12, 8.12],
  [[10, Kislev, 10, Nisan, 10, Av], HilchosLH, 8.13, 8.14],
  [[11, Kislev, 11, Nisan, 11, Av], HilchosLH, 9.1, 9.2],
  [[12, Kislev, 12, Nisan, 12, Av], HilchosLH, 9.3, 9.4],
  [[13, Kislev, 13, Nisan, 13, Av], HilchosLH, 9.5, 9.6],
  [[14, Kislev, 14, Nisan, 14, Av], HilchosLH, 10.1, 10.2],
  [[15, Kislev, 15, Nisan, 15, Av], HilchosLH, 10.3, 10.4],
  [[16, Kislev, 16, Nisan, 16, Av], HilchosLH, 10.5, 10.6],
  [[17, Kislev, 17, Nisan, 17, Av], HilchosLH, 10.7, 10.8],
  [[18, Kislev, 18, Nisan, 18, Av], HilchosLH, 10.9, 10.10],
  [[19, Kislev, 19, Nisan, 19, Av], HilchosLH, 10.11, 10.12],
  [[20, Kislev, 20, Nisan, 20, Av], HilchosLH, 10.13, 10.14],
  [[21, Kislev, 21, Nisan, 21, Av], HilchosLH, 10.15, 10.16],
  [[22, Kislev, 22, Nisan, 22, Av], HilchosLH, 10.17, 10.17],
  [[23, Kislev, 23, Nisan, 23, Av], HilchosRechilus, 1.1, 1.3],
  [[24, Kislev, 24, Nisan, 24, Av], HilchosRechilus, 1.4, 1.5],
  [[25, Kislev, 25, Nisan, 25, Av], HilchosRechilus, 1.6, 1.7],
  [[26, Kislev, 26, Nisan, 26, Av], HilchosRechilus, 1.8, 1.9],
  [[27, Kislev, 27, Nisan, 27, Av], HilchosRechilus, 1.10, 1.11],
  [[28, Kislev, 28, Nisan, 28, Av], HilchosRechilus, 2.1, 2.2],
  [[29, Kislev, 29, Nisan, 29, Av], HilchosRechilus, 2.3, 2.4],
  [[30, Kislev, 30, Nisan, 30, Av], HilchosRechilus, 3.1, 3.1],
  [[1, Teves, 1, Iyyar, 1, Elul], HilchosRechilus, 3.2, 3.4],
  [[2, Teves, 2, Iyyar, 2, Elul], HilchosRechilus, 4.1, 4.3],
  [[3, Teves, 3, Iyyar, 3, Elul], HilchosRechilus, 5.1, 5.2],
  [[4, Teves, 4, Iyyar, 4, Elul], HilchosRechilus, 5.3, 5.4],
  [[5, Teves, 5, Iyyar, 5, Elul], HilchosRechilus, 5.5, 5.5],
  [[6, Teves, 6, Iyyar, 6, Elul], HilchosRechilus, 5.6, 5.7],
  [[7, Teves, 7, Iyyar, 7, Elul], HilchosRechilus, 6.1, 6.2],
  [[8, Teves, 8, Iyyar, 8, Elul], HilchosRechilus, 6.3, 6.4],
  [[9, Teves, 9, Iyyar, 9, Elul], HilchosRechilus, 6.5, 6.7],
  [[10, Teves, 10, Iyyar, 10, Elul], HilchosRechilus, 6.8, 6.10],
  [[11, Teves, 11, Iyyar, 11, Elul], HilchosRechilus, 7.1, 7.1],
  [[12, Teves, 12, Iyyar, 12, Elul], HilchosRechilus, 7.2, 7.2],
  [[13, Teves, 13, Iyyar, 13, Elul], HilchosRechilus, 7.3, 7.4],
  [[14, Teves, 14, Iyyar, 14, Elul], HilchosRechilus, 7.5, 7.5],
  [[15, Teves, 15, Iyyar, 15, Elul], HilchosRechilus, 8.1, 8.3],
  [[16, Teves, 16, Iyyar, 16, Elul], HilchosRechilus, 8.4, 8.5],
  [[17, Teves, 17, Iyyar, 17, Elul], HilchosRechilus, 9.1, 9.2],
  [[18, Teves, 18, Iyyar, 18, Elul], HilchosRechilus, 9.3, 9.4],
  [[19, Teves, 19, Iyyar, 19, Elul], HilchosRechilus, 9.5, 9.6],
  [[20, Teves, 20, Iyyar, 20, Elul], HilchosRechilus, 9.7, 9.9],
  [[21, Teves, 21, Iyyar, 21, Elul], HilchosRechilus, 9.10, 9.10],
  [[22, Teves, 22, Iyyar, 22, Elul], HilchosRechilus, 9.11, 9.12],
  [[23, Teves, 23, Iyyar, 23, Elul], HilchosRechilus, 9.13, 9.13],
  [[24, Teves, 24, Iyyar, 24, Elul], HilchosRechilus, 9.14, 9.15],
  [[25, Teves, 25, Iyyar, 25, Elul], Tziyurim, 1, 3],
  [[26, Teves, 26, Iyyar, 26, Elul], Tziyurim, 4, 5],
  [[27, Teves, 27, Iyyar, 27, Elul], Tziyurim, 6, 7],
  [[28, Teves, 28, Iyyar, 28, Elul], Tziyurim, 8, 9],
  [[29, Teves, 29, Iyyar, 29, Elul], Tziyurim, 10, 11],
];

const leap = [
  [[1, Tishrei, 11, Shvat, 20, Iyyar], Hakdamah, 1, 4],
  [[2, Tishrei, 12, Shvat, 21, Iyyar], Hakdamah, 5, 10],
  [[3, Tishrei, 13, Shvat, 22, Iyyar], Hakdamah, 11, 16],
  [[4, Tishrei, 14, Shvat, 23, Iyyar], Hakdamah, 17, 22],
  [[5, Tishrei, 15, Shvat, 24, Iyyar], Hakdamah, 23, 27],
  [[6, Tishrei, 16, Shvat, 25, Iyyar], Hakdamah, 28, 34],
  [[7, Tishrei, 16, Shvat, 25, Iyyar], Hakdamah, 0, 0],
  [[8, Tishrei, 17, Shvat, 26, Iyyar], Psichah, 1, 4],
  [[9, Tishrei, 18, Shvat, 27, Iyyar], Psichah, 5, 11],
  [[10, Tishrei, 19, Shvat, 28, Iyyar], Lavin, 1, 2],
  [[11, Tishrei, 20, Shvat, 29, Iyyar], Lavin, 3, 4],
  [[12, Tishrei, 21, Shvat, 1, Sivan], Lavin, 5, 6],
  [[13, Tishrei, 22, Shvat, 2, Sivan], Lavin, 7, 9],
  [[14, Tishrei, 23, Shvat, 3, Sivan], Lavin, 10, 11],
  [[15, Tishrei, 24, Shvat, 4, Sivan], Lavin, 12, 13],
  [[16, Tishrei, 25, Shvat, 5, Sivan], Lavin, 14, 15],
  [[17, Tishrei, 26, Shvat, 6, Sivan], Lavin, 16, 17],
  [[18, Tishrei, 27, Shvat, 7, Sivan], Asin, 1, 2],
  [[19, Tishrei, 28, Shvat, 8, Sivan], Asin, 3, 4],
  [[20, Tishrei, 29, Shvat, 9, Sivan], Asin, 5, 6],
  [[21, Tishrei, 30, Shvat, 10, Sivan], Asin, 7, 8],
  [[22, Tishrei, 1, Adar1, 11, Sivan], Asin, 9, 10],
  [[23, Tishrei, 2, Adar1, 12, Sivan], Asin, 11, 12],
  [[24, Tishrei, 3, Adar1, 13, Sivan], Asin, 13, 14],
  [[25, Tishrei, 4, Adar1, 14, Sivan], Arurin],
  [[26, Tishrei, 5, Adar1, 15, Sivan], HilchosLH, 1.1, 1.2],
  [[27, Tishrei, 6, Adar1, 16, Sivan], HilchosLH, 1.3, 1.4],
  [[28, Tishrei, 7, Adar1, 17, Sivan], HilchosLH, 1.5, 1.6],
  [[29, Tishrei, 8, Adar1, 18, Sivan], HilchosLH, 1.7, 1.9],
  [[30, Tishrei, 9, Adar1, 19, Sivan], HilchosLH, 2.1, 2.2],
  [[1, Cheshvan, 10, Adar1, 20, Sivan], HilchosLH, 2.3, 2.4],
  [[2, Cheshvan, 11, Adar1, 21, Sivan], HilchosLH, 2.5, 2.6],
  [[3, Cheshvan, 12, Adar1, 22, Sivan], HilchosLH, 2.7, 2.8],
  [[4, Cheshvan, 13, Adar1, 23, Sivan], HilchosLH, 2.9, 2.10],
  [[5, Cheshvan, 14, Adar1, 24, Sivan], HilchosLH, 2.11, 2.11],
  [[6, Cheshvan, 15, Adar1, 25, Sivan], HilchosLH, 2.12, 2.13],
  [[7, Cheshvan, 16, Adar1, 26, Sivan], HilchosLH, 3.1, 3.2],
  [[8, Cheshvan, 17, Adar1, 27, Sivan], HilchosLH, 3.3, 3.4],
  [[9, Cheshvan, 18, Adar1, 28, Sivan], HilchosLH, 3.5, 3.6],
  [[10, Cheshvan, 19, Adar1, 29, Sivan], HilchosLH, 3.7, 3.8],
  [[11, Cheshvan, 20, Adar1, 30, Sivan], HilchosLH, 4.1, 4.2],
  [[12, Cheshvan, 21, Adar1, 1, Tamuz], HilchosLH, 4.3, 4.4],
  [[13, Cheshvan, 22, Adar1, 2, Tamuz], HilchosLH, 4.5, 4.6],
  [[14, Cheshvan, 23, Adar1, 3, Tamuz], HilchosLH, 4.7, 4.8],
  [[15, Cheshvan, 24, Adar1, 4, Tamuz], HilchosLH, 4.9, 4.10],
  [[16, Cheshvan, 25, Adar1, 5, Tamuz], HilchosLH, 4.11, 4.11],
  [[17, Cheshvan, 26, Adar1, 6, Tamuz], HilchosLH, 4.12, 4.12],
  [[18, Cheshvan, 27, Adar1, 7, Tamuz], HilchosLH, 5.1, 5.1],
  [[19, Cheshvan, 28, Adar1, 8, Tamuz], HilchosLH, 5.2, 5.2],
  [[20, Cheshvan, 29, Adar1, 9, Tamuz], HilchosLH, 5.3, 5.4],
  [[21, Cheshvan, 30, Adar1, 10, Tamuz], HilchosLH, 5.5, 5.6],
  [[22, Cheshvan, 1, Adar2, 11, Tamuz], HilchosLH, 5.7, 5.8],
  [[23, Cheshvan, 2, Adar2, 12, Tamuz], HilchosLH, 6.1, 6.2],
  [[24, Cheshvan, 3, Adar2, 13, Tamuz], HilchosLH, 6.3, 6.4],
  [[25, Cheshvan, 4, Adar2, 14, Tamuz], HilchosLH, 6.5, 6.6],
  [[26, Cheshvan, 5, Adar2, 15, Tamuz], HilchosLH, 6.7, 6.8],
  [[27, Cheshvan, 6, Adar2, 16, Tamuz], HilchosLH, 6.9, 6.10],
  [[28, Cheshvan, 7, Adar2, 17, Tamuz], HilchosLH, 6.11, 6.12],
  [[29, Cheshvan, 8, Adar2, 18, Tamuz], HilchosLH, 7.1, 7.2],
  [[30, Cheshvan, 9, Adar2, 19, Tamuz], HilchosLH, 7.3, 7.4],
  [[1, Kislev, 10, Adar2, 20, Tamuz], HilchosLH, 7.5, 7.6],
  [[2, Kislev, 11, Adar2, 21, Tamuz], HilchosLH, 7.7, 7.8],
  [[3, Kislev, 12, Adar2, 22, Tamuz], HilchosLH, 7.9, 7.9],
  [[4, Kislev, 13, Adar2, 23, Tamuz], HilchosLH, 7.10, 7.10],
  [[5, Kislev, 14, Adar2, 24, Tamuz], HilchosLH, 7.11, 7.12],
  [[6, Kislev, 15, Adar2, 25, Tamuz], HilchosLH, 7.13, 7.14],
  [[7, Kislev, 16, Adar2, 26, Tamuz], HilchosLH, 8.1, 8.2],
  [[8, Kislev, 17, Adar2, 27, Tamuz], HilchosLH, 8.3, 8.4],
  [[9, Kislev, 18, Adar2, 28, Tamuz], HilchosLH, 8.5, 8.5],
  [[10, Kislev, 19, Adar2, 29, Tamuz], HilchosLH, 8.6, 8.7],
  [[11, Kislev, 20, Adar2, 1, Av], HilchosLH, 8.8, 8.9],
  [[12, Kislev, 21, Adar2, 2, Av], HilchosLH, 8.10, 8.11],
  [[13, Kislev, 22, Adar2, 3, Av], HilchosLH, 8.12, 8.12],
  [[14, Kislev, 23, Adar2, 4, Av], HilchosLH, 8.13, 8.14],
  [[15, Kislev, 24, Adar2, 5, Av], HilchosLH, 9.1, 9.2],
  [[16, Kislev, 25, Adar2, 6, Av], HilchosLH, 9.3, 9.4],
  [[17, Kislev, 26, Adar2, 7, Av], HilchosLH, 9.5, 9.6],
  [[18, Kislev, 27, Adar2, 8, Av], HilchosLH, 10.1, 10.2],
  [[19, Kislev, 28, Adar2, 9, Av], HilchosLH, 10.3, 10.3],
  [[20, Kislev, 29, Adar2, 10, Av], HilchosLH, 10.4, 10.4],
  [[21, Kislev, 1, Nisan, 11, Av], HilchosLH, 10.5, 10.6],
  [[22, Kislev, 2, Nisan, 12, Av], HilchosLH, 10.7, 10.8],
  [[23, Kislev, 3, Nisan, 13, Av], HilchosLH, 10.9, 10.10],
  [[24, Kislev, 4, Nisan, 14, Av], HilchosLH, 10.11, 10.12],
  [[25, Kislev, 5, Nisan, 15, Av], HilchosLH, 10.13, 10.13],
  [[26, Kislev, 6, Nisan, 16, Av], HilchosLH, 10.14, 10.14],
  [[27, Kislev, 7, Nisan, 17, Av], HilchosLH, 10.15, 10.16],
  [[28, Kislev, 8, Nisan, 18, Av], HilchosLH, 10.17, 10.17],
  [[29, Kislev, 9, Nisan, 19, Av], HilchosRechilus, 1.1, 1.2],
  [[30, Kislev, 10, Nisan, 20, Av], HilchosRechilus, 1.3, 1.3],
  [[1, Teves, 11, Nisan, 21, Av], HilchosRechilus, 1.4, 1.5],
  [[2, Teves, 12, Nisan, 22, Av], HilchosRechilus, 1.6, 1.7],
  [[3, Teves, 13, Nisan, 23, Av], HilchosRechilus, 1.8, 1.9],
  [[4, Teves, 14, Nisan, 24, Av], HilchosRechilus, 1.10, 1.11],
  [[5, Teves, 15, Nisan, 25, Av], HilchosRechilus, 2.1, 2.2],
  [[6, Teves, 16, Nisan, 26, Av], HilchosRechilus, 2.3, 2.4],
  [[7, Teves, 17, Nisan, 27, Av], HilchosRechilus, 3.1, 3.1],
  [[8, Teves, 18, Nisan, 28, Av], HilchosRechilus, 3.2, 3.4],
  [[9, Teves, 19, Nisan, 29, Av], HilchosRechilus, 4.1, 4.3],
  [[10, Teves, 20, Nisan, 30, Av], HilchosRechilus, 5.1, 5.2],
  [[11, Teves, 21, Nisan, 1, Elul], HilchosRechilus, 5.3, 5.4],
  [[12, Teves, 22, Nisan, 2, Elul], HilchosRechilus, 5.5, 5.5],
  [[13, Teves, 23, Nisan, 3, Elul], HilchosRechilus, 5.6, 5.7],
  [[14, Teves, 24, Nisan, 4, Elul], HilchosRechilus, 6.1, 6.2],
  [[15, Teves, 25, Nisan, 5, Elul], HilchosRechilus, 6.3, 6.4],
  [[16, Teves, 26, Nisan, 6, Elul], HilchosRechilus, 6.5, 6.6],
  [[17, Teves, 27, Nisan, 7, Elul], HilchosRechilus, 6.7, 6.7],
  [[18, Teves, 28, Nisan, 8, Elul], HilchosRechilus, 6.8, 6.9],
  [[19, Teves, 29, Nisan, 9, Elul], HilchosRechilus, 6.10, 6.10],
  [[20, Teves, 30, Nisan, 10, Elul], HilchosRechilus, 7.1, 7.1],
  [[21, Teves, 1, Iyyar, 11, Elul], HilchosRechilus, 7.2, 7.2],
  [[22, Teves, 2, Iyyar, 12, Elul], HilchosRechilus, 7.3, 7.4],
  [[23, Teves, 3, Iyyar, 13, Elul], HilchosRechilus, 7.5, 7.5],
  [[24, Teves, 4, Iyyar, 14, Elul], HilchosRechilus, 8.1, 8.3],
  [[25, Teves, 5, Iyyar, 15, Elul], HilchosRechilus, 8.4, 8.5],
  [[26, Teves, 6, Iyyar, 16, Elul], HilchosRechilus, 9.1, 9.2],
  [[27, Teves, 7, Iyyar, 17, Elul], HilchosRechilus, 9.3, 9.4],
  [[28, Teves, 8, Iyyar, 18, Elul], HilchosRechilus, 9.5, 9.6],
  [[29, Teves, 9, Iyyar, 19, Elul], HilchosRechilus, 9.7, 9.9],
  [[1, Shvat, 10, Iyyar, 20, Elul], HilchosRechilus, 9.10, 9.10],
  [[2, Shvat, 11, Iyyar, 21, Elul], HilchosRechilus, 9.11, 9.12],
  [[3, Shvat, 12, Iyyar, 22, Elul], HilchosRechilus, 9.13, 9.13],
  [[4, Shvat, 13, Iyyar, 23, Elul], HilchosRechilus, 9.14, 9.15],
  [[5, Shvat, 14, Iyyar, 24, Elul], Tziyurim, 1, 2],
  [[6, Shvat, 15, Iyyar, 25, Elul], Tziyurim, 3, 3],
  [[7, Shvat, 16, Iyyar, 26, Elul], Tziyurim, 4, 5],
  [[8, Shvat, 17, Iyyar, 27, Elul], Tziyurim, 6, 7],
  [[9, Shvat, 18, Iyyar, 28, Elul], Tziyurim, 8, 9],
  [[10, Shvat, 19, Iyyar, 29, Elul], Tziyurim, 10, 11],
];

/**
 * Looks up Chofetz Chaim Calendar for date
 * @param {HDate} hdate
 * @return {any}
 */
export function chofetzChaim(hdate) {
  if (!HDate.isHDate(hdate)) {
    throw new TypeError(`Invalid date: ${hdate}`);
  }

  const readings = hdate.isLeapYear() ? leap : simple;
  const day = hdate.getDate();
  const month = hdate.getMonth();
  const result = lookupReading(readings, day, month);

  const year = hdate.getFullYear();
  if (day === 29 &&
    ((month === Kislev && HDate.shortKislev(year))) ||
    ((month === Cheshvan && !HDate.longCheshvan(year)))) {
    const extra = lookupReading(readings, 30, month);
    result.e = extra.e;
  }

  return result;
}

/**
 * @private
 * @param {any[]} readings
 * @param {number} day
 * @param {number} month
 * @return {any}
 */
function lookupReading(readings, day, month) {
  const result = {};
  for (const reading of readings) {
    const dates = reading[0];
    for (let i = 0; i < dates.length; i += 2) {
      const dd = dates[i];
      const mm = dates[i + 1];
      if (dd === day && mm === month) {
        if (!result.k) {
          result.k = reading[1];
          result.b = reading[2];
        }
        result.e = reading[3];
      }
    }
  }
  return result;
}

const hd = new HDate(29, 'Cheshvan', 5781);
const a = chofetzChaim(hd);
console.log(a);
