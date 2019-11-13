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

/* eslint-env mocha */

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const fse = require('fs-extra');
const request = require('request-promise-native');
const UpCommand = require('@adobe/helix-cli/src/up.cmd');

async function createTestRoot() {
  const dir = path.resolve(__dirname, 'tmp', crypto.randomBytes(16).toString('hex'));
  await fse.ensureDir(dir);
  return dir;
}

async function eventPromise(emitter, name) {
  return new Promise((resolve) => {
    emitter.on(name, resolve);
  });
}

describe('Markdown Indexing', () => {
  let testRoot;

  before(async () => {
    testRoot = await createTestRoot();
  });

  after(async () => {
    await fse.remove(testRoot);
  });

  it('Run md_json', async () => {
    const expected = await fse.readJson(path.resolve(__dirname, 'specs', 'readme_md.json'));
    const up = new UpCommand()
      .withFiles(['src/*.js'])
      .withLocalRepo(['.'])
      .withTargetDir(testRoot);
    const stated = eventPromise(up, 'started');
    const stopped = eventPromise(up, 'stopped');
    try {
      await up.run();
      await stated;

      const json = await request.get(`http://localhost:${up.project.server.port}/README.md.json`, {
        json: true,
      });
      assert.deepEqual(json, expected);
    } finally {
      await up.stop();
      await stopped;
    }
  }).timeout(5000);
});
