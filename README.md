# Serverless Externals Plugin

This plugin was made for Serverless builds that use Rollup or Webpack. It does two things:

- It generates a list of external modules for Rollup/Webpack (should be kept as `require()` in bundle)
- It includes those modules and their dependencies in the package which is uploaded with Serverless.

This list of external modules is kept in a file called `node-externals.json`.

If there's a global module available (like `aws-sdk`), you can exclude it from the package. See below.

See [test/example-project](test/example-project) for a typical project.

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
const externals = require('serverless-externals-plugin').externals;

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

module.exports = async function() {
  return {
    entry: 'src/main.js',
    ...
    externals: await externals(__dirname)
  }
};
```

### Testing

```bash
npm test
```

### See also

Inspired by [Serverless Plugin Include Dependencies](https://github.com/dougmoscrop/serverless-plugin-include-dependencies) and [Webpack Node Externals](https://github.com/liady/webpack-node-externals)
