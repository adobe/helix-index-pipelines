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
const nock = require('nock');
const proxyquire = require('proxyquire');
const p = require('path');
const crypto = require('crypto');
const fse = require('fs-extra');
const request = require('request-promise-native');
const url = require('url');
const UpCommand = require('@adobe/helix-cli/src/up.cmd');

const SPEC_ROOT = p.resolve(__dirname, 'specs');

async function createTestRoot() {
  const dir = p.resolve(__dirname, 'tmp', crypto.randomBytes(16).toString('hex'));
  await fse.ensureDir(dir);
  return dir;
}

async function eventPromise(emitter, name) {
  return new Promise((r) => {
    emitter.on(name, r);
  });
}

describe('HTML Indexing with hlx up', () => {
  let testRoot;

  before(async () => {
    testRoot = await createTestRoot();
    nock('https://github.com--adobe--helix-index-pipelines-helix.project-helix.page')
      .get((uri) => uri.startsWith('/test/specs/hlx_up'))
      .reply(200, (uri) => {
        const path = p.resolve(SPEC_ROOT, 'hlx_up', p.basename(uri).replace(/\.md$/, '.html'));
        return fse.readFile(path, 'utf-8');
      })
      .persist();
  });

  after(async () => {
    await fse.remove(testRoot);
  });

  it('Run html_json', async () => {
    const up = new UpCommand()
      .withFiles(['src/*.js'])
      .withLocalRepo(['.'])
      .withHttpPort(0)
      .withTargetDir(testRoot);

    const started = eventPromise(up, 'started');
    const stopped = eventPromise(up, 'stopped');
    try {
      await up.run();
      await started;

      const expected = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'post_html.json'));
      const json = await request.get(`http://localhost:${up.project.server.port}/test/specs/hlx_up/post.html.json`, {
        json: true,
      });
      assert.deepEqual(json, expected);

      const expected1 = await fse.readJson(p.resolve(SPEC_ROOT, 'hlx_up', 'post1_html.json'));
      const json1 = await request.get(`http://localhost:${up.project.server.port}/test/specs/hlx_up/post1.html.json`, {
        json: true,
      });
      assert.deepEqual(json1, expected1);
    } finally {
      await up.stop();
      await stopped;
    }
  }).timeout(10000);
});

/**
 * Create error that is actually an object
 */
function createError(statusCode, message) {
  return ({
    name: 'StatusCodeError',
    statusCode,
    message,
  });
}

/**
 * Proxy our pipeline action and its requirements.
 */
const { main } = proxyquire('../src/html_json.js', {
  'request-promise-native': (args) => (new Promise((resolve, reject) => {
    const file = p.resolve(SPEC_ROOT, url.parse(args.url).pathname.substr(1)).replace(/\.md$/, '.html');
    if (fse.pathExistsSync(file)) {
      fse.readFile(file, 'utf-8', (error, result) => {
        if (error) {
          reject(createError(500, `Unable to load file ${file}: ${error.message}`));
        } else {
          resolve(result);
        }
      });
      return;
    }
    reject(createError(404, `Unable to find file: ${file}`));
  })),
});

/**
 * Action replacement.
 */
const action = {
  downloader: {
    fetchGithub: async ({ path }) => {
      const file = p.resolve(SPEC_ROOT, '..', '..', path.substr(1));
      if (await fse.pathExists(file)) {
        return {
          status: 200,
          body: await fse.readFile(file, 'utf8'),
        };
      }
      return { status: 404 };
    },
  },
  request: {},
  logger: console,
};
describe('HTML Indexing with local file system', () => {
  const params = {
    owner: 'foo',
    repo: 'bar',
    ref: 'baz',
  };
  const dir = p.resolve(SPEC_ROOT, 'local');
  fse.readdirSync(dir).forEach((filename) => {
    if (filename.endsWith('.html')) {
      const basename = p.basename(filename);
      const expected = fse.readJSONSync(p.resolve(dir, `${basename.replace(/\./, '_')}.json`), 'utf8');
      it(`Testing ${filename} locally`, async () => {
        action.request.params = { path: `/local/${basename}`, ...params };
        const result = await main(null, action);
        const { response: { body: actual } } = result;
        assert.deepEqual(actual, expected);
      });
    }
  });

  it('Rejecting promise in request-promise-native returns an error object', async () => {
    action.request.params = { path: '/local/does-not-exist.md', ...params };
    const { response: { body } } = await main(null, action);
    assert.notEqual(body['blog-posts'], null);
    assert.equal(body['blog-posts'].docs, null);
    assert.equal(body['blog-posts'].error.status, 404);
    assert.notEqual(body['blog-posts-flat'], null);
    assert.equal(body['blog-posts-flat'].docs, null);
    assert.equal(body['blog-posts-flat'].error.status, 404);
  });
});
