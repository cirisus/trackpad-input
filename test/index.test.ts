import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    WHEEL_GESTURE_DECISION_MS,
    WHEEL_GESTURE_IDLE_MS,
    WheelGestureClassifier,
    WheelInputRouter,
    classifyWheelInput,
    inferWheelGestureMode,
    type WheelGestureSample,
} from '../src/index';

const sample = (
    overrides: Partial<WheelGestureSample> = {},
): WheelGestureSample => ({
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    timeStamp: 0,
    ...overrides,
});

afterEach(() => {
    vi.useRealTimers();
});

describe('classifyWheelInput', () => {
    it('identifies line/page and legacy-notch input as a mouse wheel', () => {
        expect(classifyWheelInput(sample({ deltaMode: 1, deltaY: 3 }))).toEqual(
            { device: 'mouse', mode: 'zoom' },
        );
        expect(
            classifyWheelInput(
                sample({
                    deltaY: 3,
                    wheelDelta: -120,
                    wheelDeltaY: -120,
                }),
            ),
        ).toEqual({ device: 'mouse', mode: 'zoom' });
    });

    it('identifies two-axis pixel input as trackpad pan', () => {
        expect(
            classifyWheelInput(sample({ deltaX: 0.01, deltaY: 4 })),
        ).toEqual({ device: 'trackpad', mode: 'pan' });
    });

    it('identifies browser ctrl-wheel pinch as trackpad zoom', () => {
        expect(
            classifyWheelInput(
                sample({ ctrlKey: true, deltaX: 2, deltaY: 1.5 }),
            ),
        ).toEqual({ device: 'trackpad', mode: 'zoom' });
    });

    it('keeps pure vertical pixel input explicitly ambiguous', () => {
        expect(classifyWheelInput(sample({ deltaY: 3 }))).toEqual({
            device: 'unknown',
            mode: 'pending',
        });
        expect(inferWheelGestureMode(sample({ deltaY: 3 }))).toBe('zoom');
    });
});

describe('WheelGestureClassifier', () => {
    it('promotes buffered input on the first horizontal component', () => {
        const classifier = new WheelGestureClassifier();

        expect(classifier.classify(sample({ deltaY: 3 }))).toBe('pending');
        expect(
            classifier.classify(sample({ deltaX: 0.01, deltaY: 5 })),
        ).toBe('pan');
        expect(classifier.current).toEqual({
            device: 'trackpad',
            mode: 'pan',
        });
    });

    it('keeps trackpad pan sticky through a legacy-looking momentum tail', () => {
        const classifier = new WheelGestureClassifier();

        expect(classifier.classify(sample({ deltaX: 4, deltaY: 5 }))).toBe(
            'pan',
        );
        expect(
            classifier.classify(
                sample({
                    deltaY: 3,
                    wheelDelta: -120,
                    wheelDeltaY: -120,
                }),
            ),
        ).toBe('pan');
    });

    it('resets between input sessions', () => {
        const classifier = new WheelGestureClassifier();

        classifier.classify(sample({ deltaX: 4, deltaY: 5 }));
        classifier.reset();
        expect(
            classifier.classifyDetailed(
                sample({ deltaY: 3, wheelDelta: -120 }),
            ),
        ).toEqual({ device: 'mouse', mode: 'zoom' });
    });
});

describe('WheelInputRouter', () => {
    it('buffers an ambiguous first frame and replays the burst as pan', () => {
        vi.useFakeTimers();
        const output: string[] = [];
        const router = new WheelInputRouter({
            onPan: (input, classification) =>
                output.push(`pan:${input.deltaY}:${classification.device}`),
            onZoom: (input, classification) =>
                output.push(`zoom:${input.deltaY}:${classification.device}`),
        });

        expect(router.route(sample({ deltaY: 3 }))).toBe('pending');
        expect(output).toEqual([]);
        expect(router.route(sample({ deltaX: 0.5, deltaY: 5 }))).toBe('pan');
        expect(output).toEqual(['pan:3:trackpad', 'pan:5:trackpad']);
        router.dispose();
    });

    it('falls a lone ambiguous frame back to zoom after the decision window', () => {
        vi.useFakeTimers();
        const output: string[] = [];
        const router = new WheelInputRouter({
            onPan: () => output.push('pan'),
            onZoom: (_input, classification) =>
                output.push(`zoom:${classification.device}`),
        });

        router.route(sample({ deltaY: 3 }));
        vi.advanceTimersByTime(WHEEL_GESTURE_DECISION_MS - 1);
        expect(output).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(output).toEqual(['zoom:unknown']);
        router.dispose();
    });

    it('ends and resets a gesture after arrival-time idle', () => {
        vi.useFakeTimers();
        const output: string[] = [];
        const router = new WheelInputRouter({
            onPan: () => output.push('pan'),
            onZoom: (_input, classification) =>
                output.push(`zoom:${classification.device}`),
            onGestureEnd: (classification) =>
                output.push(`end:${classification.device}`),
        });

        router.route(sample({ deltaX: 1, deltaY: 2 }));
        vi.advanceTimersByTime(WHEEL_GESTURE_IDLE_MS);
        router.route(sample({ deltaY: 3, wheelDelta: -120 }));

        expect(output).toEqual([
            'pan',
            'end:trackpad',
            'zoom:mouse',
        ]);
        router.dispose();
    });

    it('rejects invalid timeout options', () => {
        expect(
            () =>
                new WheelInputRouter({
                    onPan: () => undefined,
                    onZoom: () => undefined,
                    idleTimeout: Number.NaN,
                }),
        ).toThrow(TypeError);
    });
});
