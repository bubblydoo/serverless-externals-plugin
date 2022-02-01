import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
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
    externals(__dirname, { modules: ["aws-sdk"], packaging: { exclude: ["aws-sdk"] } }),
    commonjs(),
    nodeResolve({ preferBuiltins: true, exportConditions: ["node"] }),
    json(),
  ],
};

export default config;
