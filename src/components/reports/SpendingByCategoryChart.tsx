/**
 * Spending-by-category chart (Phase 10a). A Recharts pie of positive base
 * totals; the legend lists each category's formatted amount. Slices are
 * coloured from a fixed palette so output stays deterministic.
 */
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { CategoryTotal } from '@/lib/reports';

const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#65a30d',
  '#db2777',
  '#475569',
  '#0d9488',
];

interface SpendingByCategoryChartProps {
  data: CategoryTotal[];
  categoryNames: Record<string, string>;
  baseCurrency: string;
}

export function SpendingByCategoryChart({
  data,
  categoryNames,
  baseCurrency,
}: SpendingByCategoryChartProps) {
  const rows = data
    .map((d) => ({
      name: categoryNames[d.categoryId] ?? d.categoryId,
      value: d.total,
      categoryId: d.categoryId,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          Outflows only, in your base currency ({baseCurrency || '—'}). Split
          lines count toward their own category.
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
            data-testid="spending-category-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  isAnimationActive={false}
                  outerRadius={90}
                  label={(e: { name?: string }) => e.name ?? ''}
                >
                  {rows.map((r, i) => (
                    <Cell
                      key={r.categoryId}
                      fill={PALETTE[i % PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) =>
                    baseCurrency ? formatCurrency(v, baseCurrency) : String(v)
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
