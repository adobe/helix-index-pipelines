# helix-index-pipelines

Content extraction pipelines for indexing Project Helix websites

## Status
[![codecov](https://img.shields.io/codecov/c/github/adobe/helix-index-pipelines.svg)](https://codecov.io/gh/adobe/helix-index-pipelines)
[![CircleCI](https://img.shields.io/circleci/project/github/adobe/helix-index-pipelines.svg)](https://circleci.com/gh/adobe/helix-index-pipelines)
[![GitHub license](https://img.shields.io/github/license/adobe/helix-index-pipelines.svg)](https://github.com/adobe/helix-index-pipelines/blob/main/LICENSE.txt)
[![GitHub issues](https://img.shields.io/github/issues/adobe/helix-index-pipelines.svg)](https://github.com/adobe/helix-index-pipelines/issues)
[![LGTM Code Quality Grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/adobe/helix-index-pipelines.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/adobe/helix-index-pipelines)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Installation

The following components are required before installation:

1. A GitHub repository with your `helix-query.yaml` configuration

If all of this is given, deploy the OpenWhisk action in a package of your choice. For more
information on the parameters expected by the action, see the next section.

## Usage

The following parameters should be passed when invoking the action:
- `owner`: GitHub repository owner
- `repo`: GitHub repository name
- `ref`: GitHub repository reference or branch
- `path`: path to the HTML document to be indexed

Note: the first three parameters also determine the location where the `helix-query.yaml` configuration file is downloaded from.

## Reference

In your `helix-query.yaml` <sup>[1](#footnote1)</sup>, you can define one or more index definitions. A sample index definition looks as follows:

```
indices:
  mysite:
    source: html
    fetch: https://{ref}--{repo}--{owner}.project-helix.page/{path}
    properties:
      author:
        select: main > div:nth-of-type(3) > p:nth-of-type(1)
        value: |
          match(el, 'by (.*)')
```

The `select` property is a CSS selector that grabs HTML elements out of your document. To verify that a CSS selector entered
is selecting what you expect, you can test it in your browser's Javascript console, e.g. for the `author` selector shown above,
enter the following expression:
```
document.querySelectorAll('main > div:nth-of-type(3) > div > p:nth-of-type(1)');
```

The `value` property contains an expression to apply to all HTML elements selected. That expression can contain
a combination of functions and variables:

### innerHTML(el)

Returns the HTML content of an element.

### textContent(el)

Returns the text content of the selected element, and all its descendents.

### attribute(el, name)

Returns the value of the attribute with the specified name of an element.

### match(el, re)

Matches a regular expression containing parentheses to capture items in the passed element.
In the `author` example above, the actual contents of the `<p>` element selected might
contain `by James Brown`, so it would capture everything following `by `.

### words(el, start, end)

Useful for teasers, this selects a range of words out of an HTML element.

### replace(el, substr, newSubstr)

Replaces all occurrences of a substring in a text with a replacement.

### parseTimestamp(el, format)

Parses a timestamp given as string, and returns its value as number of seconds since 1 Jan 1970.

### path

Returns the path of the HTML document being indexed.

### headers[name]

Returns the value of the HTTP response header with the specified name, at the time the HTML document was fetched.


<a name="footnote1">[1]</a>: The full definition of the `helix-query.yaml` is available here: https://github.com/adobe/helix-shared/blob/main/docs/indexconfig.md