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
const moment = require('moment');
const { JSDOM } = require('jsdom');
const jsep = require('jsep');
const { IndexConfig } = require('@adobe/helix-shared');
const fetchAPI = require('@adobe/helix-fetch');

const fetchContext = process.env.HELIX_FETCH_FORCE_HTTP1
  ? fetchAPI.context({
    httpProtocols: ['http1'],
    httpsProtocols: ['http1'],
  })
  : fetchAPI;
const { fetch } = fetchContext;

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
    owner, repo, path, log,
  } = params;

  // Create our result where we'll store the HTML responses
  const result = Object.entries(indices)
    .filter(([, { source }]) => source === 'html')
    .reduce((prev, [name, index]) => {
      // eslint-disable-next-line no-param-reassign
      prev[name] = {
        index,
        url: index.fetch.replace(/\{owner\}/g, owner).replace(/\{repo\}/g, repo).replace(/\{path\}/g, path),
      };
      return prev;
    }, {});

  // Create a unique set of the page URLs found
  const urls = Array.from(Object.values(result)
    .reduce((prev, { url }) => {
      prev.add(url);
      return prev;
    }, new Set()));

  // Fetch the responses
  const results = new Map(await Promise.all(urls.map(async (url) => {
    log.info(`Reading HTML from: ${url}`);

    let ret;
    let body;
    try {
      ret = await fetch(url, {
        headers: {
          'User-Agent': 'index-pipelines/html_json',
        },
        cache: 'no-store',
      });
      body = await ret.text();
    } catch (e) {
      ret = {
        ok: false,
        status: 500,
      };
      body = e.message;
    }
    if (!ret.ok) {
      const message = body < 100 ? body : `${body.substr(0, 100)}...`;
      log.error(`Error fetching ${url}: statusCode: ${ret.status}, message: '${message}'`);
      return [url, { error: { reason: message, status: ret.status } }];
    }
    return [url, { response: body }];
  })));

  // Finish by filling in all responses acquired
  Object.values(result).forEach((entry) => {
    // eslint-disable-next-line no-param-reassign
    entry.result = results.get(entry.url);
  });
  return result;
}

function evaluate(expression, context) {
  const { log } = context;
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
          log.warn('evaluate function not supported: ', node.callee.name);
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
        log.warn('evaluate type not supported: ', node.type);
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
 * @param {Logger} log
 */
function getDOMValue(elements, expression, log, vars) {
  return evaluate(expression, {
    el: elements,
    log,
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
 * @param {Logger} log
 */
function indexSingle(path, document, index, log) {
  const record = {
    fragmentID: '',
  };

  /* Walk through all index properties */
  Object.keys(index.properties).forEach((name) => {
    const { select, ...prop } = index.properties[name];
    const expression = prop.value || prop.values;
    // create an array of elements
    const elements = select !== 'none' ? Array.from(document.querySelectorAll(select)) : [];
    let value = getDOMValue(elements, expression, log, { path }) || [];
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

function evaluateHtml(response, path, index, log) {
  const docs = [];
  const { document } = new JSDOM(response).window;
  if (index.group) {
    docs.push(...indexGroup(path, document, index));
  } else {
    docs.push(indexSingle(path, document, index, log));
  }
  return docs;
}

async function indexHtml(params) {
  const {
    owner, repo, ref, path,
    __ow_logger: log,
  } = params;

  const config = (await new IndexConfig()
    .withRepo(owner, repo, ref)
    .init()).toJSON();

  try {
    const htmlIndices = await fetchHTML({
      owner, repo, ref, path, log,
    }, config.indices);
    const body = {};
    Object.entries(htmlIndices)
      .reduce((prev, [name, { index, result: { error, response } }]) => {
        if (error) {
          body[name] = { error };
        } else {
          body[name] = { docs: evaluateHtml(response, path, index, log) };
        }
        return body;
      }, body);
    return {
      status: 200,
      'content-type': 'application/json',
      body,
    };
  } catch (e) {
    log.error(`An error occurred: ${e.message}`, e);
    return { status: 500, body: e.message };
  }
}

module.exports = indexHtml;
