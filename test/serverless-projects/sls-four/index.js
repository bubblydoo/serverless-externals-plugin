const awsSdk = require('aws-sdk');
const express = require('express');
const uuid = require('uuid');

module.exports = {
  handler: async () => {
    console.log(awsSdk, express, uuid);
  },
}
