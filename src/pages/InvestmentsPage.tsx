/**
 * Investments page — Phase 9.
 *
 * Real investments view:
 * - Scope to a single investment account (only accounts of type 'investment'
 *   are listed; the user picks one from the account store).
 * - Manage assets (add/edit: symbol, name, type) — assets are global across
 *   accounts, listed once.
 * - Manage holdings (add/edit units per asset) scoped to the selected
 *   investment account.
 * - Portfolio overview: each holding shows units, latest price, value
 *   (formatted via formatCurrency), plus the total portfolio value for the
 *   account.
 * - Manual price entry (add a dated PricePoint) AND an "update price" button
 *   that fetches the live price via the automatic provider.
 * - A price-history chart per asset using Recharts.
 *
 * Reuses the encrypted investment store; no direct DB access from the page.
 * Prices are plain numbers in the base currency, so values are formatted in
 * the base currency (falling back to a raw number when no base currency is set).
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { latestPrice } from '@/lib/investments';
import { listPriceProviders } from '@/lib/investments';
import type { Asset, Holding } from '@/lib/db';

import { useAccountStore } from '@/stores/accountStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useSettingsStore } from '@/stores/settingsStore';

import {
  AssetForm,
  type AssetFormValues,
} from '@/components/investments/AssetForm';
import {
  HoldingForm,
  type HoldingFormValues,
} from '@/components/investments/HoldingForm';
import {
  PriceForm,
  type PriceFormValues,
} from '@/components/investments/PriceForm';
import { PriceChart } from '@/components/investments/PriceChart';

const TYPE_LABELS: Record<Asset['type'], string> = {
  stock: 'Stock',
  etf: 'ETF',
  mutual: 'Mutual fund',
  bond: 'Bond',
  commodity: 'Commodity',
  crypto: 'Crypto',
  forex: 'Forex',
  other: 'Other',
};

export function InvestmentsPage() {
  const accounts = useAccountStore((s) => s.items);
  const assets = useInvestmentStore((s) => s.assets);
  const holdings = useInvestmentStore((s) => s.holdings);
  const prices = useInvestmentStore((s) => s.prices);
  const settings = useSettingsStore((s) => s.items[0]);

  const createAsset = useInvestmentStore((s) => s.createAsset);
  const updateAsset = useInvestmentStore((s) => s.updateAsset);
  const removeAsset = useInvestmentStore((s) => s.removeAsset);
  const createHolding = useInvestmentStore((s) => s.createHolding);
  const updateHolding = useInvestmentStore((s) => s.updateHolding);
  const removeHolding = useInvestmentStore((s) => s.removeHolding);
  const recordPrice = useInvestmentStore((s) => s.recordPrice);
  const updatePriceViaProvider = useInvestmentStore(
    (s) => s.updatePriceViaProvider,
  );
  const portfolioValueFor = useInvestmentStore((s) => s.portfolioValueFor);

  const baseCurrency = settings?.baseCurrency ?? '';

  const investmentAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment' && !a.archived),
    [accounts],
  );

  const [accountId, setAccountId] = useState<string>('');
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [holdingFormOpen, setHoldingFormOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [priceAssetId, setPriceAssetId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string>(
    () => listPriceProviders().find((id) => id !== 'manual') ?? 'manual',
  );
  const [status, setStatus] = useState<string | null>(null);

  // Auto-select the first investment account when none is chosen yet.
  const effectiveAccountId = accountId || (investmentAccounts[0]?.id ?? '');

  const accountHoldings = useMemo(
    () => holdings.filter((h) => h.accountId === effectiveAccountId),
    [holdings, effectiveAccountId],
  );

  const assetById = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const display = (amount: number): string =>
    baseCurrency ? formatCurrency(amount, baseCurrency) : String(amount);

  const handleAssetSubmit = async (values: AssetFormValues) => {
    if (editingAsset) {
      await updateAsset(editingAsset.id, values);
    } else {
      await createAsset(values);
    }
    setAssetFormOpen(false);
    setEditingAsset(null);
  };

  const handleHoldingSubmit = async (values: HoldingFormValues) => {
    if (!effectiveAccountId) return;
    if (editingHolding) {
      await updateHolding(editingHolding.id, {
        assetId: values.assetId,
        units: values.units,
      });
    } else {
      await createHolding({
        accountId: effectiveAccountId,
        assetId: values.assetId,
        units: values.units,
      });
    }
    setHoldingFormOpen(false);
    setEditingHolding(null);
  };

  const handlePriceSubmit = async (values: PriceFormValues) => {
    if (!priceAssetId) return;
    await recordPrice({ assetId: priceAssetId, ...values });
    setPriceAssetId(null);
  };

  const handleUpdateViaProvider = async (assetId: string) => {
    setStatus(null);
    try {
      await updatePriceViaProvider(assetId, providerId);
      setStatus('Price updated.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Investments</h1>
        <Button
          onClick={() => {
            setEditingAsset(null);
            setAssetFormOpen(true);
          }}
          data-testid="add-asset"
        >
          Add asset
        </Button>
      </div>

      {investmentAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              No investment accounts yet. Create an account of type
              &ldquo;Investment&rdquo; on the Accounts page first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Scope the portfolio to a single investment account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select
                className="border-border bg-background ring-offset-background flex h-9 w-full max-w-sm rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
                aria-label="Investment account"
                data-testid="investment-account-select"
              >
                {investmentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portfolio</CardTitle>
              <CardDescription>
                Holdings in{' '}
                {investmentAccounts.find((a) => a.id === effectiveAccountId)
                  ?.name ?? ''}{' '}
                — total {display(portfolioValueFor(effectiveAccountId))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accountHoldings.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No holdings in this account yet. Click{' '}
                  <strong>Add holding</strong> to create one.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {accountHoldings.map((h) => {
                    const asset = assetById.get(h.assetId);
                    const price = latestPrice(h.assetId, prices);
                    const value = price === undefined ? 0 : h.units * price;
                    return (
                      <div
                        key={h.id}
                        className="border-border flex flex-col gap-2 rounded-md border p-3"
                        data-testid={`holding-row-${h.id}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {asset?.symbol ?? '(deleted asset)'}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {asset ? TYPE_LABELS[asset.type] : ''} ·{' '}
                              {asset?.name ?? ''}
                            </span>
                          </div>
                          <div className="flex flex-col text-right text-sm">
                            <span data-testid={`holding-units-${h.id}`}>
                              {h.units} units
                            </span>
                            <span data-testid={`holding-price-${h.id}`}>
                              {price === undefined
                                ? 'no price'
                                : display(price)}
                            </span>
                            <span
                              className="font-semibold"
                              data-testid={`holding-value-${h.id}`}
                            >
                              {display(value)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingHolding(h);
                              setHoldingFormOpen(true);
                            }}
                            data-testid={`edit-holding-${h.id}`}
                          >
                            Edit units
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPriceAssetId(h.assetId)}
                            data-testid={`manual-price-${h.id}`}
                          >
                            Manual price
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateViaProvider(h.assetId)}
                            data-testid={`update-price-${h.id}`}
                          >
                            Update price
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeHolding(h.id)}
                            data-testid={`delete-holding-${h.id}`}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    className="self-start"
                    onClick={() => {
                      setEditingHolding(null);
                      setHoldingFormOpen(true);
                    }}
                    data-testid="add-holding"
                  >
                    Add holding
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automatic price provider</CardTitle>
              <CardDescription>
                Used by the &ldquo;Update price&rdquo; buttons. The manual
                provider never fetches.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                className="border-border bg-background ring-offset-background flex h-9 max-w-sm rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                aria-label="Price provider"
                data-testid="provider-select"
              >
                {listPriceProviders().map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {status ? (
                <span
                  className="text-muted-foreground text-sm"
                  role="status"
                  data-testid="price-status"
                >
                  {status}
                </span>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <CardDescription>
                Manage the global asset catalogue. Holdings reference these.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assets.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No assets yet. Click <strong>Add asset</strong> to create one.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {assets.map((a) => (
                    <li
                      key={a.id}
                      className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                      data-testid={`asset-row-${a.id}`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {a.symbol}{' '}
                          <span className="text-muted-foreground text-xs">
                            ({TYPE_LABELS[a.type]})
                          </span>
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {a.name}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingAsset(a);
                            setAssetFormOpen(true);
                          }}
                          data-testid={`edit-asset-${a.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeAsset(a.id)}
                          data-testid={`delete-asset-${a.id}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {assets.map((a) => (
            <PriceChart
              key={a.id}
              symbol={a.symbol}
              assetId={a.id}
              prices={prices}
            />
          ))}
        </>
      )}

      <AssetForm
        open={assetFormOpen}
        initial={
          editingAsset
            ? {
                id: editingAsset.id,
                symbol: editingAsset.symbol,
                name: editingAsset.name,
                type: editingAsset.type,
              }
            : undefined
        }
        onSubmit={handleAssetSubmit}
        onCancel={() => {
          setAssetFormOpen(false);
          setEditingAsset(null);
        }}
      />

      <HoldingForm
        open={holdingFormOpen}
        assets={assets}
        initial={
          editingHolding
            ? {
                id: editingHolding.id,
                assetId: editingHolding.assetId,
                units: editingHolding.units,
              }
            : undefined
        }
        onSubmit={handleHoldingSubmit}
        onCancel={() => {
          setHoldingFormOpen(false);
          setEditingHolding(null);
        }}
      />

      <PriceForm
        open={priceAssetId !== null}
        symbol={priceAssetId ? (assetById.get(priceAssetId)?.symbol ?? '') : ''}
        onSubmit={handlePriceSubmit}
        onCancel={() => setPriceAssetId(null)}
      />
    </div>
  );
}
