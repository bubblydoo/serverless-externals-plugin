const commonjs = require('@rollup/plugin-commonjs');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const externals = require('../..').externalsRollup;

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
      nodeResolve(),
      commonjs()
    ],
    external: await externals(__dirname)
  }
};
