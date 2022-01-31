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
    externals(__dirname, { modules: ["pg"], packaging: { forceIncludeModuleRoots: ["node_modules/pg"] } }),
    commonjs({ ignoreDynamicRequires: true }),
    nodeResolve({ preferBuiltins: true, exportConditions: ["node"] }),
  ],
};

export default config;
