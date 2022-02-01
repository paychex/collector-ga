/**
 * Provides a Google Analytics collector that can be used with `@paychex/core` Tracker.
 *
 * @module index
 */
import type { DataDefinition } from '@paychex/core/types/data';
import type { TrackingInfo, TrackingSubscriber } from '@paychex/core/types/trackers';
export type { DataDefinition, TrackingSubscriber, TrackingInfo };
/**
 * Function to call when a batch is ready to send to Google Analytics. Will
 * be invoked with the batch payload (a string where each line is a form URL-encoded GA hit) as well
 * as the DataDefinition you should pass to the `@paychex/core` `createRequest` method.
 *
 * @example
 * ```js
 * import { createRequest, fetch } from '~/path/to/datalayer.js';
 *
 * async function send(payload, operation) {
 *   // optionally, extend fetch to provide custom logic
 *   // such as retries, connectivity checks, etc...
 *   await fetch(createRequest(operation, null, payload));
 * }
 *
 * const collector = googleAnalytics(send, ga);
 * export const tracker = trackers.create(collector);
 * ```
 */
export interface SendFunction {
    (payload: string, operation: DataDefinition): void | Promise<void>;
}
/**
 * Converts {@link TrackingInfo} items into Google Analytics hits,
 * then collects hits into a batch to send to GA. Enforces GA's batching logic, including:
 *
 * - maximum hit size: 8kb
 * - maximum batch size: 16kb
 * - max hits per batch: 20
 *
 * @param send Function to call when a batch is ready to send to Google Analytics. Will
 * be invoked with the batch payload (a string where each line is a form URL-encoded GA hit) as well
 * as the DataDefinition you should pass to the `@paychex/core` `createRequest` method. See the
 * examples for details.
 * @returns A collection function that can be passed to `createTracker` in `@paychex/core`.
 * @example
 * ```js
 * import { createRequest, fetch } from '~/path/to/datalayer.js';
 *
 * async function send(payload, operation) {
 *   // optionally, extend fetch to provide custom logic
 *   // such as retries, connectivity checks, etc...
 *   await fetch(createRequest(operation, null, payload));
 * }
 *
 * const collector = googleAnalytics(send, ga);
 * export const tracker = trackers.create(collector);
 * ```
 * @example
 * ```js
 * // sending friendly names
 *
 * async function send(payload, operation) { ... }
 *
 * let collector = googleAnalytics(send, ga);
 *
 * collector = trackers.utils.withReplacement(collector, new Map([
 *   [/\ben\b/i, 'English'],
 *   [/\bes\b/i, 'Spanish'],
 *   [/\blang\b/i, 'language'],
 * ]));
 *
 * export const tracker = trackers.create(collector);
 *
 * // usage:
 * tracker.event('set lang', { avail: ['es', 'en'], selected: 'en' });
 * ```
 *
 * ```json
 * {
 *   "id": "09850c98-8d0e-4520-a61c-9401c750dec6",
 *   "type": "event",
 *   "label": "set language",
 *   "start": 1611671260770,
 *   "stop": 1611671260770,
 *   "duration": 0,
 *   "count": 1,
 *   "data": {
 *     "avail": [ "Spanish", "English" ],
 *     "selected": "English"
 *   }
 * }
 * ```
 */
export declare function googleAnalytics(send: SendFunction): TrackingSubscriber;
