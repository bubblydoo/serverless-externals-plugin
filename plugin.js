'use strict';

const path = require('path');
const remoteLs = require('npm-remote-ls');
const util = require('util');

class ExternalsPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'before:package:createDeploymentArtifacts': this.addExcludes.bind(this)
    };
  }

  async addExcludes() {
    const service = this.serverless.service;
    
    service.package = service.package || {};
    service.package.exclude = service.package.exclude || [];
    service.custom = service.custom || {};

    let externalsFile;
    let externals = [];

    if (typeof service.custom.externals === 'object' && service.custom.externals.constructor === Array) {
      externals = externals.concat(service.custom.externals);
    } else if (service.custom.externals.modules) {
      externals = externals.concat(service.custom.externals.modules);
    }

    externalsFile = service.custom.externals.file || externalsFile;
    const exclude = service.custom.externals.exclude || [];

    const allExternals = await ExternalsPlugin.externals(this.serverless.config.servicePath, externals, {exclude});

    allExternals.forEach(external => {
      service.package.exclude.push(`!./node_modules/${external}/**`);
    });
  }
}

ExternalsPlugin.externals = async function(root, externals, config) {
  config = config || {};
  const externalsFilePath = config.externalsFilePath || path.join(root, 'node-externals.json');
  const packagePath = config.packagePath || path.join(root, 'package.json');

  externals = externals || [];
  try {
    externals = externals.concat(require(externalsFilePath));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }

  if (config.exclude) {
    console.log('Not including in package:', config.exclude.join(', '));
    externals = externals.filter(external => config.exclude.indexOf(external) < 0);
  }

  console.log('Listed externals:', externals.join(', '));

  const pkg = require(packagePath);
 
  if (!externals || !externals.length) throw new Error('No externals listed');

  let allExternals = [].concat(externals);

  const promises = [];

  console.log(`Fetching dependencies for ${externals.length} modules...`);

  remoteLs.config(config.ls || {
    development: false,
    optional: false,
    peer: false
  });

  const ls = util.promisify((name, version, flatten, cb) => remoteLs.ls(name, version, flatten, (result) => cb(null, result)));

  externals.forEach(external => {
    const version = pkg.dependencies[external];

    if (!version) {
      throw new Error('External module ' + external + ' not listed in package.json dependencies');
    }

    promises.push(ls(external, version, true));
  });

  const dependenciesArray = await Promise.all(promises);

  console.log(`Fetching done`);

  dependenciesArray.forEach(array => {
    allExternals = allExternals.concat(array.map(s => s.split('@')[0]));
  });

  allExternals = allExternals.filter((v, i, a) => a.indexOf(v) === i); // Unique

  console.log('Externals with dependencies (these modules will be included in the package):', allExternals.join(', '));

  return allExternals;
}

ExternalsPlugin.externalsWebpack = async function(root, externals, config) {
  const array = await ExternalsPlugin.externals(root, externals, config);
  const object = {};
  array.forEach(e => object[e] = `commonjs ${e}`);
  return object;
}

ExternalsPlugin.externalsRollup = async function(root, externals, config) {
  const array = await ExternalsPlugin.externals(root, externals, config);
  return query => !!array.find(name => name === query || query.startsWith(`${name}/`));
}

module.exports = ExternalsPlugin;
