import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import externals from "../../../build/esm/rollup-plugin";

/** @type {import('rollup').RollupOptions} */
const config = {
  input: "index.js",
  output: {
    file: "bundle.js",
    format: "cjs",
    exports: "default",
  },
  treeshake: {
    moduleSideEffects: "no-external",
  },
  plugins: [
    externals(__dirname, { modules: ["aws-sdk", "botkit"] }),
    commonjs(),
    nodeResolve({ preferBuiltins: true }),
  ],
};

export default config;
