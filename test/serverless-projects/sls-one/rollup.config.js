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
  plugins: [externals(__dirname, { file: "node-externals.json" }), commonjs(), nodeResolve()],
};

export default config;
