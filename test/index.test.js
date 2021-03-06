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
process.env.HELIX_FETCH_FORCE_HTTP1 = 'true';

const assert = require('assert');
const nock = require('nock');
const p = require('path');
const fse = require('fs-extra');
const { main: universalMain } = require('../src/index.js');
const { retrofit } = require('./utils.js');

const main = retrofit(universalMain);
const SPEC_ROOT = p.resolve(__dirname, 'specs');

describe('HTML Indexing with hlx up', () => {
  before(async () => {
    nock('https://main--helix-index-pipelines--adobe.project-helix.page')
      .get((uri) => uri.startsWith('/test/specs/hlx_up'))
      .reply(200, (uri) => {
        const path = p.resolve(SPEC_ROOT, 'hlx_up', p.basename(uri).replace(/\.md$/, '.html'));
        return fse.readFile(path, 'utf-8');
      }, {
        'last-modified': 'Mon, 22 Feb 2021 15:28:00 GMT',
        server: 'nock',
      })
      .persist();
  });
  before(async () => {
    nock('https://raw.githubusercontent.com')
      .get((uri) => uri === '/adobe/helix-index-pipelines/main/helix-query.yaml')
      .replyWithFile(200, p.resolve(SPEC_ROOT, 'hlx_up', 'helix-query.yaml'))
      .persist();
  });

  it('Run html_json 1/2', async () => {
    const expected = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'post_html.json'));
    const resp = await main({
      owner: 'adobe',
      repo: 'helix-index-pipelines',
      ref: 'main',
      path: '/test/specs/hlx_up/post.html',
    });
    assert.deepEqual(JSON.parse(resp.body), expected);
  });

  it('Run html_json 2/2', async () => {
    const expected = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'post1_html.json'));
    const resp = await main({
      owner: 'adobe',
      repo: 'helix-index-pipelines',
      ref: 'main',
      path: '/test/specs/hlx_up/post1.html',
    });
    assert.deepEqual(JSON.parse(resp.body), expected);
  });

  it('Run html_json against non existing html', async () => {
    const expected = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'notfound.json'));
    const resp = await main({
      owner: 'adobe',
      repo: 'helix-index-pipelines',
      ref: 'main',
      path: '/test/specs/hlx_up/notfound.html',
    });
    const json = JSON.parse(resp.body);
    json['blog-posts'].error.reason = '*';
    json['blog-posts-flat'].error.reason = '*';
    assert.deepEqual(json, expected);
  });

  it('Run html_json against incomplete html', async () => {
    const expected = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'incomplete_html.json'));
    const resp = await main({
      owner: 'adobe',
      repo: 'helix-index-pipelines',
      ref: 'main',
      path: '/test/specs/hlx_up/incomplete.html',
    });
    const json = JSON.parse(resp.body);
    assert.deepEqual(json, expected);
  });
});
