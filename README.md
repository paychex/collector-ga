# @paychex/collector-ga

Provides a GoogleAnalytics collector for use with a [@paychex/core](https://github.com/paychex/core) Tracker.

## Installation

```bash
npm install @paychex/collector-ga
```

## Importing

### esm

```js
import { googleAnalytics } from '@paychex/collector-ga';
```

### cjs

```js
const { googleAnalytics } = require('@paychex/collector-ga');
```

### amd

```js
define(['@paychex/collector-ga'], function(collectors) { ... });
define(['@paychex/collector-ga'], function({ googleAnalytics }) { ... });
```

```js
require(['@paychex/collector-ga'], function(collectors) { ... });
require(['@paychex/collector-ga'], function({ googleAnalytics }) { ... });
```

### iife (browser)

```js
const { googleAnalytics } = window['@paychex/collector-ga'];
```

## Usage

Construct a new GoogleAnalytics collector for use in the `@paychex/core` Tracker by passing the global `ga` object to the factory function:

```js
import { trackers } from '@paychex/core';
import { googleAnalytics } from '@paychex/collector-ga';

import { createRequest, fetch } from '~/path/to/datalayer.js';

async function send(payload, operation) {
  // optionally, extend fetch to provide custom logic
  // such as retries, connectivity checks, etc...
  await fetch(createRequest(operation, null, payload));
}

const collector = googleAnalytics(send, ga);
export const tracker = trackers.create(collector);
```

You can combine this functionality with other utility methods. For example,
we can batch calls to Google Analytics to run at most once every 5 seconds,
and also replace keys and values with parameters Google Analytics expects:

```js
// combining with utility methods

import { googleAnalytics } from '@paychex/collector-ga';
import { functions, signals, trackers } from '@paychex/core';

async function send(payload, operation) { ... }

const signal = signals.autoReset(false);

let collector = googleAnalytics(send, ga);

collector = trackers.utils.withReplacement(collector, new Map([
  [/\ben\b/i, 'English'],
  [/\bes\b/i, 'Spanish'],
  [/^lang$/i, 'language'],
]));

collector = functions.buffer(collector, [signal]);
collector.flush = signal.set;

// automatically flush the queue every 5 seconds;
// consumers can also manually invoke `flush` (e.g.
// when the user is navigating away from the site)

setInterval(collector.flush, 5000);

export default collector;
```
