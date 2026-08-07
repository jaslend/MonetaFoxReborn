/**
 * Income vs expenses bar chart (Phase 10a). Two bars (Income, Expenses) in
 * the base currency, with the net shown in the card description. Expenses are
 * reported as a positive total (the convention for spending).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

interface IncomeVsExpensesChartProps {
  data: { income: number; expenses: number; net: number };
  baseCurrency: string;
}

export function IncomeVsExpensesChart({
  data,
  baseCurrency,
}: IncomeVsExpensesChartProps) {
  const rows = [
    { name: 'Income', value: data.income, fill: '#16a34a' },
    { name: 'Expenses', value: data.expenses, fill: '#dc2626' },
  ];
  const hasData = data.income !== 0 || data.expenses !== 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs expenses</CardTitle>
        <CardDescription>
          Net for this range: {formatCurrency(data.net, baseCurrency || 'USD')}{' '}
          ({baseCurrency || '—'}). Expenses shown as a positive total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-muted-foreground text-sm">
            No income or expenses in this range.
          </p>
        ) : (
          <div
            className="w-full"
            style={{ height: 260 }}
            data-testid="income-expenses-chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis
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
                <Legend />
                <Bar dataKey="value" isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.name} fill={r.fill} />
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
