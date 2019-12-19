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
const { dirname, resolve } = require('path');
const string = require('mdast-util-to-string');
const YAML = require('yaml');
const fs = require('fs-extra');

const helpers = {
  string,
  parseTimestamp: (element, format) => {
    const millis = moment.utc(element.textContent, format).valueOf();
    return millis / 1000;
  },
  match: (element, re) => {
    const regex = new RegExp(re, 'g');
    let m;
    let result;

    // eslint-disable-next-line no-cond-assign
    while ((m = regex.exec(element.textContent)) !== null) {
      if (!result) {
        result = m[m.length - 1];
      } else {
        if (!Array.isArray(result)) {
          result = [result];
        }
        result.push(m[m.length - 1]);
      }
    }
    return result;
  },
};

/**
 * Load an index configuration from a local file. Its location is given by the path
 * being requested (e.g. '/test/specs/blog/post.html').
 *
 * @param {object} params
 * @returns configuration
 */
async function loadConfigFromFile(params) {
  const { path, logger } = params;

  const configfile = resolve(dirname(__dirname), dirname(path).substr(1), 'helix-index.yaml');
  logger.debug(`Reading index configuration from: ${configfile}`);

  try {
    const source = await fs.readFile(configfile, 'utf8');
    const document = YAML.parseDocument(source);
    return document.toJSON() || {};
  } catch (e) {
    logger.error(`Failed to load index configuration from: ${configfile}`, e);
    // config not usable return empty
    return {
      indices: [],
    };
  }
}

/**
 * Fetch HTML file from the file system.
 *
 * @param {object} params
 * @return HTML file
 */
async function fetchHTMLFromFile(params) {
  const { path, logger } = params;
  const htmlfile = resolve(dirname(__dirname), path.replace(/\.md$/, '.html').substr(1));
  logger.debug(`Reading HTML from: ${htmlfile}`);

  return fs.readFile(htmlfile, 'utf8');
}

/**
 * Index loader and HTML fetcher that operates on the local file system.
 */
const fileLoader = {
  loadConfig: loadConfigFromFile,
  fetchHTML: fetchHTMLFromFile,
};

/**
 * Load an index configuration from a git repo.
 *
 * @param {object} params
 * @returns configuration
 */
async function loadConfigFromRepo(params) {
  const {
    owner, repo, ref, logger,
  } = params;

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/helix-index.yaml`;
  logger.debug(`Reading index configuration from: ${url}`);

  try {
    const response = await request(url);
    return YAML.parseDocument(response).toJSON() || {};
  } catch (e) {
    logger.error(`Failed to load index configuration from: ${url}`, e);
    // config not usable return empty
    return {
      indices: [],
    };
  }
}

/**
 * Fetch HTML page from a remote location, defined by owner, repo and path.
 *
 * @param {object} params
 * @return HTML file
 */
async function fetchHTMLFromRepo(params) {
  const {
    index, owner, repo, path, logger,
  } = params;
  const pageUrl = index.fetch
    .replace(/\{owner\}/g, owner)
    .replace(/\{repo\}/g, repo)
    .replace(/\{path\}/g, path);
  logger.debug(`Reading HTML from: ${pageUrl}`);
  return request(pageUrl);
}

/**
 * Index loader and HTML fetcher that operates on git repositories.
 */
const repoLoader = {
  loadConfig: loadConfigFromRepo,
  fetchHTML: fetchHTMLFromRepo,
};

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

  // Use a file loader if this is a local setup
  const loader = (owner === 'helix') ? fileLoader : repoLoader;
  const docs = [];
  const config = await loader.loadConfig({
    owner, repo, ref, path, logger: action.logger,
  });

  await Promise.all(Object.keys(config.indices).map(async (name) => {
    const index = config.indices[name];
    if (index.source === 'html') {
      /* Fetch the HTML page */
      const response = await loader.fetchHTML({
        index, owner, repo, ref, path, logger: action.logger,
      });
      const { document } = new JSDOM(response).window;

      if (index.group) {
        // create an index record *per* matching element
        docs.push(...indexGroup(document, index));
      } else {
        // create one index record, potentially with multi-values
        docs.push(indexSingle(document, index));
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
