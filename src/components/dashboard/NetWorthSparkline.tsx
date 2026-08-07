/**
 * Net-worth sparkline (Phase 10b dashboard). A compact, axis-less Recharts
 * line chart of the net-worth-over-time series rendered inside the net-worth
 * card. Renders nothing when the series is empty/errored so the card stays
 * clean in the empty state; animation is disabled for deterministic output.
 */
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatCurrency } from '@/lib/currency';
import type { NetWorthPoint } from '@/lib/reports';

interface NetWorthSparklineProps {
  data: NetWorthPoint[];
  baseCurrency: string;
}

export function NetWorthSparkline({
  data,
  baseCurrency,
}: NetWorthSparklineProps) {
  if (!data || data.length < 2) return null;
  return (
    <div
      className="w-full"
      style={{ height: 80 }}
      data-testid="net-worth-sparkline"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
        >
          <Tooltip
            formatter={(v: number) =>
              baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
            }
            labelFormatter={(l: string) => l}
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
  );
}
