/**
 * Provides a Google Analytics collector that can be used with `@paychex/core` Tracker.
 *
 * @module index
 */

import get from 'lodash/get.js';
import isFunction from 'lodash/isFunction.js';

import { autoReset } from '@paychex/core/signals/index.js';
import { error, FATAL, fatal } from '@paychex/core/errors/index.js';

const MAX_SLOTS = 20;
const MAX_HITS_PER_BATCH = 20;
const MAX_HIT_SIZE_KB = 8 << 10;
const MAX_BATCH_SIZE_KB = 16 << 10;

const operation = Object.freeze({
    path: 'batch',
    method: 'POST',
    protocol: 'https',
    base: 'www.google-analytics.com',
    headers: {
        'content-type': 'application/x-www-form-urlencoded'
    },
    ignore: {
        tracking: true,
        traceability: true,
    },
});

function asEvent(entry) {
    if (get(entry, 'type') === 'event')
        return {
            hitType: 'event',
            eventLabel: get(entry, 'label'),
            eventAction: get(entry, 'data.action'),
            eventCategory: get(entry, 'data.category'),
            eventValue: get(entry, 'data.value', get(entry, 'count')),
        };
}

function asTimer(entry) {
    if (get(entry, 'type') === 'timer')
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

function asError(entry) {
    if (get(entry, 'type') === 'error')
        return {
            hitType: 'exception',
            exDescription: get(entry, 'label'),
            exFatal: get(entry, 'data.severity') === FATAL,
        };
}

function convertToHit(entry) {
    return asEvent(entry) ||
        asTimer(entry) ||
        asError(entry);
}

function isValidHit(hit) {
    return String(hit).length <= MAX_HIT_SIZE_KB;
}

function indexBySize(array, size) {
    let i = 0,
        bytes = 0;
    for (; i < array.length; i++) {
        bytes += String(array[i]).length;
        if (bytes + i > size)
            break;
    }
    return i;
}

/**
 * Converts {@link external:TrackingInfo TrackingInfo} items into Google Analytics hits,
 * then collects hits into a batch to send to GA. Enforces GA's batching logic, including:
 *
 * - maximum hit size: 8kb
 * - maximum batch size: 16kb
 * - max hits per batch: 20
 * @function googleAnalytics
 * @param {function} send Function to call when a batch is ready to send to Google Analytics. Will
 * be invoked with the batch payload (a string where each line is a form URL-encoded GA hit) as well
 * as the DataOperation you should pass to the `@paychex/core` `createRequest` method. See the
 * examples for details.
 * @param {function} ga The Google Analytics tracker to use when sending hits.
 * @returns {function} A collection function that can be passed to `createTracker` in `@paychex/core`.
 * @example
 * import createTracker from '@paychex/core/tracker/index.js';
 * import googleAnalytics from '@paychex/collector-ga/index.js';
 *
 * import { createRequest, fetch } from '~/path/to/datalayer.js';
 *
 * async function send(payload, operation) {
 *   // optionally, extend fetch to provide custom logic
 *   // such as retries, connectivity checks, etc...
 *   await fetch(createRequest(operation, null, payload));
 * }
 *
 * const collector = googleAnalytics(send, ga);
 * export const tracker = createTracker(collector);
 * @example
 * // sending friendly names
 *
 * import { replacer } from '@paychex/core/tracker/utils.js';
 * import createTracker from '@paychex/core/tracker/index.js';
 * import googleAnalytics from '@paychex/collector-ga/index.js';
 *
 * async function send(payload, operation) { ... }
 *
 * let collector = googleAnalytics(send, ga);
 *
 * collector = replacer(collector, {
 *   en: 'English',
 *   es: 'Spanish',
 *   lang: 'language',
 * });
 *
 * export const tracker = createTracker(collector);
 *
 * // usage:
 * tracker.event('set lang', { avail: ['es', 'en'], selected: 'en' });
 *
 * `{
 *   id: '09850c98-8d0e-4520-a61c-9401c750dec6',
 *   type: 'event',
 *   label: 'set language',
 *   start: 1611671260770,
 *   stop: 1611671260770,
 *   duration: 0,
 *   count: 1,
 *   data: {
 *     avail: [ 'Spanish', 'English' ],
 *     selected: 'English'
 *   }
 * }`
 */
export default function googleAnalytics(send, ga, SLOT_INTERVAL = 1000) {

    if (!(isFunction(send) && isFunction(ga)))
        throw error('A `send` function and `ga` tracker instance must be provided.', fatal());

    let disposed = false,
        scheduled = false,
        slots = MAX_SLOTS;

    function increment() {
        slots = Math.min(MAX_SLOTS, slots + 2);
    }

    const queue = [];
    const sending = autoReset(true);
    const token = setInterval(increment, SLOT_INTERVAL);

    ga('set', 'sendHitTask', function enqueue(data) {
        const hit = data.get('hitPayload');
        if (isValidHit(hit)) {
            queue.push(hit);
            scheduleSend();
        }
    });

    // allows consumers to use buffer(...); collates
    // all calls within this frame so multiple data
    // calls aren't invoked unnecessarily
    function scheduleSend() {
        if (scheduled)
            return;
        scheduled = true;
        setTimeout(createPayload);
    }

    async function createPayload() {
        await sending.ready();
        scheduled = false;
        const index = indexBySize(queue, MAX_BATCH_SIZE_KB);
        const payload = queue.splice(0, Math.min(MAX_HITS_PER_BATCH, index));
        try {
            await send(payload.join('\n'), operation);
        } catch (e) {
            queue.unshift(...payload);
            scheduleSend();
        } finally {
            sending.set();
        }
    }

    function collect(entry) {
        if (disposed)
            return;
        if (slots < 1)
            return setTimeout(collect, SLOT_INTERVAL, entry);
        const hit = convertToHit(entry);
        if (!!hit) {
            slots--;
            ga('send', hit);
        }
    }

    // for unit testing only
    Object.defineProperty(collect, 'dispose', {
        enumerable: false,
        configurable: false,
        value: function dispose() {
            disposed = true;
            clearInterval(token);
        }
    });

    return collect;

}
