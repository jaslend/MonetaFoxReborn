/**
 * First-run base-currency picker. Shown by the Accounts page when no base
 * currency is set yet (spec: single base currency, fixed at setup). The user
 * must choose one before any accounts can be created.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CurrencySelect } from './CurrencySelect';

interface CurrencySetupProps {
  onChoose: (code: string) => Promise<void> | void;
  busy?: boolean;
}

export function CurrencySetup({ onChoose, busy }: CurrencySetupProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChoose = async () => {
    if (!code) {
      setError('Please choose a base currency.');
      return;
    }
    setError(null);
    try {
      await onChoose(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose your base currency</CardTitle>
        <CardDescription>
          MonetaFox uses a single base currency, fixed at setup. Foreign and
          crypto accounts are stored in their own currency and converted to your
          base currency for reporting. You can change this only while no
          accounts or transactions exist.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CurrencySelect
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Base currency"
          data-testid="base-currency-select"
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          onClick={handleChoose}
          disabled={busy || !code}
          data-testid="base-currency-confirm"
        >
          Set base currency
        </Button>
      </CardContent>
    </Card>
  );
}
