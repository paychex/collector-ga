import * as expect from 'expect';
import { Spy, spy } from '@paychex/core/test';

import { googleAnalytics, GoogleTrackingSubscriber } from '../index';
import { TrackingInfo } from '@paychex/core/types/trackers';

describe('collectors', () => {

    let event: TrackingInfo = {} as any,
        error: TrackingInfo = {} as any,
        timer: TrackingInfo = {} as any;

    beforeEach(() => {
        event = { type: 'event' } as any;
        error = { type: 'error' } as any;
        timer = { type: 'timer' } as any;
    });

    describe('googleAnalytics', () => {

        let ga: Spy,
            hit: string,
            send: Spy,
            enqueue: Function,
            collector: GoogleTrackingSubscriber;

        beforeEach(() => {
            send = spy();
            hit = 'ea=action&el=label&ec=category';
            (globalThis as any).ga = ga = spy().invokes((method: string, ...args: Function[]) => {
                if (method === 'set')
                    enqueue = args.pop();
                else
                    enqueue({ get: () => hit });
            });
            collector = googleAnalytics.call(null, send, 10);
        });

        afterEach(() => {
            collector.dispose();
            delete (globalThis as any).ga;
        });

        it('returns expected function', () => {
            expect(collector).toBeInstanceOf(Function);
        });

        it('throws if send not a function', () => {
            expect(() => googleAnalytics(null)).toThrow();
        });

        it('uses default slot interval', () => {
            expect(() => (googleAnalytics(send) as any).dispose()).not.toThrow();
        });

        it('does nothing if disposed', (done) => {
            collector.dispose();
            collector(event);
            setTimeout(() => {
                expect(send.called).toBe(false);
                done();
            });
        });

        it('sends expected payload', (done) => {
            collector(event);
            setTimeout(() => {
                expect(send.args).toEqual([
                    hit,
                    expect.objectContaining({
                        path: 'batch',
                        method: 'POST',
                        protocol: 'https',
                        host: 'www.google-analytics.com',
                        headers: {
                            'content-type': 'application/x-www-form-urlencoded',
                        },
                    }),
                ]);
                done();
            });
        });

        it('collates all calls within a frame', (done) => {
            collector(event);
            collector(timer);
            collector(error);
            setTimeout(() => {
                expect(send.callCount).toBe(1);
                expect(send.args[0]).toEqual([hit, hit, hit].join('\n'));
                done();
            });
        });

        it('excludes non-dimension data', (done) => {
            collector({ type: 'event', data: { key: 'value', dimension12: 'value' } } as any);
            setTimeout(() => {
                expect(ga.args[1]).toEqual(expect.objectContaining({
                    hitType: 'event',
                    dimension12: 'value'
                }));
                done();
            });
        });

        it('unsets dimensions', (done) => {
            collector({ type: 'event', data: { dimension12: undefined } } as any);
            setTimeout(() => {
                expect(ga.args[1]).toEqual(expect.objectContaining({
                    hitType: 'event',
                    dimension12: null
                }));
                done();
            });
        });

        it('sends sequentially', (done) => {
            send.invokes(() => new Promise(resolve => setTimeout(resolve, 50)));
            collector(event);
            setTimeout(() => {
                expect(send.callCount).toBe(1);
                collector(event);
                setTimeout(() => {
                    expect(send.callCount).toBe(2);
                    done();
                }, 50);
            });
        });

        it('re-enqueues hits when send fails', (done) => {
            send.onCall(0).throws(new Error());
            collector(event);
            setTimeout(() => {
                expect(send.callCount).toBe(1);
                collector(event);
                setTimeout(() => {
                    expect(send.callCount).toBe(2);
                    expect(send.args[0]).toBe(`${hit}\n${hit}`);
                    done();
                });
            });
        });

        it('only sends up to 20 hits in a batch', (done) => {
            send.onCall(0).invokes(() => new Promise(resolve => setTimeout(resolve, 60)));
            const asHit = () => hit;
            const batch1 = Array(20).fill(event);
            const batch2 = Array(10).fill(event);
            batch1.concat(batch2).forEach(collector);
            setTimeout(() => {
                expect(send.args[0]).toEqual(batch1.map(asHit).join('\n'));
                done();
            });
        });

        it('only sends up to 16kb payload', (done) => {
            hit = Array(4 << 10).fill(0).join('');
            Array(5).fill(event).forEach(collector);
            setTimeout(() => {
                expect(send.args[0].length).toBeLessThan(16 << 10);
                expect(send.args[0].split('\n').length).toBe(3);
                done();
            });
        });

        it('queues once slots are full', (done) => {
            Array(30).fill(event).forEach(collector);
            const payload = Array(20).fill(hit).join('\n');
            setTimeout(() => {
                expect(send.args[0]).toEqual(payload);
                done();
            });
        });

        it('ignores hits > 8kb', (done) => {
            const kb4 = Array(4 << 10).fill(0).join('');
            const kb8 = Array(8 << 10).fill(0).join('');
            hit = kb4
            collector(event);
            hit = kb8 + '0';
            collector(event);
            hit = kb8;
            collector(event);
            setTimeout(() => {
                const hits = send.args[0].split('\n');
                expect(hits.length).toBe(2);
                expect(hits).toEqual([kb4, kb8]);
                done();
            });
        });

        it('ignores invalid TrackingInfo items', (done) => {
            collector.call(null, {});
            collector.call(null, event);
            collector.call(null, );
            collector.call(null, null);
            collector.call(null, error);
            collector.call(null, 'abc');
            collector.call(null, timer);
            collector.call(null, 123);
            setTimeout(() => {
                expect(send.args[0].split('\n')).toEqual([hit, hit, hit]);
                done();
            });
        });

    });

});
