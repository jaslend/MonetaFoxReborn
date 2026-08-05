import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCounterStore } from '@/lib/store';

export default function App() {
  const count = useCounterStore((s) => s.count);
  const increment = useCounterStore((s) => s.increment);
  const [showWelcome, setShowWelcome] = useState(true);

  return (
    <main className="bg-background min-h-screen text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">
            MonetaFox Reborn
          </h1>
          <ThemeToggle />
        </header>

        <p className="text-muted-foreground">
          A Microsoft Money replacement PWA. Phase 0 foundation scaffold —
          React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, Zustand, Dexie,
          Recharts, vite-plugin-pwa, Vitest, Playwright.
        </p>

        {showWelcome && (
          <div
            data-testid="welcome-banner"
            className="border-primary/40 bg-primary/5 rounded-lg border p-4"
          >
            <p className="font-medium">Welcome aboard.</p>
            <p className="text-muted-foreground text-sm">
              This scaffold proves the build chain end-to-end before Phase 1
              adds the crypto layer.
            </p>
          </div>
        )}

        <section className="flex flex-wrap items-center gap-3">
          <Button onClick={() => increment()}>Count: {count}</Button>
          <Button variant="outline" onClick={() => setShowWelcome((v) => !v)}>
            {showWelcome ? 'Hide welcome' : 'Show welcome'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              useCounterStore.getState().reset();
            }}
          >
            Reset
          </Button>
        </section>
      </div>
    </main>
  );
}
