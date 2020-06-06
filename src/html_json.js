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
const { StatusCodeError } = require('request-promise-native/errors');
const moment = require('moment');
const { JSDOM } = require('jsdom');
const jsep = require('jsep');
const { IndexConfig } = require('@adobe/helix-shared');

const helpers = {
  parseTimestamp: (elements, format) => elements.map((el) => {
    const millis = moment.utc(el.textContent, format).valueOf();
    return millis / 1000;
  }),
  attribute: (elements, name) => elements.map((el) => el.getAttribute(name)),
  textContent: (elements) => elements.map((el) => el.textContent),
  innerHTML: (elements) => elements.map((el) => el.innerHTML),
  match: (elements, re) => {
    // todo: maybe base on function ?
    const result = [];
    const regex = new RegExp(re, 'g');
    elements.forEach((el) => {
      let m;

      // eslint-disable-next-line no-cond-assign
      while ((m = regex.exec(el.textContent)) !== null) {
        result.push(m[m.length - 1]);
      }
    });
    return result;
  },
  words: (text, start, end) => {
    if (Array.isArray(text)) {
      // eslint-disable-next-line no-param-reassign
      text = text.join(' ');
    }
    return [text.split(/\s+/g).slice(start, end).join(' ')];
  },
  replace: (s, searchValue, replaceValue) => [s.replace(searchValue, replaceValue)],
};

/**
 * Fetch all HTML sources for all indices configured, ensuring that the
 * HTML source is fetched at most once.
 *
 * @param {object} params parameters
 * @param {object} indices index configurations
 * @returns object containing index definition and HTML response, keyed by name
 */
async function fetchHTML(params, indices) {
  const {
    owner, repo, path, logger,
  } = params;

  // Create our result where we'll store the HTML responses
  const result = Object.entries(indices)
    .filter(([, { source }]) => source === 'html')
    .reduce((prev, [name, index]) => {
      // eslint-disable-next-line no-param-reassign
      prev[name] = {
        index,
        pageURL: index.fetch.replace(/\{owner\}/g, owner).replace(/\{repo\}/g, repo).replace(/\{path\}/g, path),
      };
      return prev;
    }, {});

  // Create a unique set of the page URLs found
  const pageURLs = Array.from(Object.values(result)
    .reduce((prev, { pageURL }) => {
      prev.add(pageURL);
      return prev;
    }, new Set()));

  // Fetch the responses
  const responses = new Map(await Promise.all(pageURLs.map(async (pageURL) => {
    logger.info(`Reading HTML from: ${pageURL}`);
    try {
      const response = await request(pageURL);
      return [pageURL, response];
    } catch (e) {
      if (!(e instanceof StatusCodeError && e.statusCode === 404)) {
        logger.error(`Unexpected error fetching ${pageURL}`, e);
      }
      return [pageURL, null];
    }
  })));

  // Finish by filling in all responses acquired
  Object.values(result).forEach((entry) => {
    // eslint-disable-next-line no-param-reassign
    entry.response = responses.get(entry.pageURL);
  });
  return result;
}

function evaluate(expression, context) {
  const { logger } = context;
  const vars = {
    ...context,
    ...helpers,
  };

  function evalNode(node) {
    switch (node.type) {
      case 'CallExpression': {
        const args = node.arguments.map(evalNode);
        const fn = evalNode(node.callee);
        if (typeof fn === 'function') {
          return fn(...args);
        } else {
          logger.warn('evaluate function not supported: ', node.callee.name);
        }
        return undefined;
      }
      case 'Identifier': {
        return vars[node.name];
      }
      case 'Literal': {
        return node.value;
      }
      default: {
        logger.warn('evaluate type not supported: ', node.type);
      }
    }
    return null;
  }

  const tree = jsep(expression);
  // console.log(tree);
  return evalNode(tree);
}

/**
 * Return a value in the DOM by evaluating an expression
 *
 * @param {Array.<HTMLElement>} elements
 * @param {string} expression
 * @param {Logger} logger
 */
function getDOMValue(elements, expression, logger, vars) {
  return evaluate(expression, {
    el: elements,
    logger,
    ...vars,
  });
}

/**
 * Given a HTML document, extract a value and evaluate an expression
 * on it. The index contains the CSS selector that will select the
 * value(s) to process. If we get multiple values, we return an
 * array.
 *
 * @param {Document} document
 * @param {Object} index
 * @param {Logger} logger
 */
function indexSingle(path, document, index, logger) {
  const record = {
    fragmentID: '',
  };

  /* Walk through all index properties */
  Object.keys(index.properties).forEach((name) => {
    const { select, ...prop } = index.properties[name];
    const expression = prop.value || prop.values;
    // create an array of elements
    const elements = select !== 'none' ? Array.from(document.querySelectorAll(select)) : [];
    let value = getDOMValue(elements, expression, logger, { path }) || [];
    // concat for single value
    if (prop.value) {
      value = value.length === 1 ? value[0] : value.join('');
    }
    record[name] = value;
  });
  return record;
}

function indexGroup(/* path, document, index */) {
  // TODO
  return [];
}

module.exports.main = async (context, action) => {
  const {
    owner, repo, ref, path,
  } = action.request.params;

  const { logger } = action;

  const loadConfig = async () => {
    const indexYAML = await action.downloader.fetchGithub({
      owner, repo, ref, path: '/helix-query.yaml',
    });
    if (indexYAML.status !== 200) {
      logger.warn(`Unable to fetch helix-query.yaml: ${indexYAML.status}`);
      return {
        indices: [],
      };
    }
    return (await new IndexConfig()
      .withSource(indexYAML.body)
      .init()).toJSON();
  };

  const config = await loadConfig();
  const docs = [];

  const htmlIndices = await fetchHTML({
    owner, repo, ref, path, logger: action.logger,
  }, config.indices);

  Object.entries(htmlIndices)
    .filter(([, { response }]) => response !== null)
    .forEach(([name, { index, response }]) => {
      const { document } = new JSDOM(response).window;
      if (index.group) {
        docs.push(...indexGroup(path, document, index));
      } else {
        docs.push({
          [name]: indexSingle(path, document, index, logger),
        });
      }
    });
  return {
    response: {
      body: {
        docs,
      },
    },
  };
};
