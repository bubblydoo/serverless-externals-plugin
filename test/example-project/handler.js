'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var require$$1 = require('is-string');
var require$$2 = require('aws-sdk');
var require$$3 = require('aws-sdk/clients/s3');
var require$$4 = require('is-object');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var require$$1__default = /*#__PURE__*/_interopDefaultLegacy(require$$1);
var require$$2__default = /*#__PURE__*/_interopDefaultLegacy(require$$2);
var require$$3__default = /*#__PURE__*/_interopDefaultLegacy(require$$3);
var require$$4__default = /*#__PURE__*/_interopDefaultLegacy(require$$4);

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
  const isString = require$$1__default['default'];
  const awsSdk = require$$2__default['default'];
  const awsSdkS3 = require$$3__default['default'];
  const isObject = require$$4__default['default'];

  return [isArray, isString, awsSdk, awsSdkS3, isObject];
};

var main = {
	index: index
};

exports.default = main;
exports.index = index;
