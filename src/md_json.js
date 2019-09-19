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
const select = require('unist-util-select');
const string = require('mdast-util-to-string');

function indexnode(root, pattern, props) {
  return select.selectAll(pattern, root).map((node, index) => {
    return Object.keys(props).reduce((retval, propname) => {
      const funcorval = props[propname];
      if (typeof funcorval === 'function') {
        retval[propname] = props[propname](node);
      } else {
        retval[propname] = funcorval;
      }
      return retval;
    }, {
      fragmentID: `${pattern}[${index}]`
    });
  })
}

/**
 * The 'pre' function that is executed before the HTML is rendered
 * @param context The current context of processing pipeline
 * @param context.content The content
 */
async function main(context) {
  const full = context.content.mdast;
  const docs = [];

  try {
    // build an extra index of sections
    docs.push(...indexnode(full, 'section', {
      type: ({type}) => type,
      image: ({image}) => image,
      value: ({intro}) => intro,
      title: ({title}) => title,
      types: ({meta}) => meta.types
    }));
  } catch (e) {
    console.error(e);
  }

  try {
    // build an extra index of images linked from text
    docs.push(...indexnode(full, 'image', {
      type: 'imageref',
      image: ({url}) => url,
      value: ({alt}) => alt,
      title: ({title}) => title
    }));
  } catch (e) {
    console.error(e);
  }

  try {
    // build an extra index of full text paragraphs
    docs.push(...indexnode(full, 'paragraph, heading', {
      type: 'fulltext',
      value: (node) => string(node),
    }));
  } catch (e) {
    console.error(e);
  }

  const meta = {};

  try {
    Object.assign(meta, full.meta || select.select('section', full).meta);
  } catch (e) {
    console.error(e);
  }

  try {
    meta.title = full.title || select.select('section', full).title;
  } catch (e) {
    console.log(e);
  }
  try {
    meta.value = full.intro || select.select('section', full).intro;
  } catch (e) {
    console.log(e);
  }
  try {
    meta.image = full.image || select.select('section', full).image;
  } catch (e) {
    console.log(e);
  }
  try {
    meta.sections = select.selectAll('section', full).length;
  } catch (e) {
    console.log(e);
  }

  return {
    response: {
      body: {
        meta,
        docs
      },
    },
  };
}

module.exports.main = main;