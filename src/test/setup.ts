import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

// jsdom does not implement matchMedia; provide a minimal stub so components
// that read prefers-color-scheme (e.g. the theme toggle) render in tests.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

beforeEach(() => {
  // fake-indexeddb stores databases on a per-factory basis. Within a single
  // Vitest worker the module-level `indexedDB` global installed by
  // `fake-indexeddb/auto` (imported by many test files) is shared across ALL
  // test files run by that worker, and it is never reset. Rows written by one
  // suite therefore leak into another (e.g. a `MonetaFoxDB`/`monetafox` auth
  // row, or a transactions row), making assertions order-dependent and flaky.
  // Install a brand-new IDBFactory before every test so each test starts with
  // an empty set of databases — true isolation regardless of import order or
  // worker assignment. This works in both the jsdom and node environments
  // because we replace whatever `indexedDB` currently lives on the global
  // (or set it for the first time if no file imported the auto shim yet).
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB =
    new IDBFactory();
});

afterEach(() => {
  cleanup();
  // These globals are absent under @vitest-environment node (the crypto and
  // data-layer suites), so guard them — mirroring the matchMedia guard above —
  // to keep node-env tests from crashing on teardown.
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('monetafox-theme');
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark');
  }
});
