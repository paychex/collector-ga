# @paychex/collector-ga

Provides a GoogleAnalytics collector for use with a [@paychex/core](https://github.com/paychex/core) Tracker.

## Installation

```bash
npm install @paychex/collector-ga
```

## Usage

Construct a new GoogleAnalytics collector for use in the `@paychex/core` Tracker by passing the global `ga` object to the factory function:

```js
import createTracker from '@paychex/core/tracker/index.js';
import googleAnalytics from '@paychex/collector-ga/index.js';

import { createRequest, fetch } from '~/path/to/datalayer.js';

async function send(payload, operation) {
  // optionally, extend fetch to provide custom logic
  // such as retries, connectivity checks, etc...
  await fetch(createRequest(operation, null, payload));
}

const collector = googleAnalytics(send, ga);
export const tracker = createTracker(collector);
```

You can combine this functionality with other utility methods. For example,
we can batch calls to Google Analytics to run at most once every 5 seconds,
and also replace keys and values with parameters Google Analytics expects:

```js
// combining with utility methods

import { buffer } from '@paychex/core/index.js';
import { autoReset } from '@paychex/core/signals/index.js';
import { replacer } from '@paychex/core/tracker/utils.js';
import createTracker from '@paychex/core/tracker/index.js';
import googleAnalytics from '@paychex/collector-ga/index.js';

async function send(payload, operation) { ... }

const signal = autoReset(false);

let collector = googleAnalytics(send, ga);

collector = replacer(collector, {
    'en': 'English',
    'es': 'Spanish',
    'Language': 'dimension12',
});

collector = buffer(collector, [signal]);
collector.flush = signal.set;

// automatically flush the queue every 5 seconds;
// consumers can also manually invoke `flush` (e.g.
// when the user is navigating away from the site)

setInterval(collector.flush, 5000);

export default collector;
```
