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
  plugins: [externals(root, { modules: ["pkg2", "pkg5", "pkg6"] }), commonjs(), nodeResolve()],
};

export default config;
