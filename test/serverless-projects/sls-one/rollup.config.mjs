import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import externals from "../../../build/esm/rollup-plugin.js";
import path from "path";

const root = path.dirname(new URL(import.meta.url).pathname);

/** @type {import('rollup').RollupOptions} */
const config = {
  input: "index.js",
  output: {
    file: "bundle.js",
    format: "cjs",
    exports: "default",
  },
  plugins: [externals(root, { file: "node-externals.json" }), commonjs(), nodeResolve()],
};

export default config;
