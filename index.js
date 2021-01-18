/**
 * Provides a Google Analytics collector that can be used with `@paychex/core` Tracker.
 *
 * @module index
 */

import get from 'lodash/get.js';
import set from 'lodash/set.js';
import wrap from 'lodash/wrap.js';
import merge from 'lodash/merge.js';
import reduce from 'lodash/reduce.js';
import isEmpty from 'lodash/isEmpty.js';
import mapKeys from 'lodash/mapKeys.js';
import transform from 'lodash/transform.js';
import memoize from 'lodash/memoize.js';
import toLower from 'lodash/toLower.js';
import isFunction from 'lodash/isFunction.js';
import isString from 'lodash/isString.js';
import startsWith from 'lodash/startsWith.js';
import conforms from 'lodash/conforms.js';
import conformsTo from 'lodash/conformsTo.js';

import { autoReset, manualReset } from '@paychex/core/signals/index.js';
import { error, FATAL, fatal } from '@paychex/core/errors/index.js';
import { action, process, transitions } from '@paychex/core/process/index.js';

const MAX_HIT_SIZE_KB = 8;
const MAX_BATCH_SIZE_KB = 16;
const MAX_HITS_PER_BATCH = 20;
const DEFAULT_DEBOUNCE_MS = 10000;
const DEFAULT_SLOT_INTERVAL_MS = 1000;

const DATA_SCHEMA = {
    fetch: isFunction,
    createRequest: isFunction,
    proxy: conforms({ use: isFunction }),
};

const lowerKey = (_, key) => toLower(key);
const searchToken = memoize((key) => new RegExp(key, 'ig'));

const operation = {
    base: 'analytics.google',
    path: 'batch',
    method: 'POST',
    headers: {
        'content-type': 'application/x-www-form-urlencoded'
    }
};

function convertToHit(entry) {
    switch (entry.type) {
        case 'event':
            return {
                hitType: 'event',
                eventLabel: get(entry, 'label'),
                eventAction: get(entry, 'data.action'),
                eventCategory: get(entry, 'data.category'),
                eventValue: get(entry, 'data.value', get(entry, 'count')),
            };
        case 'error':
            return {
                hitType: 'exception',
                exDescription: get(entry, 'label'),
                exFatal: get(entry, 'data.severity') === FATAL,
            };
        case 'timer':
            return {
                hitType: 'timing',
                timingValue: get(entry, 'duration'),
                timingCategory: get(entry, 'data.category'),
                // "label" is dominant in our tracking API
                // but "variable" is dominant in GA's API,
                // so we pass our "label" as GA's "variable"
                // and pass our "variable" as GA's "label"
                timingLabel: get(entry, 'data.variable'),
                timingVar: get(entry, 'label'),
            };
    }
}

function kb(num) {
    return num << 10;
}

function isValidHit(hit) {
    return !isEmpty(hit) && JSON.stringify(hit).length < kb(MAX_HIT_SIZE_KB);
}

function indexBySize(array, size) {
    let i = 0, bytes = 0;
    for (; i < array.length; i++) {
        bytes += JSON.stringify(array[i]).length + 2; // add CRLF
        if (bytes > size) break;
    }
    return i;
}

function hasEntries({ queue }) {
    return !isEmpty(queue);
}

/**
 * Converts {@link external:TrackingInfo TrackingInfo} items into Google Analytics hits,
 * then collects hits into a batch to send to GA. Enforces GA's batching logic, including:
 *
 * - maximum hit size: 8kb
 * - maximum batch size: 16kb
 * - max hits per batch: 20
 *
 * You must specify the data layer `fetch`, `createRequest`, and `proxy` to use for calls
 * to GA. Also, you can specify friendly names for values and custom dimensions. See the
 * example for details on both.
 *
 * @function googleAnalytics
 * @param {function} ga The Google Analytics tracker to use when sending hits.
 * @returns {function} A collection function that can be passed to `createTracker` in `@paychex/core`.
 * Has methods to cancel, stop, and flush the collector. See examples.
 * @example
 * import wrap from 'lodash/wrap.js';
 * import cloneDeep from 'lodash/cloneDeep.js';
 * import createTracker from '@paychex/core/tracker/index.js';
 * import googleAnalytics from '@paychex/collector-ga/index.js';
 *
 * import { createRequest, fetch, proxy } from '~/path/to/datalayer.js';
 *
 * const collector = googleAnalytics(ga);
 *
 * // enable calls to GA endpoints
 * collector.setDataPipeline({
 *   fetch,
 *   proxy,
 *   createRequest,
 * });
 *
 * // create a decorator to modify the provided
 * // tracking entry by wrapping the collector
 * function decorate(inner, info) {
 *   const clone = cloneDeep(info);
 *   if (clone.type === 'timer' && clone.duration > 2000)
 *       clone.tags = (clone.tags || []).concat(['perf', 'long-running']);
 *   }
 *   inner(clone);
 * }
 *
 * export const tracker = createTracker(wrap(collector, decorate));
 *
 * // you can flush the collector at any time (e.g. before navigating to another page)
 * collector.flush();
 *
 * // you can also stop the collector permanently
 * collector.stop();
 *
 * // you can register a map of "named" dimensions to
 * // make tracking code more readable; any data values
 * // that match these friendly names will be converted to
 * // the specified GA dimension
 * collector.addDimensionNames({
 *   "Selected Product": "dimension03",
 * });
 *
 * // similarly, you can register a map of "human readable"
 * // names to use when processing labels and data values,
 * // e.g. to convert from a system code to a more friendly
 * // name to use in GA reports
 * collector.addFriendlyNames({
 *   "PROD_A": "Product A",
 *   "LANG_ENGLISH": "English",
 * });
 *
 * // in consumer code:
 * tracker.event('change language', {
 *   'label': 'LANG_ENGLISH', // converted to "English" when sent to GA
 *   'Selected Product': 'PROD_A', // converted to dimension03: "Product A" when sent to GA
 * });
 */
export default function googleAnalytics(ga, {
    // test-only
    DEBOUNCE_MS = DEFAULT_DEBOUNCE_MS,
    SLOT_INTERVAL_MS = DEFAULT_SLOT_INTERVAL_MS,
} = {}) {

    let fetch,
        createRequest,
        slots = 20,
        tokens = [];

    const dimensions = Object.create(null);
    const friendlyNames = Object.create(null);
    const pipeline = manualReset(false);

    async function send() {
        const payload = this.results.batch;
        const queue = this.conditions.queue;
        try {
            const data = payload.join('\n');
            const request = createRequest(operation, null, data);
            await fetch(request);
        } catch (e) {
            queue.unshift(...payload);
            console.error(e);
        } finally {
            sending.set();
        }
    }

    function batch() {
        const { queue } = this.conditions;
        const firstIndex = Math.min(MAX_HITS_PER_BATCH, indexBySize(queue, kb(MAX_BATCH_SIZE_KB)));
        return queue.splice(0, firstIndex);
    }

    function init() {
        tokens = [
            setInterval(() => debounce.set(), DEBOUNCE_MS),
            setInterval(() => slots = Math.min(20, slots + 2), SLOT_INTERVAL_MS),
        ];
    }

    async function wait() {
        await pipeline.ready();
        await sending.ready();
        await debounce.ready();
    }

    function iterator(result, value, key) {
        const dim = get(dimensions, toLower(key), key);
        if (startsWith(dim, 'dimension'))
            set(result, dim, value);
        return result;
    }

    function dimensionize(data) {
        return reduce(data, iterator, Object.create(null));
    }

    function replace([friendlyKey, friendlyValue]) {
        const rx = searchToken(friendlyKey);
        this.value = this.value.replace(rx, friendlyValue);
    }

    function transformer(result, value, key) {
        if (!isString(value)) {
            return set(result, key, value);
        }
        const output = { value };
        Object.entries(friendlyNames)
            .forEach(replace, output)
        return set(result, key, output.value);
    }

    function friendlify(hit) {
        return transform(hit, transformer, Object.create(null));
    }

    function slot(entry) {
        if (slots === 0)
            return setTimeout(slot, SLOT_INTERVAL_MS, entry);
        slots--;
        const hit = convertToHit(entry);
        const withDimensions = merge(hit, dimensionize(entry.data));
        const withFriendlyNames = friendlify(withDimensions);
        ga('send', withFriendlyNames);
    }

    const start = process('google analytics batch reporter', [
        action('init', init),
        action('wait', wait),
        action('batch', batch),
        action('send', send),
    ], transitions([
        ['init', 'wait'],
        ['wait', 'batch', hasEntries],
        ['batch', 'send'],
        ['send', 'wait'],
    ]));

    const state = {
        queue: [],
    };

    const sending = autoReset(true);
    const debounce = autoReset(true);
    const machine = start('init');

    function cleanup(inner, ...args) {
        tokens.forEach(clearInterval);
        return inner(...args);
    }

    function collect(entry) {
        if (isValidHit(entry))
            slot(entry);
    }

    collect.flush = () => debounce.set();
    collect.stop = wrap(machine.stop, cleanup);
    collect.cancel = wrap(machine.cancel, cleanup);

    collect.setDataPipeline = (data) => {
        if (!conformsTo(data, DATA_SCHEMA))
            throw error('Please specify an object with `fetch`, `proxy`, and `createRequest` properties.', fatal());
        fetch = data.fetch;
        createRequest = data.createRequest;
        data.proxy.use({
            protocol: 'https',
            host: 'www.google-analytics.com',
            match: {
                base: 'analytics.google'
            }
        });
        pipeline.set();
    };

    collect.addFriendlyNames = (map) => merge(friendlyNames, map);
    collect.addDimensionNames = (map) => merge(dimensions, mapKeys(map, lowerKey));

    ga('set', 'sendHitTask', function enqueue(data) {
        const hit = data.get('hitPayload');
        state.queue.push(hit);
        machine.update(state);
    });

    return collect;

}
