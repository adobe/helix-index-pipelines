/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const request = require('request-promise-native');
const moment = require('moment');
const { JSDOM } = require('jsdom');
const string = require('mdast-util-to-string');
const YAML = require('yaml');

const helpers = {
  string,
  parseTimestamp: (element, format) => {
    const millis = moment(element.textContent, format).valueOf();
    return millis / 1000;
  },
};

/**
 * Load an index configuration from a git repo.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref
 *
 * @returns configuration
 */
async function loadConfig(owner, repo, ref) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/helix-index.yaml`;
  try {
    const response = await request(url);
    return YAML.parseDocument(response).toJSON() || {};
  } catch (e) {
    // config not usable return empty
    return {
      indices: [],
    };
  }
}

/**
 * Return a value in the DOM by evaluating an expression
 *
 * @param {HTMLElement} element
 * @param {string} expression
 */
function getDOMValue(element, expression) {
  const m = expression.match(/{([a-zA-Z]+)(\("([^"]+)"\))?}/);
  if (m && m[1]) {
    const field = element[m[1]];
    if (typeof field === 'function') {
      /* This is a instance function on the element */
      return field.apply(element);
    }
    if (!field && helpers[m[1]]) {
      /* This is a global helper function */
      return helpers[m[1]](element, m[3]);
    }
    /* This is a property of the element */
    return field;
  }
  return element.getAttribute(expression);
}

/**
 * Given a HTML document, extract a value and evaluate an expression
 * on it. The index contains the CSS selector that will select the
 * value(s) to process. If we get multiple values, we return an
 * array.
 *
 * @param {Document} document
 * @param {Object} index
 */
function indexSingle(document, index) {
  const record = {
    fragmentID: '',
  };

  /* Walk through all index properties */
  Object.keys(index.properties).map((name) => {
    const { select, value: expression } = index.properties[name];
    document.querySelectorAll(select).forEach((element) => {
      const value = getDOMValue(element, expression);
      if (!record[name]) {
        record[name] = value;
      } else {
        if (!Array.isArray(record[name])) {
          record[name] = [record[name]];
        }
        record[name].push(value);
      }
    });
    return record;
  });
  return record;
}

function indexGroup(/* document, index */) {
  // TODO
  return [];
}

module.exports.main = async (context, action) => {
  const {
    owner, repo, ref, path,
  } = action.request.params;

  // TODO: this should be loaded once or even passed in context
  const config = await loadConfig(owner, repo, ref);
  const docs = [];

  await Promise.all(Object.keys(config.indices).map(async (name) => {
    const index = config.indices[name];
    if (index.source === 'html') {
      /* Fetch the HTML page */
      const pageUrl = index.fetch.replace(/\{path\}/g, path);
      const response = await request(pageUrl);
      const { document } = new JSDOM(response).window;

      if (index.group) {
        // create an index record *per* matching element
        docs.push(...indexGroup(document, index));
      } else {
        // create one index record, potentially with multi-values
        docs.push({
          [name]: indexSingle(document, index),
        });
      }
    }
  }));
  return {
    response: {
      body: {
        docs,
      },
    },
  };
};
