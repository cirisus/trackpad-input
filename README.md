# trackpad-input

Route trackpad panning separately from mouse-wheel and pinch zoom input.
`trackpad-input` is framework-agnostic, has no runtime dependencies, and can
connect to any component that exposes a drag or pan operation.

## Install

```sh
npm install trackpad-input
```

## Usage

```ts
import { WheelInputRouter } from 'trackpad-input';

const surface = document.querySelector<HTMLElement>('.surface')!;

const input = new WheelInputRouter<WheelEvent>({
    onPan(event) {
        dragController.moveBy({
            x: -event.deltaX,
            y: -event.deltaY,
        });
    },
    onZoom(event, { device }) {
        zoomController.zoomBy(-event.deltaY, { device });
    },
    onGestureEnd({ mode }) {
        if (mode === 'pan') dragController.end();
    },
});

const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    input.route(event);
};

surface.addEventListener('wheel', handleWheel, { passive: false });

// Cleanup
surface.removeEventListener('wheel', handleWheel);
input.dispose();
```

The drag and zoom controllers are application-owned. They can be DOM
transforms, canvas viewports, editors, timelines, diagrams, 3D scenes, or any
other interface that accepts relative movement.

## `WheelInputRouter`

```ts
const input = new WheelInputRouter<WheelEvent>({
    onPan(sample, input) {},
    onZoom(sample, input) {},
    onGestureEnd(input) {},
    decisionTimeout: 40,
    idleTimeout: 120,
});
```

### Options

| Option                  | Required | Description                                                                      |
| ----------------------- | -------- | -------------------------------------------------------------------------------- |
| `onPan(sample, input)`  | Yes      | Receives input assigned to drag or pan.                                          |
| `onZoom(sample, input)` | Yes      | Receives mouse-wheel or pinch zoom input.                                        |
| `onGestureEnd(input)`   | No       | Runs when the current input gesture ends.                                        |
| `decisionTimeout`       | No       | Overrides the decision timeout in milliseconds. Must be less than `idleTimeout`. |
| `idleTimeout`           | No       | Overrides the gesture idle timeout in milliseconds.                              |

Each callback receives a routing result:

```ts
interface RoutedWheelInput {
    device: 'mouse' | 'trackpad' | 'unknown';
    mode: 'pan' | 'zoom';
}
```

The routed sample must match this interface. `WheelEvent` can be passed
directly.

```ts
interface WheelGestureSample {
    ctrlKey: boolean;
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    timeStamp?: number;
    wheelDelta?: number;
    wheelDeltaX?: number;
    wheelDeltaY?: number;
}
```

### Methods

#### `route(sample)`

Accepts a `WheelEvent` or another object matching `WheelGestureSample`.

```ts
const decision = input.route(event);
// "pan" | "zoom" | "pending"
```

The numeric input fields must be finite. Calling `route` after `dispose`
throws an error.

#### `reset()`

Clears the current gesture state while keeping the router reusable.

```ts
input.reset();
```

#### `dispose()`

Clears the router and prevents it from routing additional input.

```ts
input.dispose();
```

## Classification API

Use the stateless API when callback routing is not needed:

```ts
import { classifyWheelInput } from 'trackpad-input';

const result = classifyWheelInput(event);
// {
//   device: "mouse" | "trackpad" | "unknown",
//   mode: "pan" | "zoom" | "pending"
// }
```

Use `WheelGestureClassifier` when gesture lifecycle is managed by the host:

```ts
import { WheelGestureClassifier } from 'trackpad-input';

const classifier = new WheelGestureClassifier();

classifier.classify(event);
classifier.classifyDetailed(event);
classifier.resolvePendingAsZoom();
classifier.reset();
```

## Exports

```ts
import {
    WHEEL_GESTURE_DECISION_MS,
    WHEEL_GESTURE_IDLE_MS,
    WheelGestureClassifier,
    WheelInputRouter,
    classifyWheelInput,
    hasExplicitMouseWheelSignature,
    hasTrackpadPanEvidence,
    inferWheelGestureMode,
} from 'trackpad-input';
```

The package ships ESM, CommonJS, and TypeScript declarations.

## License

MIT
