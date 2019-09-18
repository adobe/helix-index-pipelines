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
const request = require('request-promise-native')

module.exports.main = async (context, action) => {
  const { owner, repo, ref, path} = action.request.params;
  const url =
    `https://github.com/${owner}/${repo}/raw/${ref}/${path}`;

  const response = await request({
    url: `https://helix-index-image.cognitiveservices.azure.com/vision/v1.0/analyze?visualFeatures=Tags,Description,ImageType,Color,Faces&details=Landmarks&language=en`,
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': action.secrets.AZURE_COMPUTERVISION_KEY
    },
    json: true,
    body: {
      url
    }
  });


  if (!context.response) {
    context.response = {};
  }
  context.response.body = {
    tags: response.description.tags,
    ...response.metadata,
    value: response.description.captions[0].text,
    ...response.color
  };

  return context;
}