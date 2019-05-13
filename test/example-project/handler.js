'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var isString = _interopDefault(require('is-string'));
var awsSdk = _interopDefault(require('aws-sdk'));
var s3 = _interopDefault(require('aws-sdk/clients/s3'));
var isObject = _interopDefault(require('is-object'));

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

var isArray_1 = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

var index = function() {
  const isArray = isArray_1;
  const isString$1 = isString;
  const awsSdk$1 = awsSdk;
  const awsSdkS3 = s3;
  const isObject$1 = isObject;

  return [isArray, isString$1, awsSdk$1, awsSdkS3, isObject$1];
};

var main = {
	index: index
};

exports.default = main;
exports.index = index;
