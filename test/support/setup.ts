import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});

if (typeof window !== "undefined") {
  // jsdom has no layout: give components the browser APIs they call.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL ??= vi.fn(() => "blob:test");
  URL.revokeObjectURL ??= vi.fn();
  Element.prototype.scrollTo ??= function () {};
  Element.prototype.scrollIntoView ??= function () {};
}
