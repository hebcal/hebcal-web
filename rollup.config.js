import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import pkg from './package.json';
import {terser} from 'rollup-plugin-terser';

export default [
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
