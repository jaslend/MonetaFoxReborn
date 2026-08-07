/**
 * Phase 12 — first-run onboarding / getting-started guide.
 *
 * Shown by the Dashboard when the vault is empty (no accounts yet). It walks
 * the user through the three setup steps (set base currency, add an account,
 * import data) with deep-links into the relevant pages, and offers a one-click
 * "load the sample dataset" action so the app can be evaluated end-to-end
 * before the user commits any real data. The sample data is clearly marked
 * and can be cleared from Settings without touching real records.
 */
import { Link } from 'react-router-dom';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface GettingStartedProps {
  /** Called when the user clicks "Load sample data". The Dashboard owns the
   * actual load (writes via the session repositories then refreshes stores). */
  onLoadSample: () => void;
  /** True while the sample dataset is being written (disables the button). */
  loading?: boolean;
}

const STEPS: { to: string; title: string; desc: string }[] = [
  {
    to: '/settings',
    title: 'Set your base currency',
    desc: 'Choose the single currency MonetaFox reports in. This is fixed once accounts or transactions exist.',
  },
  {
    to: '/accounts',
    title: 'Add an account',
    desc: 'Create a checking, savings, credit, cash, loan, or investment account to start tracking.',
  },
  {
    to: '/settings',
    title: 'Import your data',
    desc: 'Import QIF files from Microsoft Money or other apps, or restore an encrypted backup.',
  },
];

export function GettingStarted({ onLoadSample, loading }: GettingStartedProps) {
  return (
    <Card data-testid="onboarding-getting-started">
      <CardHeader>
        <CardTitle>Welcome to MonetaFox</CardTitle>
        <CardDescription>
          Your money, encrypted on this device. Get started in three steps — or
          load a sample dataset to explore the app first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <Link
                  to={step.to}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {step.title}
                </Link>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="border-border flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="font-medium">Explore with sample data</span>
            <span className="text-muted-foreground text-sm">
              Load a couple of months of realistic, clearly-marked sample
              transactions you can clear later from Settings.
            </span>
          </div>
          <Button
            onClick={onLoadSample}
            disabled={loading}
            data-testid="onboarding-load-sample"
          >
            {loading ? 'Loading…' : 'Load sample data'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
