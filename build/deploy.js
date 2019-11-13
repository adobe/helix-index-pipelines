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
/* eslint-disable no-console,import/no-extraneous-dependencies */

const path = require('path');
const fse = require('fs-extra');
const PackageCommand = require('@adobe/helix-cli/src/package.cmd');
const CleanCommand = require('@adobe/helix-cli/src/clean.cmd');
const openwhisk = require('openwhisk');
const glob = require('glob');
const semver = require('semver');
const chalk = require('chalk');
const pkgJson = require('../package.json');

require('dotenv').config();

function getLinkVersions(links, version) {
  const s = semver.parse(version);
  const sfx = [];
  links.forEach((link) => {
    switch (link) {
      case 'latest':
        sfx.push('latest');
        break;
      case 'ci':
        sfx.push('ci');
        break;
      case 'major':
        if (!s) {
          console.warn(`${chalk.yellow('warn:')} unable to create version sequences. error while parsing version: ${version}`);
          return;
        }
        sfx.push(`v${s.major}`);
        break;
      case 'minor':
        if (!s) {
          console.warn(`${chalk.yellow('warn:')} unable to create version sequences. error while parsing version: ${version}`);
          return;
        }
        sfx.push(`v${s.major}.${s.minor}`);
        break;
      default:
        throw new Error(`Unsupported link type: ${link}`);
    }
  });
  return sfx;
}

class Deploy {
  withVersion(version) {
    this.version = version;
    return this;
  }

  async init() {
    this.namespace = process.env.WSK_NAMESPACE || 'helix-index';
    this.ow = openwhisk({
      apihost: process.env.WSK_HOST || 'adobeioruntime.net',
      api_key: process.env.WSK_AUTH,
      namespace: this.namespace,
    });
    this.target = path.resolve(process.cwd(), 'dist');

    // get the list of scripts from the info files
    const infos = [...glob.sync(`${this.target}/**/*.info.json`)];
    this.scriptInfos = (await Promise.all(infos.map((info) => fse.readJSON(info))))
      .filter((info) => info.zipFile);
    if (!this.version) {
      this.version = pkgJson.version;
    }

    // eslint-disable-next-line no-template-curly-in-string
    this.pkgName = pkgJson.wsk.package.name.replace('${version}', this.version);
  }

  async clean() {
    console.log('clean\n-------------------------------');
    await new CleanCommand().withTargetDir(this.target)
      .run();
  }

  async package() {
    console.log('\npackage\n-------------------------------');
    const cmd = new PackageCommand()
      .withOnlyModified(false)
      .withTarget(this.target)
      .withFiles(['src/*.js']);
    await cmd.run();
  }

  async deploy() {
    console.log('\ndeploy\n-------------------------------');
    await this.ow.packages.update({
      name: this.pkgName,
      package: {
        publish: true,
      },
    });
    console.log(chalk`created: {yellow ${this.pkgName}}`);

    const deployBundle = async (info) => {
      const actionoptions = {
        name: `${this.pkgName}/${info.name}`,
        action: await fse.readFile(info.zipFile),
        kind: 'nodejs:10',
        annotations: { 'web-export': true },
      };
      await this.ow.actions.update(actionoptions);
      console.log(chalk`created: {yellow ${actionoptions.name}}`);
    };

    await Promise.all(this.scriptInfos.map(deployBundle));
  }

  async link() {
    console.log('\nlink\n-------------------------------');
    const linksPkg = pkgJson.wsk.linksPackage;
    await this.ow.packages.update({
      name: linksPkg,
      package: {
        publish: true,
      },
    });
    console.log(chalk`created: {yellow ${linksPkg}}`);

    const links = getLinkVersions(['major', 'minor', 'latest'], pkgJson.version);
    const linkAction = async (info) => {
      const annotations = [{
        key: 'exec',
        value: 'sequence',
      }, {
        key: 'web-export',
        value: true,
      }, {
        key: 'raw-http',
        value: false,
      }, {
        key: 'final',
        value: true,
      }];

      const fqn = `/${this.namespace}/${this.pkgName}/${info.name}`;
      let hasErrors = false;
      await Promise.all(links.map(async (sf) => {
        const options = {
          name: `${linksPkg}/${info.name}@${sf}`,
          action: {
            name: `${linksPkg}/${info.name}@${sf}`,
            exec: {
              kind: 'sequence',
              components: [fqn],
            },
            annotations,
          },
        };

        try {
          const result = await this.ow.actions.update(options);
          console.log(chalk`{green 'ok:'} created sequence {yellow /${result.namespace}/${result.name}} -> {yellow ${fqn}}`);
        } catch (e) {
          hasErrors = true;
          console.error(chalk`{red 'error:'} failed creating sequence: ${e.message}`);
        }
      }));
      if (hasErrors) {
        throw new Error('Aborting due to errors during sequence updates.');
      }
    };

    await Promise.all(this.scriptInfos.map(linkAction));
  }

  async run() {
    await this.init();
    await this.clean();
    await this.package();
    await this.deploy();

    // do not link for ci
    if (!this.version.startsWith('ci@')) {
      await this.link();
    }
  }
}

const version = process.argv[2] || pkgJson.version;

new Deploy().withVersion(version).run().catch((error) => {
  console.error(error);
  process.exit(1);
});
