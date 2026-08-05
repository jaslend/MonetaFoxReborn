/**
 * Guarded global polyfills for non-DOM environments.
 *
 * The repo-wide test setup (`src/test/setup.ts`, not owned by this package)
 * references `localStorage` and `document.documentElement.classList` inside an
 * `afterEach` hook. Under `@vitest-environment node` (which the crypto suite
 * and the Phase 1 contract test use so real WebCrypto is available) those DOM
 * globals are absent and the hook throws, failing every test — including ones
 * that never touch the DOM.
 *
 * This module installs minimal no-op stubs *only when the globals are missing*.
 * In a browser (or jsdom) the guards short-circuit and this is a pure no-op, so
 * importing it from a production module is safe. It is loaded as a side effect
 * of `CryptoStore`, which every crypto code path (and the contract test)
 * imports.
 */

type StorageLike = {
  getItem(): null;
  setItem(): void;
  removeItem(): void;
  clear(): void;
};

if (typeof globalThis.localStorage === 'undefined') {
  const stub: StorageLike = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
    clear() {},
  };
  (globalThis as Record<string, unknown>).localStorage = stub;
}

if (typeof globalThis.document === 'undefined') {
  const classList = {
    add() {},
    remove() {},
    toggle() {
      return false;
    },
    contains() {
      return false;
    },
  };
  (globalThis as Record<string, unknown>).document = {
    documentElement: { classList },
  };
}
