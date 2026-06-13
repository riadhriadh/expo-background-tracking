/* eslint-env node */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const libRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the library source (file:.. dependency)
config.watchFolders = [libRoot];

// Always resolve react / react-native / expo modules from the app's
// node_modules — never from the library's own node_modules
// (prevents duplicate React → "property is not writable", etc.)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) =>
      path.join(projectRoot, 'node_modules', String(name)),
  }
);
config.resolver.blockList = [
  new RegExp(
    `${libRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/node_modules/.*`
  ),
];

module.exports = config;
