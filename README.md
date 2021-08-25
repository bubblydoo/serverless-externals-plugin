# Serverless Externals Plugin

Only include listed `node_modules` and their dependencies in Serverless.

This plugin helps Serverless package only external modules, and Rollup bundle all the other modules.

## Installation

```bash
npm install serverless-externals-plugin
```

or

```bash
yarn add serverless-externals-plugin
```

`serverless.yml`:

```yml
plugins:
  - serverless-externals-plugin

package:
  patterns:
    - '!./**'
    - dist/**

custom:
  externals:
    modules:
      - pkg3
```

`rollup.config.js`:

```js
import { rollupPlugin as externals } from "serverless-externals-plugin";

export default {
  ...
  treeshake: {
    moduleSideEffects: "no-external",
  },
  plugins: [
    externals(__dirname, { file: "node-externals.json" }),
    commonjs(),
    nodeResolve({ preferBuiltins: true }),
    ...
  ],
}
```

## Example

Externals Plugin interacts with both **Serverless** and with your **bundler** (Rollup).

Let's say you have two modules in your `package.json`, `pkg2` and `pkg3`. `pkg3` is a module with native binaries, so it can't be bundled.

```
root
+-- pkg3@2.0.0
+-- pkg2@0.0.1
    +-- pkg3@1.0.0
```

Because `pkg3` can't be bundled, both `./node_modules/pkg3` and `./node_modules/pkg2/node_modules/pkg3` should be included in the bundle.
`pkg2` can just be bundled, but should import `pkg3` as follows: `require('pkg2/node_modules/pkg3')`. It cannot just do `require('pkg3')`
because `pkg3` has a different version than `pkg2/node_modules/pkg3`.

In the Serverless package, only `./node_modules/pkg3/**` and `./node_modules/pkg2/node_modules/pkg3/**` should be included, all the other
contents of `node_modules` are already bundled.

Externals Plugin provides a Serverless plugin and a Rollup plugin to support this.

## Configuration

As the list of externals is shared between Serverless and a bundler, it's recommended to make a `node-externals.json` file:

```json
{
  "modules": [
    "pkg3"
  ]
}
```

Then, in `serverless.yml`:

```yml
custom:
  externals:
    file: node-externals.json
```

And in `rollup.config.js`:

```js
plugins: [
  externals(__dirname, { file: "node-externals.json" }),
  ...
]
```

## How it works

Externals Plugin uses [Arborist](https://github.com/npm/arborist) by NPM to analyze the `node_modules` tree (using `loadActual()`).

Using the Externals configuration (a list modules you want to keep external), the Plugin will then build a list of all dependencies that should be kept external.
This list will contain the modules in the configuration and all the (non-dev) dependencies, recursively.

In the example, the list will contain both `pkg2/node_modules/pkg3` and `pkg3`.

## Rollup Plugin

```js
import { rollupPlugin as externals } from "serverless-externals-plugin";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

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
    externals(__dirname, { file: "node-externals.json" }),
    commonjs(),
    nodeResolve({ preferBuiltins: true }),
  ],
};

export default config;
```

Make sure `externals` comes **before** `@rollup/plugin-commonjs` and `@rollup/plugin-node-resolve`.

Make sure [`moduleSideEffects: "no-external"`](https://rollupjs.org/guide/en/#treeshake) is set. By default, Rollup includes all external modules that appear in the code because they might contain side effects, even if they can be treeshaken.
By setting this option Rollup will assume external modules have no side effects.

(`"no-external"` is equivalent to `(id, external) => !external`)

### Implementation

The Rollup plugin provides a `resolveId` function to Rollup. For every import (e.g. `require('pkg3')`) in your source code,
Rollup will ask the Externals Plugin whether the import is external, and where to find it.

The Plugin will look for the import in the Arborist graph, and if it's declared as being external
it will return the full path to the module that's being imported (e.g. `pkg2/node_modules/pkg3`).

## Caveats

### Externals with side effects

It's unlikely, but if you have external modules with side effects (like polyfills), make sure to configure Rollup properly.

**NOTE**: This only applies to external modules. You should probably bundle your polyfills.

```js
import "some-external-module"; // this doesn't work, Rollup will treeshake it away
```

As Rollup will remove external modules with side effects, make sure to add something like this
to the Rollup config:

```js
treeshake: {
  moduleSideEffects: (id, external) => !id.test(/some-external-module/) || !external
}
```

### Only one `node_modules` supported

This plugin doesn't have support for analyzing multiple `node_modules` folders. If you have
more `node_modules` folders on your `NODE_PATH` (e.g. from a Lambda layer), you can still use
the [`external` field of Rollup](https://rollupjs.org/guide/en/#external).

## Todo

- Ensure compatibility with Serverless Jetpack or speedup packaging somehow
- Webpack plugin
- Esbuild plugin
- Layer support

## Credits

Some Serverless-handling code was taken from [Serverless Jetpack](https://github.com/FormidableLabs/serverless-jetpack).
