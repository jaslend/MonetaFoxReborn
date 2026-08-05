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
  localStorage.removeItem('monetafox-theme');
  document.documentElement.classList.remove('dark');
});
