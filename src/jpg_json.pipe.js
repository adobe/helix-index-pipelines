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
const { Pipeline } = require('@adobe/helix-pipeline/index.js');
const { log } = require('@adobe/helix-pipeline/src/defaults/default');

const type = require('@adobe/helix-pipeline/src/utils/set-content-type.js');
const production = require('@adobe/helix-pipeline/src/utils/is-production.js');
const dump = require('@adobe/helix-pipeline/src/utils/dump-context.js');
const validate = require('@adobe/helix-pipeline/src/utils/validate.js');
const emit = require('@adobe/helix-pipeline/src/json/emit-json.js');
const { selectStatus } = require('@adobe/helix-pipeline/src/json/set-json-status.js');
const timing = require('@adobe/helix-pipeline/src/utils/timing');

/* eslint newline-per-chained-call: off */

const jsonpipe = (cont, context, action) => {
  action.logger = action.logger || log;
  action.logger.log('debug', 'Constructing JSON Pipeline');
  const pipe = new Pipeline(action);
  const timer = timing();
  pipe
    .every(dump.record)
    .every(validate).when((ctx) => !production() && !ctx.error)
    .every(timer.update)
    .use(cont)
    .use(emit).expose('json')
    .use(type('application/json'))
    .use(timer.report)
    .error(dump.report)
    .error(selectStatus(production()));

  action.logger.log('debug', 'Running JSON pipeline');
  return pipe.run(context);
};

module.exports.pipe = jsonpipe;