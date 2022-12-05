const {nodeResolve} = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const babel = require('@rollup/plugin-babel');
const terser = require('@rollup/plugin-terser');
const pkg = require('./package.json');

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
      babel({
        babelHelpers: 'bundled',
        presets: [
          ['@babel/preset-env', {
            modules: false,
            exclude: [
              'es.array.includes',
              'es.parse-int',
              'es.regexp.exec',
              'es.string.includes',
              'es.string.replace',
              'es.string.split',
              'es.string.trim',
              'es.symbol.description',
            ],
            targets: {
              edge: '16',
              firefox: '60',
              chrome: '58',
              safari: '10',
            },
            useBuiltIns: 'usage',
            corejs: 3,
          }],
        ],
        exclude: ['node_modules/**'],
      }),
      nodeResolve(),
      commonjs(),
    ],
  },
  {
    input: 'src/hebcalResults.js',
    output: [
      {
        file: 'dist/views/partials/hebcalResults.min.js',
        format: 'iife',
        name: 'hebcalResults',
        banner: '/*! hebcalResults ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      babel({
        babelHelpers: 'bundled',
        presets: [
          ['@babel/preset-env', {
            modules: false,
            exclude: [
              'es.array.includes',
              'es.parse-int',
              'es.regexp.exec',
              'es.string.includes',
              'es.string.replace',
              'es.string.split',
              'es.string.trim',
              'es.symbol.description',
            ],
            targets: {
              edge: '16',
              firefox: '60',
              chrome: '58',
              safari: '10',
            },
            useBuiltIns: 'usage',
            corejs: 3,
          }],
        ],
        exclude: ['node_modules/**'],
      }),
      nodeResolve(),
      commonjs(),
    ],
  },
];
