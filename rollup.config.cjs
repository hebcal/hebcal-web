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

// Imports a .css file as a JS string (vanilla-calendar-pro ships its
// styles pre-minified; client-datepicker.js injects them on first use).
const cssAsString = {
  name: 'css-as-string',
  transform(code, id) {
    if (!id.endsWith('.css')) return null;
    return {code: 'export default ' + JSON.stringify(code.replace(/^\/\*!.*?\*\//, '')) + ';', map: null};
  },
};

module.exports = [
  {
    input: 'src/client-autocomplete.js',
    output: [
      {
        file: 'views/partials/client-autocomplete.min.js',
        format: 'iife',
        name: 'hebcalClient',
        banner: '/*! client-autocomplete ' + pkg.version + ' */',
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
    input: 'src/client-email-subscribe.js',
    output: {
      file: 'views/partials/client-email-subscribe.min.js',
      format: 'iife',
      banner: '/*! client-email-subscribe ' + pkg.version + ' */',
    },
    plugins: [terser()],
  },
  {
    input: 'src/client-email-signin.js',
    output: {
      file: 'views/partials/client-email-signin.min.js',
      format: 'iife',
      banner: '/*! client-email-signin ' + pkg.version + ' */',
    },
    plugins: [terser()],
  },
  {
    input: 'src/client-download-modal.js',
    output: {
      file: 'views/partials/client-download-modal.min.js',
      format: 'iife',
      banner: '/*! client-download-modal ' + pkg.version + ' */',
    },
    plugins: [terser()],
  },
  {
    input: 'src/client-form-range-validation.js',
    output: {
      file: 'views/partials/client-form-range-validation.min.js',
      format: 'iife',
      banner: '/*! client-form-range-validation ' + pkg.version + ' */',
    },
    plugins: [terser()],
  },
  {
    input: 'src/client-fullcalendar.js',
    output: [
      {
        file: 'static/i/' + pkg.config.holidayFcApp,
        format: 'iife',
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
  {
    input: 'src/client-daily-learning.js',
    output: {
      file: 'static/i/' + pkg.config.dailyLearningApp,
      format: 'iife',
      banner: '/*! ' + pkg.config.dailyLearningApp + ' */',
    },
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
    input: 'src/client-datepicker.js',
    onwarn(warning, warn) {
      // vanilla-calendar-pro ships pre-minified code with misplaced
      // /* @__PURE__ */ annotations; harmless, and it dumps the whole file.
      if (warning.code === 'INVALID_ANNOTATION') return;
      warn(warning);
    },
    output: {
      file: 'static/i/' + pkg.config.datepickerApp,
      format: 'iife',
      banner: '/*! ' + pkg.config.datepickerApp + ' vanilla-calendar-pro (MIT) */',
    },
    plugins: [
      cssAsString,
      nodeResolve({browser: true}),
      terser(),
    ],
  },
  {
    input: 'src/client-datepicker-loader.js',
    output: {
      file: 'views/partials/client-datepicker-loader.min.js',
      format: 'iife',
    },
    plugins: [
      terser(),
    ],
  },
];
