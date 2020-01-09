# [2.0.0](https://github.com/adobe/helix-index-pipelines/compare/v1.1.0...v2.0.0) (2020-01-09)


### Features

* **index:** add support for extracting words for teaser ([e340386](https://github.com/adobe/helix-index-pipelines/commit/e34038680f2f2f54fb437a87d400a6421b3499b0)), closes [#37](https://github.com/adobe/helix-index-pipelines/issues/37)


### BREAKING CHANGES

* **index:** new helix-index.yaml format

- the property can be single or multi value, based on the name:
  `value` creates a single value property,
  `values` creates an array.

  eg:

  ```
  properties:
    title:
      select: main > .title
      value: textContent(el)
    topics:
      select: main > .topic
      values: textContent(el)
  ```

- the `value` or `values` epression is now a proper javascript like
  expression, using [jesp](http://jsep.from.so/) to parse the tree
  it supports functions, literals and variables so far. eg:

  ```
    value: words(textContent(el), 0, 10)
  ```

- the _variable context_ for the expression evaluation currently
  contains: `el`, `logger` and all the helper functions:
  `parseTimestamp`, `attribute`, `textContent`, `match`, `words`.

- the helper functions receive the arguments as specified (no, `element`
  injection) and need to return an result array.

- the `context.el` is an array containing the results of the
  `document.querySelectorAll()` of the proprties `select` expression.
  this allows to build more complext helpers that can operate on
  multiple elements. like extracting the words from multiple paragraphs.

# [1.1.0](https://github.com/adobe/helix-index-pipelines/compare/v1.0.13...v1.1.0) (2020-01-07)


### Features

* **regex:** Add a regex match operator for indexing ([93a2422](https://github.com/adobe/helix-index-pipelines/commit/93a24223ebf977943864576334f8696927271665))
* **regex:** Add a regex match operator for indexing ([0f46cd7](https://github.com/adobe/helix-index-pipelines/commit/0f46cd79bc51b68613406e043eef02217daedccb))
* **regex:** Add a regex match operator for indexing ([df3bcd0](https://github.com/adobe/helix-index-pipelines/commit/df3bcd0e7861570bf1db5db664b0ef8f996ca856))
* **regex:** Add a regex match operator for indexing ([4c499ca](https://github.com/adobe/helix-index-pipelines/commit/4c499ca412eebcec567236db3db94675363a5aa1))

## [1.0.13](https://github.com/adobe/helix-index-pipelines/compare/v1.0.12...v1.0.13) (2020-01-07)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v7.0.1 ([#36](https://github.com/adobe/helix-index-pipelines/issues/36)) ([5bd1877](https://github.com/adobe/helix-index-pipelines/commit/5bd18776f2f25d41ee592de5cd35c8f7cd24dfe0))

## [1.0.12](https://github.com/adobe/helix-index-pipelines/compare/v1.0.11...v1.0.12) (2020-01-07)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v7 ([#35](https://github.com/adobe/helix-index-pipelines/issues/35)) ([731783c](https://github.com/adobe/helix-index-pipelines/commit/731783c084e9e7362cb620d5dab2bb77bfbe43f7))

## [1.0.11](https://github.com/adobe/helix-index-pipelines/compare/v1.0.10...v1.0.11) (2019-12-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-pipeline to v6.1.5 ([447fd47](https://github.com/adobe/helix-index-pipelines/commit/447fd47b214b76295c0e60abca0c2956a2e3465f))

## [1.0.10](https://github.com/adobe/helix-index-pipelines/compare/v1.0.9...v1.0.10) (2019-12-17)


### Bug Fixes

* **deps:** update [@adobe](https://github.com/adobe) ([c843e70](https://github.com/adobe/helix-index-pipelines/commit/c843e707976ac03c66b4f2d0ca2326eee50f7626))

## [1.0.9](https://github.com/adobe/helix-index-pipelines/compare/v1.0.8...v1.0.9) (2019-12-13)


### Bug Fixes

* **deps:** update dependency @adobe/helix-pipeline to v6.1.2 ([0587252](https://github.com/adobe/helix-index-pipelines/commit/0587252d206b10fe6fbf7914a3fd86c0280459e9))

## [1.0.8](https://github.com/adobe/helix-index-pipelines/compare/v1.0.7...v1.0.8) (2019-11-19)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v6.0.7 ([b2700f6](https://github.com/adobe/helix-index-pipelines/commit/b2700f6e162a94916f5659aefea4906a67fbe911))

## [1.0.7](https://github.com/adobe/helix-index-pipelines/compare/v1.0.6...v1.0.7) (2019-11-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v6.0.6 ([590397e](https://github.com/adobe/helix-index-pipelines/commit/590397e8983b2637682c51887706d5cc2b547619))

## [1.0.6](https://github.com/adobe/helix-index-pipelines/compare/v1.0.5...v1.0.6) (2019-11-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-pipeline to v6.1.0 ([#15](https://github.com/adobe/helix-index-pipelines/issues/15)) ([dadfd2f](https://github.com/adobe/helix-index-pipelines/commit/dadfd2f6016fca0ef5be164f504b0d53cf2cf23f))

## [1.0.5](https://github.com/adobe/helix-index-pipelines/compare/v1.0.4...v1.0.5) (2019-11-18)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v6.0.5 ([#11](https://github.com/adobe/helix-index-pipelines/issues/11)) ([12efd44](https://github.com/adobe/helix-index-pipelines/commit/12efd44b183174c8ea4cfde4d8970982187dfd27))

## [1.0.4](https://github.com/adobe/helix-index-pipelines/compare/v1.0.3...v1.0.4) (2019-11-14)


### Bug Fixes

* **deps:** update dependency @adobe/helix-cli to v6.0.2 ([873fe63](https://github.com/adobe/helix-index-pipelines/commit/873fe635e72aa46773a1221ec3fa485643d2618f))

## [1.0.3](https://github.com/adobe/helix-index-pipelines/compare/v1.0.2...v1.0.3) (2019-11-13)


### Bug Fixes

* **deploy:** improve deployment script ([cb1aaed](https://github.com/adobe/helix-index-pipelines/commit/cb1aaed086eef77a016c9805b5fc01c9c5a200a3))

## [1.0.2](https://github.com/adobe/helix-index-pipelines/compare/v1.0.1...v1.0.2) (2019-11-13)


### Bug Fixes

* **deploy:** improve deployment script ([237f4d0](https://github.com/adobe/helix-index-pipelines/commit/237f4d0afba4789b580ac4a17fe9da59dcbf7f7b))

## [1.0.1](https://github.com/adobe/helix-index-pipelines/compare/v1.0.0...v1.0.1) (2019-11-13)


### Bug Fixes

* **deploy:** improve deployment script ([ded37a7](https://github.com/adobe/helix-index-pipelines/commit/ded37a7f35127071f7ebedf178dbf965583907e3))

# 1.0.0 (2019-11-13)


### Bug Fixes

* **ci:** add deployment scripts ([#5](https://github.com/adobe/helix-index-pipelines/issues/5)) ([85dde3e](https://github.com/adobe/helix-index-pipelines/commit/85dde3e14489e9dc8d493aca25b7a0d065c8e30e))
* **deploy:** trigger release ([b34b6a1](https://github.com/adobe/helix-index-pipelines/commit/b34b6a1a7f36550072b76919f26d07737d2a5a6f))
* **deploy:** trigger release ([77054ce](https://github.com/adobe/helix-index-pipelines/commit/77054ce0ffb3dd85ae5f05faa4961b47e0d3b541))
* **deploy:** trigger release ([fb18c5b](https://github.com/adobe/helix-index-pipelines/commit/fb18c5b7e9370bf42a05986f11dab018d0bc1d3a))
* **deps:** update any ([#4](https://github.com/adobe/helix-index-pipelines/issues/4)) ([0f64c2e](https://github.com/adobe/helix-index-pipelines/commit/0f64c2e66b74c92b2e2419be17d1704a3f927abf))
* **index:** rename fragmentId to fragmentID ([0cf3efe](https://github.com/adobe/helix-index-pipelines/commit/0cf3efe1a78de8f42289a225093fc9af2227a454))


### Features

* **images:** add pipeline for image indexing (jpg only, so far) ([12c20b1](https://github.com/adobe/helix-index-pipelines/commit/12c20b1696e7c81524c3c0571214c4c317f74600))
* **index:** add images to document metadata ([8a98fa2](https://github.com/adobe/helix-index-pipelines/commit/8a98fa2f05c263d80fa82985ebd07085b385e632))
* **index:** create index fragments for sections, images, paragraphs ([26a0f14](https://github.com/adobe/helix-index-pipelines/commit/26a0f1456bc7554df21c490d9223702babbde434))
* **index:** index html pages ([692414a](https://github.com/adobe/helix-index-pipelines/commit/692414a1163d62d7e4b441f12507fdded9a5f932))
* **index:** index html pages ([a6711bc](https://github.com/adobe/helix-index-pipelines/commit/a6711bc5f5fffbfd24b3d0a9cb78b2159d5ac434))
* **index:** index html pages - use fixed package ([f8bdf1f](https://github.com/adobe/helix-index-pipelines/commit/f8bdf1fcd5c5d85719d4a4876b80f0f52f1c909e))
* **markdown:** ultra-simple markdown pipeline, only gets metadata ([43b1007](https://github.com/adobe/helix-index-pipelines/commit/43b1007f19768c846731be17f85e99b70b50ff76))
