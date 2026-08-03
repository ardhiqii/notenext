import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom (with pretendToBeVisual) provides requestAnimationFrame, but keep a
// defensive polyfill so focus-on-next-tick logic in components is stable.
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame;
}

afterEach(() => {
  cleanup();
});
