/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */

const assert = require('assert');
const fs = require('fs-extra');
const YAML = require('yaml');
const { main } = require('../src/html_json');

async function loadConfigFromFile(path) {
  const source = await fs.readFile(path, 'utf8');
  const document = YAML.parseDocument(source);
  return document.toJSON() || {};
}

describe('HTML Indexing', () => {
  it('Find custom faceted attributes', async () => {
    const config = await loadConfigFromFile('test/index.yaml');
    const indexname = Object.keys(config.indices)[0];
    const indexconfig = config.indices[indexname];

    const customAttributes = Object.keys(indexconfig.properties)
      .filter((name) => indexconfig.properties[name].faceted);
    const attributesForFacetting = [...customAttributes];
    assert.deepEqual(attributesForFacetting, ['author']);
  });

  it('Run html_json', async () => {
    const output = await main({}, {
      request: {
        params: {
          owner: 'anfibiacreativa',
          repo: 'helix-norddal',
          ref: 'master',
          path: 'posts/new-to-max.html',
        },
      },
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2));
  });
});
