const {nodeResolve} = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('@rollup/plugin-terser');
const pkg = require('./package.json');

const stripHebcalBanner = {
  name: 'strip-hebcal-banner',
  transform(code, id) {
    const replaced = code.replace(/^\/\*! @hebcal\/.* \*\//, '');
    return replaced === code ? null : {code: replaced, map: null};
  },
};

module.exports = [
  {
    input: 'static/i/hebcal-app.js',
    output: [
      {
        file: 'static/i/' + pkg.config.clientapp,
        format: 'iife',
        name: 'hebcalClient',
        banner: '/*! ' + pkg.config.clientapp + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
    ],
  },
  {
    input: 'src/hebcalResults.js',
    output: [
      {
        file: 'views/partials/hebcalResults.min.js',
        format: 'iife',
        name: 'hebcalResults',
        banner: '/*! hebcalResults ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
      stripHebcalBanner,
    ],
  },
  {
    input: 'src/hdate-en.js',
    output: [
      {
        file: 'views/partials/hdate-en.min.js',
        format: 'iife',
        banner: '/*! hdate-en ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
      stripHebcalBanner,
    ],
  },
  {
    input: 'src/hdate-he.js',
    output: [
      {
        file: 'views/partials/hdate-he.min.js',
        format: 'iife',
        banner: '/*! hdate-he ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
      stripHebcalBanner,
    ],
  },
  {
    input: 'src/hdate-he-NoNikud.js',
    output: [
      {
        file: 'views/partials/hdate-he-x-NoNikud.min.js',
        format: 'iife',
        banner: '/*! hdate-he-NoNikud ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
      stripHebcalBanner,
    ],
  },
  {
    input: 'src/client-clipboard.js',
    output: [
      {
        file: 'views/partials/client-clipboard.min.js',
        format: 'iife',
        banner: '/*! client-clipboard ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
    ],
  },
  {
    input: 'views/partials/analytics.js',
    output: [
      {
        file: 'views/partials/analytics.min.js',
        format: 'iife',
        banner: '/*! analytics ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
    ],
  },
  {
    input: 'src/client-fullcalendar.js',
    output: [
      {
        file: 'static/i/' + pkg.config.holidayFcApp,
        format: 'iife',
        name: 'HolidayFullCalendar',
        banner: '/*! ' + pkg.config.holidayFcApp + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
      }),
      stripHebcalBanner,
    ],
  },
  {
    input: 'src/client-yahrzeit.js',
    output: [
      {
        file: 'views/partials/client-yahrzeit.min.js',
        format: 'iife',
      },
    ],
    plugins: [
      terser(),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
    ],
  },
];
