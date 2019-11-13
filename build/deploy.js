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
const yargs = require('yargs');
const glob = require('glob');
const semver = require('semver');
const chalk = require('chalk');
const pkgJson = require('../package.json');

require('dotenv').config();

const log = {
  debug: console.error,
  info: console.error,
  warn: console.error,
  error: console.error,
};

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
          log.warn(`${chalk.yellow('warn:')} unable to create version sequences. error while parsing version: ${version}`);
          return;
        }
        sfx.push(`v${s.major}`);
        break;
      case 'minor':
        if (!s) {
          log.warn(`${chalk.yellow('warn:')} unable to create version sequences. error while parsing version: ${version}`);
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

  withPackageName(value) {
    this.pkgName = value;
    return this;
  }

  withDeploy(value) {
    this.doDeploy = value;
    return this;
  }

  withClean(value) {
    this.doClean = value;
    return this;
  }

  withBuild(value) {
    this.doBuild = value;
    return this;
  }

  withLinks(value) {
    this.links = value;
    return this;
  }

  withLinksPackage(value) {
    this.linksPackage = value;
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

    // eslint-disable-next-line no-template-curly-in-string
    this.pkgName = this.pkgName.replace('${version}', this.version);
  }

  async clean() {
    log.info('clean\n-------------------------------');
    await new CleanCommand(log).withTargetDir(this.target)
      .run();
  }

  async package() {
    log.info('\npackage\n-------------------------------');
    const cmd = new PackageCommand(log)
      .withOnlyModified(false)
      .withTarget(this.target)
      .withFiles(['src/*.js']);
    await cmd.run();
  }

  async deploy() {
    log.info('\ndeploy\n-------------------------------');
    await this.ow.packages.update({
      name: this.pkgName,
      package: {
        publish: true,
      },
    });
    log.info(chalk`created: {yellow ${this.pkgName}}`);

    const deployBundle = async (info) => {
      const action = await fse.readFile(info.zipFile);
      const actionoptions = {
        name: `${this.pkgName}/${info.name}`,
        action,
        kind: 'nodejs:10',
        annotations: { 'web-export': true },
      };
      log.info(chalk` {grey upload:} {grey ${path.basename(info.zipFile)}}`);
      await this.ow.actions.update(actionoptions);
      log.info(chalk`created: {yellow ${actionoptions.name}}`);
    };

    await Promise.all(this.scriptInfos.map(deployBundle));
  }

  async link() {
    log.info('\nlink\n-------------------------------');
    const linksPkg = this.linksPackage;
    await this.ow.packages.update({
      name: linksPkg,
      package: {
        publish: true,
      },
    });
    log.info(chalk`created: {yellow ${linksPkg}}`);

    const links = getLinkVersions(this.links, this.version);
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
          log.info(chalk`{green 'ok:'} created sequence {yellow /${result.namespace}/${result.name}} -> {yellow ${fqn}}`);
        } catch (e) {
          hasErrors = true;
          log.error(chalk`{red 'error:'} failed creating sequence: ${e.message}`);
        }
      }));
      if (hasErrors) {
        throw new Error('Aborting due to errors during sequence updates.');
      }
    };

    await Promise.all(this.scriptInfos.map(linkAction));
  }

  async run() {
    let result = '';
    await this.init();
    if (this.doBuild) {
      if (this.doClean) {
        await this.clean();
      }
      await this.package();
    }

    // get the list of scripts from the info files
    const infos = [...glob.sync(`${this.target}/**/*.info.json`)];
    this.scriptInfos = (await Promise.all(infos.map((info) => fse.readJSON(info))))
      .filter((info) => info.zipFile);

    if (infos.length === 0) {
      log.info(chalk`{yellow warn:} No bundles to deploy or link.`);
      return result;
    }

    if (this.doDeploy) {
      await this.deploy();
      result = JSON.stringify({
        name: `Release ${this.version}`,
        url: `/${this.namespace}/${this.pkgName}`,
      }, null, 2);
    }

    if (this.links.length > 0) {
      await this.link();
    }
    log.info(chalk`{green done}`);
    return result;
  }
}

const argv = yargs()
  .pkgConf('wsk')
  .option('pkgVersion', {
    description: 'Version use in the embedded package.json.',
    default: pkgJson.version,
  })
  .option('package.name', {
    description: 'OpenWhisk package name.',
    type: 'string',
  })
  .option('version-link', {
    alias: 'l',
    description: 'Create symlinks (sequences) after deployment',
    type: 'string',
    array: true,
    choices: ['latest', 'major', 'minor', 'ci'],
    default: [],
  })
  .option('deploy', {
    alias: 'd',
    description: 'Automatically deploy to OpenWhisk',
    type: 'boolean',
    default: false,
  })
  .option('build', {
    alias: 'b',
    description: 'Build the deployment package',
    type: 'boolean',
    default: false,
  })
  .option('clean', {
    description: 'Clean the dist package',
    type: 'boolean',
    default: true,
  })
  .option('linkPackage', {
    description: 'Package name for version links',
    type: 'string',
  })
  .parse(process.argv.slice(2));

new Deploy()
  .withVersion(argv.pkgVersion)
  .withPackageName(argv.package.name)
  .withDeploy(argv.deploy)
  .withClean(argv.clean)
  .withBuild(argv.build)
  .withLinks(argv.versionLink)
  .withLinksPackage(argv.linksPackage)
  .run()
  .then(console.log)
  .catch((error) => {
    log.error(error);
    process.exit(1);
  });
