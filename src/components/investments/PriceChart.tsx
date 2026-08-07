/**
 * Price-history line chart for a single asset, per spec §"Investments"
 * (price history renders). Renders nothing when the asset has no price points.
 * Uses Recharts (already a dependency) inside a fixed-height ResponsiveContainer.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { priceHistory } from '@/lib/investments';
import type { PricePoint } from '@/lib/db';

interface PriceChartProps {
  symbol: string;
  assetId: string;
  prices: PricePoint[];
}

export function PriceChart({ symbol, assetId, prices }: PriceChartProps) {
  const data = useMemo(
    () =>
      priceHistory(assetId, prices).map((p) => ({
        date: p.date,
        price: p.price,
      })),
    [assetId, prices],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{symbol} price history</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No price history yet. Record a price to see the chart.
          </p>
        ) : (
          <div
            className="w-full"
            style={{ height: 220 }}
            data-testid={`price-chart-${assetId}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
