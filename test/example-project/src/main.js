module.exports.index = function() {
  const isArray = require('is-array');
  const isString = require('is-string');
  const awsSdk = require('aws-sdk');
  const isObject = require('is-object');

  return [isArray, isString, awsSdk, isObject];
}
