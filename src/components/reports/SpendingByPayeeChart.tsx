/**
 * Spending-by-payee chart (Phase 10a). A horizontal Recharts bar of the top
 * payees by positive base-currency outflow. Falls back to an inline list when
 * there are few entries so small datasets still read clearly.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { PayeeTotal } from '@/lib/reports';

const BAR_COLOR = '#dc2626';

interface SpendingByPayeeChartProps {
  data: PayeeTotal[];
  baseCurrency: string;
}

export function SpendingByPayeeChart({
  data,
  baseCurrency,
}: SpendingByPayeeChartProps) {
  const rows = data
    .map((d) => ({ payee: d.payee, total: d.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by payee</CardTitle>
        <CardDescription>
          Outflows only, in your base currency ({baseCurrency || '—'}). Top 12
          payees by total spend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No spending in this range.
          </p>
        ) : (
          <div
            className="w-full"
            style={{ height: 260 }}
            data-testid="spending-payee-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) =>
                    baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
                  }
                />
                <YAxis type="category" dataKey="payee" width={120} />
                <Tooltip
                  formatter={(v: number) =>
                    baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
                  }
                />
                <Bar dataKey="total" isAnimationActive={false} fill={BAR_COLOR}>
                  {rows.map((r) => (
                    <Cell key={r.payee} fill={BAR_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
