'use strict';

const path = require('path');
const remoteLs = require('npm-remote-ls');

const DEBUG = process.env.DEBUG_SERVERLESS_EXTERNALS_PLUGIN;

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
    service.package.include = service.package.include || [];

    let externalsFile;
    let externals = [];

    const settings = service.custom && service.custom.externals ? service.custom.externals : {};

    if (typeof settings === 'object' && settings.constructor === Array) {
      externals = externals.concat(settings);
    } else if (settings.modules) {
      externals = externals.concat(settings.modules);
    }

    externalsFile = settings.file || externalsFile;
    const exclude = settings.exclude || [];

    const allExternals = await ExternalsPlugin.externals(this.serverless.config.servicePath, externals, {exclude});

    allExternals.forEach(external => {
      const subpath = settings.moduleSubpaths && settings.moduleSubpaths[external] ? settings.moduleSubpaths[external] : '**';
      if (settings.useInclude) {
        service.package.include.push(`./node_modules/${external}/${subpath}`);
      } else {
        service.package.exclude.push(`!./node_modules/${external}/${subpath}`);
      }
    });

    if (DEBUG) {
      console.log('Generated "package" field:')
      console.log(service.package);
    }
  }
}

ExternalsPlugin.externals = async function(root, externals, config) {
  config = config || {};
  const externalsFilePath = config.externalsFilePath || path.join(root, 'node-externals.json');
  const packagePath = config.packagePath || path.join(root, 'package-lock.json');

  externals = externals || [];
  try {
    externals = externals.concat(require(externalsFilePath));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }

  if (config.exclude) {
    externals = externals.filter(external => config.exclude.indexOf(external) < 0);
  }

  if (DEBUG) console.log('Listed externals:', externals.join(', '));

  const pkg = require(packagePath);

  if (!externals || (!externals.length && !config.exclude)) throw new Error('No externals listed');

  let allExternals;
  if (this.options && this.options.resolver === 'npm-remote-ls') {
    allExternals = await npmRemoteLsResolve(pkg, externals, config, packagePath);
  } else {
    allExternals = await packageLockResolve(pkg, externals, config, packagePath);
  }

  allExternals = allExternals
    .filter(s => !!s)
    .filter((v, i, a) => a.indexOf(v) === i); // Unique

  if (config.exclude) {
    console.log('Not including in package:', config.exclude.join(', '));
    allExternals = allExternals.filter(external => config.exclude.indexOf(external) < 0);
  }

  console.log('Externals with dependencies (these modules will be included in the package):', allExternals.sort().join(', '));

  return allExternals;
}

ExternalsPlugin.externalsWebpack = function(root, externals, config) {
  let allExternals = [].concat(externals);

  const promise = ExternalsPlugin.externals(root, externals, config);

  return (context, query, callback) => {
    promise.then(array => {
      const found = !!array.find(name => name === query || query.startsWith(`${name}/`));
      found ? callback(null, `commonjs ${query}`) : callback();
    });
    promise.catch(err => {
      console.warn('Error retrieving externals', err);
      callback(`Error retrieving externals: ${err}`);
    });
  }
}

ExternalsPlugin.externalsRollup = async function(root, externals, config) {
  const array = await ExternalsPlugin.externals(root, externals, config);
  return query => !!array.find(name => name === query || query.startsWith(`${name}/`));
}

module.exports = ExternalsPlugin;

function stringifyStack(stack) {
  const x = stack.map(p => p.name + (p.throughSubdeps ? ' (subdeps)' : '')).join(' > ');
  if (stack.find(p => typeof p.name !== 'string')) {
    console.error(JSON.stringify(stack));
    process.exit(1);
  }
  return x;
}

async function packageLockResolve(pkgLock, externals, config, packagePath) {
  let allExternals = [].concat(externals);

  function getRequiredDependencies(name, stack) {
    if (DEBUG) console.log(`Looking for ${name} through ${stringifyStack(stack)}`);

    let dep = pkgLock.dependencies[name];

    let requiredDeps = [name];

    switch (typeof pkgLock.dependencies[name]) {
      case 'object':
        break;
      case 'string':
        throw new Error(`Package lock file ${packagePath} invalid`);
      case 'undefined':
        if (DEBUG) console.warn(`External module ${name} not found, must be transitive dependency of ${stringifyStack(stack)}`);
        return [name];
      default:
        throw new Error(`Error occured while finding ${name} version`);
    }
    if (dep.dev) {
      if (DEBUG) console.warn(name, 'is a dev dependency through', stringifyStack(stack));
    }

    // This is the basic resolve, just using the "requires" field
    if (!dep.requires) return requiredDeps;
    requiredDeps = Object.keys(dep.requires).reduce((acc, cur) => {
      if (stack.map(p => p.name).indexOf(cur) > -1) {
        if (DEBUG) console.warn('Cyclic dependency detected', cur, 'through', stringifyStack([...stack, {name}]));
        return acc;
      }
      return [...acc, ...getRequiredDependencies(cur, [...stack, {name}])];
    }, requiredDeps);

    // This section is important if there are multiple versions of a package
    // with different dependencies
    // uses the "requires" field to look up a packages subdependencies in
    // "dependencies", then adds the matches to all required dependencies
    if (!dep.dependencies) return requiredDeps;
    requiredDeps = Object.keys(dep.requires).reduce((acc, cur) => {
      const subDep = dep.dependencies[cur];
      if (!subDep || !subDep.requires) return acc;
      return Object.keys(subDep.requires).reduce((acc2, cur2) => {
        if (stack.map(p => p.name).indexOf(cur2) > -1) {
          if (DEBUG) console.warn('Cyclic dependency detected', cur2, 'through', stringifyStack([...stack, {name, throughSubdeps: true}]));
          return acc2;
        }
        return [...acc2, ...getRequiredDependencies(cur2, [...stack, {name, throughSubdeps: true}])];
      }, acc);
    }, requiredDeps);

    return requiredDeps;
  }

  const allRequiredDependencies = externals.reduce((acc, cur) => {
    let dep = pkgLock.dependencies[cur];
    switch (typeof dep) {
      case 'object':
        break;
      case 'string':
        throw new Error(`Package lock file ${packagePath} invalid`);
      case 'undefined':
        throw new Error(`External module ${cur} not listed in ${packagePath} dependencies`);
      default:
        throw new Error(`Error occured while finding ${cur} version`);
    }
    if (!dep.requires) return acc;
    const rds = getRequiredDependencies(cur, [{name: pkgLock.name || 'root'}]);
    return [...acc, ...rds];
  }, []);

  allExternals = [...externals, ...allRequiredDependencies];

  return allExternals;
}

async function npmRemoteLsResolve(pkg, externals, config, packagePath) {
  let allExternals = [...externals];

  console.log(`Fetching dependencies for ${externals.length} modules...`);

  remoteLs.config(config.ls || {
    development: false,
    optional: false,
    peer: false
  });

  const ls = (name, version, flatten) => new Promise((res, rej) => {
    remoteLs.ls(name, version, flatten, (result) => res(result))
  });

  const dependenciesArrays = await Promise.all(externals.map(async external => {
    let version;
    switch (typeof pkg.dependencies[external]) {
      case 'string':
        version = pkg.dependencies[external];
        break;
      case 'object':
        version = pkg.dependencies[external].version;
        break;
      case 'undefined':
        throw new Error('External module ' + external + ` not listed in ${packagePath} dependencies`);
      default:
        throw new Error('Error occured while finding ' + external + ' version');
    }

    return await ls(external, version, true);
  }));

  console.log(`Fetching done`);

  dependenciesArrays.forEach(array => {
    allExternals = allExternals.concat(array.map(s => s.split('@')[0]));
  });

  return allExternals;
}
