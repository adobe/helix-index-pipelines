/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const querystring = require('querystring');

function retrofit(fn) {
  const resolver = {
    createURL({ package, name, version }) {
      return new URL(`https://adobeioruntime.net/api/v1/web/helix/${package}/${name}@${version}`);
    },
  };
  return async (params = {}, env = {}) => {
    const resp = await fn({
      url: `https://content-proxy.com/proxy?${querystring.encode(params)}`,
      headers: new Map(Object.entries(params.__ow_headers || {})),
    }, {
      resolver,
      env,
    });
    let body = await resp.buffer();
    if (resp.headers.get('content-encoding') !== 'gzip') {
      body = body.toString('utf-8');
    }
    return {
      statusCode: resp.status,
      body,
      headers: resp.headers.plain(),
    };
  };
}

module.exports = { retrofit };
