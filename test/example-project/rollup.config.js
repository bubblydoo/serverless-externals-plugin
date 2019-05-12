const commonjs = require('rollup-plugin-commonjs');
const resolve = require('rollup-plugin-node-resolve');
const externals = require('../..').externals;

module.exports = async function() {
  return {
    input: 'src/main.js',
    output: {
      file: 'handler.js',
      format: 'cjs',
      name: 'ServerlessExternalsPluginExampleProjectModule',
      exports: 'named'
    },
    plugins: [
      resolve(),
      commonjs()
    ],
    external: (await externals(__dirname)).concat(['is-object'])
  }
};
