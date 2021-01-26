import expect from 'expect';
import { spy } from '@paychex/core/test/utils.js';

import googleAnalytics from '../index.js';

describe('collectors', () => {

    let event = {},
        error = {},
        timer = {};

    beforeEach(() => {
        event = { type: 'event' };
        error = { type: 'error' };
        timer = { type: 'timer' };
    });

    describe('googleAnalytics', () => {

        let ga,
            hit,
            send,
            enqueue,
            collector;

        beforeEach(() => {
            send = spy();
            hit = 'ea=action&el=label&ec=category';
            ga = spy().invokes((method, ...args) => {
                if (method === 'set')
                    enqueue = args.pop();
                else
                    enqueue({ get: () => hit });
            });
            collector = googleAnalytics(send, ga, 10);
        });

        afterEach(() => collector.dispose());

        it('returns expected function', () => {
            expect(collector).toBeInstanceOf(Function);
        });

        it('throws if send not a function', () => {
            expect(() => googleAnalytics(null, ga)).toThrow();
        });

        it('throws if ga is not a function', () => {
            expect(() => googleAnalytics(send, null)).toThrow();
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
                        base: 'www.google-analytics.com',
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
            collector({ type: 'event', data: { key: 'value', dimension12: 'value' }});
            setTimeout(() => {
                expect(ga.args[1]).toEqual(expect.objectContaining({
                    hitType: 'event',
                    dimension12: 'value'
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
                setTimeout(() => {
                    expect(send.callCount).toBe(2);
                    expect(send.args[0]).toBe(hit);
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
                setTimeout(() => {
                    expect(send.callCount).toBe(2);
                    expect(send.args[0]).toEqual(batch2.map(asHit).join('\n'));
                    done();
                }, 60);
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
            collector({});
            collector(event);
            collector();
            collector(null);
            collector(error);
            collector('abc');
            collector(timer);
            collector(123);
            setTimeout(() => {
                expect(send.args[0].split('\n')).toEqual([hit, hit, hit]);
                done();
            });
        });

    });

});
