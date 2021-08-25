const Botkit = require("botkit");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const path = require("path");
const { v4 } = require("uuid");

module.exports = {
  Botkit,
  DocumentClient,
  path,
  v4,
};
