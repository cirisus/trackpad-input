# trackpad-input

`trackpad-input` distinguishes trackpad gestures from mouse-wheel input and
routes two-finger scrolling to pan. It is a small, framework-agnostic browser
utility with no runtime dependencies.

Most wheel helpers reduce every `wheel` event to a zoom delta. That works for a
mouse wheel, but makes a trackpad feel wrong: two-finger movement is naturally
two-dimensional and should usually pan a map, canvas, timeline, or workspace.

## Install

```sh
npm install trackpad-input
```

## Route wheel input

`WheelInputRouter` buffers an ambiguous leading frame for 40 ms, locks one
decision for the gesture, and resets after 120 ms of input inactivity.

```ts
import { WheelInputRouter } from 'trackpad-input';

const surface = document.querySelector<HTMLElement>('.surface')!;

const input = new WheelInputRouter<WheelEvent>({
    onPan(event, { device }) {
        // device is "trackpad" here.
        camera.panBy(event.deltaX, event.deltaY);
    },
    onZoom(event, { device }) {
        // device is "mouse", "trackpad" (pinch), or "unknown".
        camera.zoomBy(-event.deltaY);
    },
});

surface.addEventListener(
    'wheel',
    (event) => {
        event.preventDefault();
        input.route(event);
    },
    { passive: false },
);

// Call input.dispose() when the surface is removed.
```

Buffered samples are replayed in order. If a gesture starts vertically and a
horizontal component arrives inside the decision window, the full gesture is
routed to `onPan`, including its first frame.

## Device distinction

Browsers do not expose the physical source of a `WheelEvent`. The package uses
conservative, inspectable signals instead of pretending detection is perfect:

| Signal | Device | Route |
| --- | --- | --- |
| Pixel-mode input with a horizontal component | Trackpad | Pan |
| Pixel-mode `ctrlKey` input (browser pinch convention) | Trackpad | Zoom |
| Line/page delta mode or legacy 120-unit notch fields | Mouse | Zoom |
| Pure vertical pixel-mode input | Unknown | Briefly pending, then zoom |

Pure vertical pixel input is genuinely ambiguous: it can be a high-resolution
mouse or a perfectly vertical trackpad gesture. `trackpad-input` falls back to
zoom rather than misrouting mouse-wheel input to pan. Once trackpad pan is
detected, vertical and legacy-looking momentum frames stay in pan until the
gesture ends.

## Low-level classification

Use `classifyWheelInput` for a stateless result or
`WheelGestureClassifier` when you manage buffering and gesture lifetime
yourself.

```ts
import { classifyWheelInput } from 'trackpad-input';

const result = classifyWheelInput(event);
// { device: "mouse" | "trackpad" | "unknown",
//   mode: "pan" | "zoom" | "pending" }
```

The default timing constants are exported as `WHEEL_GESTURE_DECISION_MS` and
`WHEEL_GESTURE_IDLE_MS`. Both can be overridden through `WheelInputRouter`.

## License

MIT
