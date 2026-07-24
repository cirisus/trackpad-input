export type WheelGestureMode = 'zoom' | 'pan';
export type WheelGestureDecision = WheelGestureMode | 'pending';
export type WheelInputDevice = 'mouse' | 'trackpad' | 'unknown';

export interface WheelGestureSample {
    ctrlKey: boolean;
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    timeStamp?: number;
    wheelDelta?: number;
    wheelDeltaX?: number;
    wheelDeltaY?: number;
}

export interface RoutedWheelInput {
    device: WheelInputDevice;
    mode: WheelGestureMode;
}

export type WheelInputClassification =
    | RoutedWheelInput
    | { device: 'unknown'; mode: 'pending' };

export const WHEEL_GESTURE_IDLE_MS = 120;
export const WHEEL_GESTURE_DECISION_MS = 40;

const DOM_DELTA_PIXEL = 0;
const LEGACY_WHEEL_NOTCH = 120;
const LEGACY_NOTCH_TOLERANCE = 0.01;

const isLegacyWheelNotch = (value: number | undefined) => {
    if (!value || !Number.isFinite(value)) return false;

    const notchCount = Math.abs(value) / LEGACY_WHEEL_NOTCH;
    return (
        notchCount >= 1 &&
        Math.abs(notchCount - Math.round(notchCount)) <= LEGACY_NOTCH_TOLERANCE
    );
};

const hasLegacyMouseWheelSignature = (sample: WheelGestureSample) =>
    isLegacyWheelNotch(sample.wheelDelta) ||
    isLegacyWheelNotch(sample.wheelDeltaX) ||
    isLegacyWheelNotch(sample.wheelDeltaY);

export const hasExplicitMouseWheelSignature = (sample: WheelGestureSample) =>
    !sample.ctrlKey &&
    (sample.deltaMode !== DOM_DELTA_PIXEL ||
        (sample.deltaX === 0 && hasLegacyMouseWheelSignature(sample)));

export const hasTrackpadPanEvidence = (sample: WheelGestureSample) =>
    !sample.ctrlKey &&
    sample.deltaMode === DOM_DELTA_PIXEL &&
    sample.deltaX !== 0;

const isAmbiguousPixelSample = (sample: WheelGestureSample) =>
    !sample.ctrlKey &&
    sample.deltaMode === DOM_DELTA_PIXEL &&
    sample.deltaX === 0 &&
    sample.deltaY !== 0 &&
    !hasLegacyMouseWheelSignature(sample);

const hasMovement = (sample: WheelGestureSample) =>
    sample.deltaX !== 0 || sample.deltaY !== 0;

const assertValidWheelGestureSample = (sample: WheelGestureSample) => {
    if (typeof sample.ctrlKey !== 'boolean') {
        throw new TypeError('ctrlKey must be a boolean');
    }

    const requiredNumbers: Array<[string, number]> = [
        ['deltaMode', sample.deltaMode],
        ['deltaX', sample.deltaX],
        ['deltaY', sample.deltaY],
    ];
    requiredNumbers.forEach(([name, value]) => {
        if (!Number.isFinite(value)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    });

    const optionalNumbers: Array<[string, number | undefined]> = [
        ['timeStamp', sample.timeStamp],
        ['wheelDelta', sample.wheelDelta],
        ['wheelDeltaX', sample.wheelDeltaX],
        ['wheelDeltaY', sample.wheelDeltaY],
    ];
    optionalNumbers.forEach(([name, value]) => {
        if (value !== undefined && !Number.isFinite(value)) {
            throw new TypeError(`${name} must be a finite number`);
        }
    });
};

const classifyValidWheelInput = (
    sample: WheelGestureSample,
): WheelInputClassification => {
    if (!hasMovement(sample)) {
        return { device: 'unknown', mode: 'pending' };
    }

    if (sample.ctrlKey) {
        return {
            device:
                sample.deltaMode === DOM_DELTA_PIXEL ? 'trackpad' : 'unknown',
            mode: 'zoom',
        };
    }

    if (hasTrackpadPanEvidence(sample)) {
        return { device: 'trackpad', mode: 'pan' };
    }

    if (hasExplicitMouseWheelSignature(sample)) {
        return { device: 'mouse', mode: 'zoom' };
    }

    if (isAmbiguousPixelSample(sample)) {
        return { device: 'unknown', mode: 'pending' };
    }

    return { device: 'unknown', mode: 'zoom' };
};

/**
 * Classify a single wheel sample without gesture history.
 *
 * Pure vertical pixel-mode input is reported as unknown/pending because the
 * WheelEvent API does not reveal its physical source. Use WheelInputRouter to
 * buffer that ambiguity briefly and keep one decision for the full gesture.
 */
export const classifyWheelInput = (
    sample: WheelGestureSample,
): WheelInputClassification => {
    assertValidWheelGestureSample(sample);
    return classifyValidWheelInput(sample);
};

/**
 * Return an immediate pan/zoom fallback for code that cannot buffer input.
 */
export const inferWheelGestureMode = (
    sample: WheelGestureSample,
): WheelGestureMode => {
    const { mode } = classifyWheelInput(sample);
    return mode === 'pending' ? 'zoom' : mode;
};

/**
 * Locks the first reliable decision for one continuous wheel-event burst.
 * Call reset after the input stream has been idle.
 */
export class WheelGestureClassifier {
    private classification: RoutedWheelInput | null = null;

    classifyDetailed(sample: WheelGestureSample): WheelInputClassification {
        assertValidWheelGestureSample(sample);

        if (!hasMovement(sample)) {
            return (
                this.classification ?? { device: 'unknown', mode: 'pending' }
            );
        }

        if (sample.ctrlKey) {
            this.classification = {
                device:
                    sample.deltaMode === DOM_DELTA_PIXEL
                        ? 'trackpad'
                        : 'unknown',
                mode: 'zoom',
            };
            return this.classification;
        }

        // Momentum tails can lose their horizontal component or expose legacy
        // fields. Once panning starts, keep that intent for the whole burst.
        if (this.classification?.mode === 'pan') {
            return this.classification;
        }

        if (hasExplicitMouseWheelSignature(sample)) {
            this.classification = { device: 'mouse', mode: 'zoom' };
            return this.classification;
        }

        if (this.classification !== null) {
            return this.classification;
        }

        const next = classifyValidWheelInput(sample);
        if (next.mode !== 'pending') {
            this.classification = next;
        }
        return next;
    }

    classify(sample: WheelGestureSample): WheelGestureDecision {
        return this.classifyDetailed(sample).mode;
    }

    resolvePendingAsZoom(): WheelGestureMode {
        this.classification ??= { device: 'unknown', mode: 'zoom' };
        return this.classification.mode;
    }

    get current(): RoutedWheelInput | null {
        return this.classification;
    }

    reset() {
        this.classification = null;
    }
}

export interface WheelInputRouterOptions<
    Sample extends WheelGestureSample = WheelGestureSample,
> {
    onPan(sample: Sample, input: RoutedWheelInput): void;
    onZoom(sample: Sample, input: RoutedWheelInput): void;
    onGestureEnd?(input: RoutedWheelInput): void;
    decisionTimeout?: number;
    idleTimeout?: number;
}

/**
 * Buffers ambiguous leading frames, routes the whole burst consistently, and
 * resets device detection after an arrival-time idle period.
 */
export class WheelInputRouter<
    Sample extends WheelGestureSample = WheelGestureSample,
> {
    private readonly classifier = new WheelGestureClassifier();
    private readonly decisionTimeout: number;
    private readonly idleTimeout: number;
    private readonly onPan: WheelInputRouterOptions<Sample>['onPan'];
    private readonly onZoom: WheelInputRouterOptions<Sample>['onZoom'];
    private readonly onGestureEnd?: WheelInputRouterOptions<Sample>['onGestureEnd'];
    private pendingSamples: Sample[] = [];
    private decisionTimer: ReturnType<typeof setTimeout> | null = null;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private sessionGeneration = 0;
    private disposed = false;

    constructor(options: WheelInputRouterOptions<Sample>) {
        this.onPan = options.onPan;
        this.onZoom = options.onZoom;
        this.onGestureEnd = options.onGestureEnd;
        this.decisionTimeout = validateTimeout(
            options.decisionTimeout ?? WHEEL_GESTURE_DECISION_MS,
            'decisionTimeout',
        );
        this.idleTimeout = validateTimeout(
            options.idleTimeout ?? WHEEL_GESTURE_IDLE_MS,
            'idleTimeout',
        );
        if (this.decisionTimeout >= this.idleTimeout) {
            throw new RangeError(
                'decisionTimeout must be less than idleTimeout',
            );
        }
    }

    route(sample: Sample): WheelGestureDecision {
        if (this.disposed) {
            throw new Error('WheelInputRouter has been disposed');
        }

        const classification = this.classifier.classifyDetailed(sample);
        this.refreshIdleTimer();

        if (!hasMovement(sample)) {
            return classification.mode;
        }

        if (classification.mode === 'pending') {
            this.pendingSamples.push(sample);
            this.schedulePendingDecision();
            return classification.mode;
        }

        this.flushPendingSamples(classification);
        this.emit(sample, classification);
        return classification.mode;
    }

    reset() {
        this.clearTimers();
        this.pendingSamples = [];
        this.classifier.reset();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.reset();
    }

    private schedulePendingDecision() {
        if (this.decisionTimer !== null) return;

        this.decisionTimer = setTimeout(() => {
            this.decisionTimer = null;
            this.classifier.resolvePendingAsZoom();
            const classification = this.classifier.current;
            if (classification !== null) {
                this.flushPendingSamples(classification);
            }
        }, this.decisionTimeout);
    }

    private refreshIdleTimer() {
        this.sessionGeneration += 1;
        const generation = this.sessionGeneration;
        if (this.idleTimer !== null) clearTimeout(this.idleTimer);

        this.idleTimer = setTimeout(() => {
            if (generation !== this.sessionGeneration) return;

            this.idleTimer = null;
            const classification = this.classifier.current;
            this.clearDecisionTimer();
            this.pendingSamples = [];
            this.classifier.reset();
            if (classification !== null) {
                this.onGestureEnd?.(classification);
            }
        }, this.idleTimeout);
    }

    private flushPendingSamples(classification: RoutedWheelInput) {
        this.clearDecisionTimer();
        if (this.pendingSamples.length === 0) return;

        const pendingSamples = this.pendingSamples;
        this.pendingSamples = [];
        pendingSamples.forEach((sample) => this.emit(sample, classification));
    }

    private emit(sample: Sample, classification: RoutedWheelInput) {
        if (classification.mode === 'pan') {
            this.onPan(sample, classification);
        } else {
            this.onZoom(sample, classification);
        }
    }

    private clearDecisionTimer() {
        if (this.decisionTimer === null) return;
        clearTimeout(this.decisionTimer);
        this.decisionTimer = null;
    }

    private clearTimers() {
        this.sessionGeneration += 1;
        this.clearDecisionTimer();
        if (this.idleTimer !== null) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}

const validateTimeout = (value: number, option: string) => {
    if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`${option} must be a non-negative finite number`);
    }
    return value;
};
