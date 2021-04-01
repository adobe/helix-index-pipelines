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
/* eslint-disable no-unused-expressions */

const path = require('path');
const querystring = require('querystring');
const fse = require('fs-extra');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { createTargets } = require('./post-deploy-utils.js');
const { version } = require('../package.json');

chai.use(chaiHttp);
const { expect } = chai;

createTargets()
  .forEach((target) => {
    describe(`Post-Deploy Tests (${target.title()})`, () => {
      it('Service responds to healthcheck', async () => {
        const url = `${target.urlPath()}/_status_check/healthcheck.json`;
        await chai.request(target.host())
          .get(url)
          .then((response) => {
            expect(response).to.have.status(200);
            expect(response).to.be.json;
            delete response.body.response_time;
            delete response.body.process;
            expect(response.body).to.eql({
              status: 'OK',
              // somehow the status check creates a weird version for ci builds.
              version: process.env.CIRCLE_BUILD_NUM ? `0.0.0+ci${process.env.CIRCLE_BUILD_NUM}` : version,
            });
          })
          .catch((e) => {
            e.message = `At ${url}\n      ${e.message}`;
            throw e;
          });
      }).timeout(30000);

      it('Service can index our own page', async () => {
        const expected = await fse.readJson(path.resolve(__dirname, 'specs', 'example-post.json'));
        const url = `${target.urlPath()}?${querystring.stringify({
          owner: 'adobe',
          repo: 'helix-index-pipelines',
          ref: 'main',
          path: '/test/specs/example-post.html',
        })}`;
        await chai.request(target.host())
          .get(url)
          .then((response) => {
            expect(response).to.have.status(200);
            expect(response).to.be.json;
            const { body } = response;

            // source hash is currently computed based on the `ref` of the content, which is not
            // very stable. so we just mask it here
            body['blog-posts'].docs[0].sourceHash = 'xxx';
            body['blog-posts-flat'].docs[0].sourceHash = 'xxx';
            expect(body).to.eql(expected);
          })
          .catch((e) => {
            e.message = `At ${url}\n      ${e.message}`;
            throw e;
          });
      }).timeout(30000);

      it('Service returns a 404 for unknown resource', async () => {
        const url = `${target.urlPath()}?${querystring.stringify({
          owner: 'adobe',
          repo: 'helix-index-pipelines',
          ref: 'main',
          path: '/notfound.html',
        })}`;
        await chai.request(target.host())
          .get(url)
          .then((response) => {
            expect(response).to.have.status(200);
            expect(response).to.be.json;
            expect(response.body).to.eql({
              'blog-posts': {
                error: {
                  reason: '<!doctype html>\n<html lang="en">\n  <head>\n    <title>Resource not found</title>\n    <!-- Required me...',
                  status: 404,
                },
              },
              'blog-posts-flat': {
                error: {
                  reason: '<!doctype html>\n<html lang="en">\n  <head>\n    <title>Resource not found</title>\n    <!-- Required me...',
                  status: 404,
                },
              },
            });
          })
          .catch((e) => {
            e.message = `At ${url}\n      ${e.message}`;
            throw e;
          });
      }).timeout(20000);
    });
  });
