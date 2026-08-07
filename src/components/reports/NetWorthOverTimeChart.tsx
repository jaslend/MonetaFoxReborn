/**
 * Net-worth-over-time line chart (Phase 10a). Renders nothing when the series
 * is empty and surfaces a missing-rate error inline instead of crashing.
 * Recharts is wrapped in a fixed-height ResponsiveContainer; animation is
 * disabled so tests/snapshots stay deterministic.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { NetWorthPoint } from '@/lib/reports';

interface NetWorthOverTimeChartProps {
  data: NetWorthPoint[];
  baseCurrency: string;
  error?: string | null;
}

export function NetWorthOverTimeChart({
  data,
  baseCurrency,
  error,
}: NetWorthOverTimeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net worth over time</CardTitle>
        <CardDescription>
          Monthly snapshots in your base currency ({baseCurrency || '—'}). Each
          point uses only transactions and prices dated on or before it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No data yet. Add accounts or transactions to see your net worth
            trend.
          </p>
        ) : (
          <div
            className="w-full"
            style={{ height: 260 }}
            data-testid="net-worth-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) =>
                    baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
                  }
                  width={90}
                />
                <Tooltip
                  formatter={(v: number) =>
                    baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Net worth"
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
