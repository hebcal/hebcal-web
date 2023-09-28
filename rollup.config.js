const {nodeResolve} = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
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
      nodeResolve(),
      commonjs(),
    ],
  },
];
