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
  {
    input: 'src/hdate.bundle.js',
    output: [
      {
        file: 'dist/views/partials/hdate.bundle.min.js',
        format: 'iife',
        name: 'hdate',
        banner: '/*! hdate.bundle ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
    ],
  },
  {
    input: 'src/hdate-en.js',
    output: [
      {
        file: 'dist/views/partials/hdate-en.min.js',
        format: 'iife',
        banner: '/*! hdate-en ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
    ],
  },
  {
    input: 'src/hdate-he.js',
    output: [
      {
        file: 'dist/views/partials/hdate-he.min.js',
        format: 'iife',
        banner: '/*! hdate-he ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
    ],
  },
  {
    input: 'src/hdate-he-NoNikud.js',
    output: [
      {
        file: 'dist/views/partials/hdate-he-x-NoNikud.min.js',
        format: 'iife',
        banner: '/*! hdate-he-NoNikud ' + pkg.version + ' */',
      },
    ],
    plugins: [
      terser(),
      nodeResolve(),
      commonjs(),
    ],
  },
];
