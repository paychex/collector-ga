import expect from 'expect';
import { spy } from '@paychex/core/test/utils.js';
import { FATAL } from '@paychex/core/errors/index.js';
import { manualReset } from '@paychex/core/signals/index.js';

import googleAnalytics from '../index.js';

describe('collectors', () => {

    let event = {},
        error = {},
        timer = {};

    beforeEach(() => {
        event = {
            type: 'event',
            label: 'event label',
            count: 1,
            data: {
                action: 'event action',
                category: 'event category',
                mode: 'employee', // custom dimension
                value: 123
            }
        };
        error = {
            type: 'error',
            label: 'error message',
            data: {
                mode: 'employee',
                severity: FATAL
            }
        };
        timer = {
            type: 'timer',
            label: 'label',
            duration: 200,
            data: {
                mode: 'employee',
                category: 'category',
                variable: 'variable'
            }
        };
    });

    describe('googleAnalytics', () => {

        let ga,
            collector,
            fetch,
            proxy,
            createRequest;

        function setUpSpies() {
            proxy = { use: spy() };
            createRequest = spy().returns({});
            fetch = spy().returns(Promise.resolve({ status: 200 }));
        }

        function initCollector(props = {}) {
            setUpSpies();
            ga = spy();
            ga.onCall(0).invokes((_, __, enqueue) => {
                ga.invokes((action, entry) => {
                    expect(action).toBe('send');
                    enqueue({ get: () => JSON.stringify(entry) });
                });
            });
            if (collector) {
                collector.stop();
            }
            collector = googleAnalytics(ga, props);
            collector.setDataPipeline({
                fetch,
                proxy,
                createRequest,
            });
        }

        beforeEach(initCollector);
        afterEach(() => collector.stop());

        it('returns expected function', () => {
            expect(collector).toBeInstanceOf(Function);
            expect('stop' in collector).toBe(true);
            expect('cancel' in collector).toBe(true);
        });

        it('throws if fetch not provided', () => {
            expect(() => collector.setDataPipeline({
                createRequest,
                proxy,
                fetch: undefined,
            })).toThrowError('Please specify an object with `fetch`, `proxy`, and `createRequest` properties.');
        });

        it('throws if createRequest not provided', () => {
            expect(() => collector.setDataPipeline({
                createRequest: undefined,
                proxy,
                fetch,
            })).toThrowError('Please specify an object with `fetch`, `proxy`, and `createRequest` properties.');
        });

        it('throws if proxy not provided', () => {
            expect(() => collector.setDataPipeline({
                createRequest,
                proxy: undefined,
                fetch,
            })).toThrowError('Please specify an object with `fetch`, `proxy`, and `createRequest` properties.');
        });

        it('sends using default decorator', (done) => {
            collector(event);
            setTimeout(() => {
                expect(fetch.called).toBe(true);
                done();
            });
        });

        it('does not send invalid hit', (done) => {
            collector({});
            setTimeout(() => {
                expect(fetch.called).toBe(false);
                done();
            });
        });

        it('maps dimensions', (done) => {
            event.data.custom = 'some value';
            collector.addDimensionNames({
                'mode': 'dimension20',
                'custom': 'dimension100',
            });
            collector(event);
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect(hits[0]).toMatchObject({
                    hitType: 'event',
                    eventLabel: 'event label',
                    eventAction: 'event action',
                    eventCategory: 'event category',
                    eventValue: 123,
                    dimension20: 'employee',
                    dimension100: 'some value',
                });
                done();
            });
        });

        it('uses friendly names', (done) => {
            collector.addFriendlyNames({
                'key.1': 'friend 1',
                'key.2': 'friend 2',
            });
            event.label = 'load [key.2]';
            event.data.dimension100 = 'key.1 and key.2';
            collector(event);
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect(hits[0]).toMatchObject({
                    hitType: 'event',
                    eventLabel: 'load [friend 2]',
                    eventAction: 'event action',
                    eventCategory: 'event category',
                    eventValue: 123,
                    dimension100: 'friend 1 and friend 2',
                });
                done();
            });
        });

        it('ignores non-dimension data', (done) => {
            event.data.custom = 'hello';
            collector(event);
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect('custom' in hits[0]).toBe(false);
                done();
            });
        });

        it('handles exceptions', (done) => {
            collector(error);
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect(hits[0]).toMatchObject({
                    hitType: 'exception',
                    exDescription: 'error message',
                    exFatal: true,
                });
                done();
            });
        });

        it('handles timings', (done) => {
            collector(timer);
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect(hits[0]).toMatchObject({
                    hitType: 'timing',
                    timingValue: 200,
                    timingCategory: 'category',
                    timingLabel: 'variable',
                    timingVar: 'label',
                });
                done();
            });
        });

        it('debounces', (done) => {
            const MS = 50;
            initCollector({ DEBOUNCE_MS: MS });
            collector(event);
            setTimeout(() => {
                collector(event);
                fetch.reset();
                fetch.returns(Promise.resolve({ status: 200 }));
                setTimeout(() => {
                    expect(fetch.called).toBe(false);
                });
            }, MS / 2);
            setTimeout(() => {
                expect(fetch.called).toBe(true);
                done();
            }, MS + 50);
        });

        it('waits for previous send to complete', (done) => {
            const FETCH_MS = 20;
            fetch.invokes(() => new Promise((resolve) => {
                setTimeout(resolve, FETCH_MS, { status: 200 });
            }));
            initCollector({ DEBOUNCE_MS: 0 });
            collector(event);
            setTimeout(() => {
                expect(fetch.callCount).toBe(1);
                collector(event);
                setTimeout(() => {
                    expect(fetch.callCount).toBe(2);
                });
                setTimeout(() => {
                    expect(fetch.callCount).toBe(2);
                    done();
                }, FETCH_MS + 10);
            });
        });

        it('queues hits after 20 reached', (done) => {
            let firstHitCount;
            const DEBOUNCE_MS = 50;
            const wait = manualReset(false);
            initCollector({
                signals: [wait],
                DEBOUNCE_MS,
                SLOT_INTERVAL_MS: DEBOUNCE_MS / 5,
            });
            Array(30)
                .fill(event)
                .forEach(collector);
            wait.set(); // proceed
            setTimeout(() => {
                const hits = createRequest.args[2].split('\n').map(JSON.parse);
                expect(fetch.callCount).toBe(1);
                expect(hits.length).toBe(20);
                setTimeout(() => {
                    const sent = createRequest.args[2].split('\n').map(JSON.parse);
                    firstHitCount = sent.length;
                    expect(sent.length).toBeLessThan(10);
                    expect(fetch.callCount).toBe(2);
                }, DEBOUNCE_MS);
                setTimeout(() => {
                    const sent = createRequest.args[2].split('\n').map(JSON.parse);
                    expect(fetch.callCount).toBe(3);
                    expect(sent.length + firstHitCount).toBe(10); // remaining hits
                    done();
                }, DEBOUNCE_MS * 2 + 10);
            });
        });

        it('sends at most 16kb per batch', (done) => {
            event.label = Array((8 << 10) - 400).fill('-').join('');
            const entrySize = JSON.stringify(event).length;
            const wait = manualReset(false);
            initCollector({ signals: [wait] });
            Array(5)
                .fill(event)
                .forEach(collector);
            wait.set();
            setTimeout(() => {
                const body = createRequest.args[2];
                const hits = body.split('\n').map(JSON.parse);
                expect(body.length).toBeLessThan(16 << 10);
                expect(entrySize).toBeLessThan(8 << 10);
                expect(hits.length).toBe(2);
                done();
            });
        });

        it('excludes hits > 8kb', (done) => {
            const wait = manualReset(false);
            initCollector({ signals: [wait] });
            Array(10)
                .fill(1)
                .map((_, index) => {
                    const copy = Object.assign({}, event);
                    copy.label = Array((index + 1) << 10).fill('-').join('');
                    return copy;
                })
                .forEach(collector);
            wait.set();
            setTimeout(() => {
                const body = createRequest.args[2];
                const hits = body.split('\n');
                expect(hits.length).toBeLessThan(10);
                hits.forEach(hit =>
                    expect(hit.length).toBeLessThan(8 << 10));
                done();
            });
        });

        it('outputs send errors to console', (done) => {
            const orig = console.error;
            console.error = spy();
            fetch.returns(Promise.reject({ status: 400 }));
            collector(event);
            setTimeout(() => {
                expect(console.error.called).toBe(true);
                console.error = orig;
                done();
            });
        });

        it('prepends error batch to next attempt', (done) => {
            const orig = console.error;
            console.error = spy();
            initCollector({ DEBOUNCE_MS: 10 });
            fetch.onCall(0).returns(Promise.reject({ status: 400 }));
            collector(event);
            setTimeout(() => {
                event.data.value = 321;
                collector(event);
                setTimeout(() => {
                    console.error = orig;
                    const body = createRequest.args[2];
                    const hits = body.split('\n').map(JSON.parse);
                    expect(hits[0].eventValue).toBe(123);
                    expect(hits[1].eventValue).toBe(321);
                    done();
                }, 15);
            });
        });

        it('flush() sends batch within debounce period', (done) => {
            collector(event);
            setTimeout(() => {
                expect(fetch.callCount).toBe(1);
                collector(event);
                setTimeout(() => {
                    expect(fetch.callCount).toBe(2);
                    done();
                });
                collector.flush();
            });
        });

    });

});
