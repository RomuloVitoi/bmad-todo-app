import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement the Pointer Capture APIs. Radix Toast's swipe
// gesture handling calls these unconditionally, so without a stub every
// pointer interaction throws `target.hasPointerCapture is not a function`.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

afterEach(() => {
  cleanup();
});
