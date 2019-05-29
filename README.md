# Serverless Externals Plugin

[![Build Status](https://travis-ci.org/hansottowirtz/serverless-externals-plugin.svg?branch=master)](https://travis-ci.org/hansottowirtz/serverless-externals-plugin)

This plugin was made for Serverless builds that use Rollup or Webpack. It does two things:

- It generates a list of external modules for Rollup/Webpack (should be kept as `require()` in bundle)
- It includes those modules and their dependencies in the package which is uploaded with Serverless.

This list of external modules is kept in a file called `node-externals.json`.

If there's a global module available (like `aws-sdk`), you can exclude it from the package. See below.

See [test/example-project](test/example-project) for a typical project.

### Motivation

I wanted to include Cheerio/JSDom and AWS SDK in a Typescript project, but neither could be bundled because of obscure errors, so they needed to be external. To reduce package size, I didn't want to make every module external. Manually looking up a module and adding its dependencies to `rollup.config.js` and `serverless.yml` is simply too much work. This plugin makes this much easier.

### Typical configuration

`serverless.yml`:
```yml
...

plugins:
  - serverless-externals-plugin

custom:
  externals:
    exclude:
      - aws-sdk
    # file: node-externals.json
    # modules: [is-string, is-array]

...
```

`node-externals.json`:
```json
["is-string", "is-array", "aws-sdk"]
```

`rollup.config.js` (if you're using Rollup):
```javascript
const externals = require('serverless-externals-plugin').externalsRollup;

module.exports = async function() {
  return {
    input: 'src/main.js',
    ...
    external: await externals(__dirname)
  }
};
```

`webpack.config.js` (if you're using Webpack):
```javascript
const externals = require('serverless-externals-plugin').externalsWebpack;

module.exports = {
  entry: 'src/main.js',
  ...
  externals: externals(__dirname)
};
```

### Advanced

#### `node-externals.json`

If you don't like adding a `node-externals.json` file, you can pass a list of module names to the `externals` function:

```javascript
externals(__dirname, ['is-object'])
```

And declare a list of modules in `serverless.yml`:

```yml
custom:
  externals:
    modules:
      - is-object
```

#### Config

The `externals` function takes a third argument object, `config`.

Key               | Default                                           | Description
--- | --- | ---
externalsFilePath | `path.join(root, 'node-externals.json')`          | Path to `node-externals.json`
packagePath       | `path.join(root, 'package.json')`                 | Path to your `package.json`
exclude           | `[]`                                              | Filters values from `node-externals.json` (perfect for globally installed modules)
ls                | `{development: true, optional: true, peer: true}` | Passed to `npm-remote-ls`

### Testing

```bash
npm test
```

### See also

Inspired by [Serverless Plugin Include Dependencies](https://github.com/dougmoscrop/serverless-plugin-include-dependencies) and [Webpack Node Externals](https://github.com/liady/webpack-node-externals)
