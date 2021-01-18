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

import { createRequest, fetch, proxy } from '~/path/to/datalayer.js';

const collector = googleAnalytics(ga);

// enable calls to GA endpoints
collector.setDataPipeline({
  fetch,
  proxy,
  createRequest,
});

export const tracker = createTracker(collector);

// you can flush the collector at any time (e.g. before navigating to another page)
collector.flush();

// you can also stop the collector permanently
collector.stop();

// you can register a map of "named" dimensions to
// make tracking code more readable; any data values
// that match these friendly names will be converted to
// the specified GA dimension
collector.addDimensionNames({
  "Selected Product": "dimension03",
});

// similarly, you can register a map of "human readable"
// names to use when processing labels and data values,
// e.g. to convert from a system code to a more friendly
// name to use in GA reports
collector.addFriendlyNames({
  "PROD_A": "Product A",
  "LANG_ENGLISH": "English",
});

// in consumer code:
tracker.event('language changed', {
  'label': 'LANG_ENGLISH', // converted to "English" when sent to GA
  'Selected Product': 'PROD_A', // converted to dimension03: "Product A" when sent to GA
});
```
