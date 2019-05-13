module.exports.index = function() {
  const isArray = require('is-array');
  const isString = require('is-string');
  const awsSdk = require('aws-sdk');
  const awsSdkS3 = require('aws-sdk/clients/s3');
  const isObject = require('is-object');

  return [isArray, isString, awsSdk, awsSdkS3, isObject];
}
