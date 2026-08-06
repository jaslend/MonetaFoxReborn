import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';

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
