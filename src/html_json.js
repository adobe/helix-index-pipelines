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

const { fetch } = process.env.HELIX_FETCH_FORCE_HTTP1
  ? fetchAPI.context({ alpnProtocols: [fetchAPI.ALPN_HTTP1_1] })
  /* istanbul ignore next */
  : fetchAPI;

const helpers = {
  parseTimestamp: (elements, format) => {
    if (!elements) {
      return [];
    }
    if (!Array.isArray(elements)) {
      // eslint-disable-next-line no-param-reassign
      elements = [elements];
    }
    return elements.map((el) => {
      const content = typeof el === 'string' ? el : el.textContent;
      const millis = moment.utc(content, format).valueOf();
      return millis / 1000;
    });
  },
  attribute: (elements, name) => elements.map((el) => el.getAttribute(name)),
  textContent: (elements) => elements.map((el) => el.textContent),
  innerHTML: (elements) => elements.map((el) => el.innerHTML),
  match: (elements, re) => {
    // todo: maybe base on function ?
    const result = [];
    const regex = new RegExp(re, 'g');
    elements.forEach((el) => {
      let m;
      const content = typeof el === 'string' ? el : el.textContent;

      // eslint-disable-next-line no-cond-assign
      while ((m = regex.exec(content)) !== null) {
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
    owner, repo, ref, path, log,
  } = params;

  // Create our result where we'll store the HTML responses
  const result = Object.entries(indices)
    .filter(([, { source }]) => source === 'html')
    .reduce((prev, [name, index]) => {
      // eslint-disable-next-line no-param-reassign
      prev[name] = {
        index,
        url: index.fetch
          .replace(/\{owner\}/g, owner)
          .replace(/\{repo\}/g, repo)
          .replace(/\{ref\}/g, ref)
          .replace(/\{path\}/g, path)
          .replace(/(?<!:)\/\/+/g, '/'), // remove multiple slashes not preceded by colon
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

    let resp;
    let body;
    try {
      resp = await fetch(url, {
        headers: {
          'User-Agent': 'index-pipelines/html_json',
        },
        cache: 'no-store',
      });
      body = await resp.text();
    } catch (e) {
      resp = {
        ok: false,
        status: 500,
      };
      body = e.message;
    }
    if (!resp.ok) {
      const message = body < 100 ? body : `${body.substr(0, 100)}...`;
      log.warn(`Fetching ${url} failed: statusCode: ${resp.status}, message: '${message}'`);
      return [url, { error: { reason: message, status: resp.status } }];
    }
    return [url, { body, headers: resp.headers }];
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
      case 'MemberExpression': {
        const obj = vars[node.object.name];
        if (obj) {
          return obj.get(node.property.value);
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
 * @param {object} vars
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
 * @param {Object} headers
 * @param {Object} index
 * @param {Logger} log
 */
function indexSingle(path, document, headers, index, log) {
  const record = {
    fragmentID: '',
  };

  /* Walk through all index properties */
  Object.keys(index.properties).forEach((name) => {
    const { select, ...prop } = index.properties[name];
    const expression = prop.value || prop.values;
    // create an array of elements
    const elements = select !== 'none' ? Array.from(document.querySelectorAll(select)) : [];
    let value = getDOMValue(elements, expression, log, { path, headers }) || [];
    // concat for single value
    if (prop.value) {
      if (Array.isArray(value)) {
        value = value.length === 1 ? value[0] : value.join('');
      }
    }
    record[name] = value;
  });
  return record;
}

function indexGroup(/* path, document, headers, index */) {
  // TODO
  return [];
}

function evaluateHtml(body, headers, path, index, log) {
  const docs = [];
  const { document } = new JSDOM(body).window;
  if (index.group) {
    docs.push(...indexGroup(path, document, headers, index));
  } else {
    docs.push(indexSingle(path, document, headers, index, log));
  }
  return docs;
}

async function indexHtml(params) {
  const {
    owner, repo, ref, path, forceHttp1 = false,
    __ow_logger: log,
  } = params;

  const config = (await new IndexConfig()
    .withRepo(owner, repo, ref)
    .init()).toJSON();

  try {
    const htmlIndices = await fetchHTML({
      owner, repo, ref, path, log,
    }, config.indices);
    const result = {};
    Object.entries(htmlIndices)
      .reduce((prev, [name, { index, result: { error, body, headers } }]) => {
        if (error) {
          result[name] = { error };
        } else {
          result[name] = { docs: evaluateHtml(body, headers, path, index, log) };
        }
        return result;
      }, result);
    return {
      status: 200,
      'content-type': 'application/json',
      body: result,
    };
  } catch (e) {
    log.error(`An error occurred: ${e.message}`, e);
    return { status: 500, body: e.message };
  }
}

module.exports = indexHtml;
