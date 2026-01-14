import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_STYLES,
  CHART_COLORS,
  CHART_MARGINS,
  ANIMATION_CONFIG,
  CustomCurrencyTooltip,
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
} from '@/utils/chartConfig';
import { useSalesReport, useCustomerHistory } from '@/hooks/useAnalytics';
import {
  ShoppingCart,
  Wallet,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { formatOrderNumber } from '@/lib/utils';

const currency = (value, options = {}) => formatCurrency(value, options);

const normalizeStatus = (status) => String(status || '').toLowerCase();

const getStatusBadgeClasses = (status) => {
  const normalized = normalizeStatus(status);
  if (['completed', 'success', 'paid', 'settled'].includes(normalized)) {
    return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
  }
  if (['pending', 'processing', 'in_progress'].includes(normalized)) {
    return 'border border-amber-200 bg-amber-100 text-amber-700';
  }
  if (
    ['failed', 'declined', 'voided', 'cancelled', 'refunded'].includes(
      normalized
    )
  ) {
    return 'border border-red-200 bg-red-100 text-red-700';
  }
  return 'border border-slate-200 bg-slate-100 text-slate-700';
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
};

const formatOrderLabel = (transaction) => {
  // Try multiple possible field names for order number
  const raw =
    transaction?.orderNumber ||
    transaction?.order_number ||
    transaction?.orderReference ||
    transaction?.order_reference ||
    transaction?.reference ||
    transaction?.orderId ||
    transaction?.order_id ||
    transaction?.id ||
    '';

  if (!raw) return '';

  const formatted = formatOrderNumber(String(raw));
  return formatted || String(raw);
};

export default function OrdersPanel() {
  const {
    salesData,
    loading: salesLoading,
    error: salesError,
  } = useSalesReport('30d');
  const {
    customerData,
    loading: customerLoading,
    error: customerError,
  } = useCustomerHistory();

  const loading = salesLoading || customerLoading;
  const error = salesError || customerError;

  const paymentsByMethod = useMemo(() => {
    if (!salesData?.byMethod) return [];
    const entries = Object.entries(salesData.byMethod || {});
    const total = entries.reduce(
      (sum, [, amount]) => sum + Number(amount || 0),
      0
    );

    return entries.map(([key, amount], index) => {
      const numeric = Number(amount || 0);
      const label = key
        ? key.charAt(0).toUpperCase() + key.slice(1)
        : 'Unknown';
      return {
        key,
        name: label,
        amount: numeric,
        share: total ? (numeric / total) * 100 : 0,
        color: CHART_COLORS.palette[index % CHART_COLORS.palette.length],
      };
    });
  }, [salesData]);

  const methodColorLookup = useMemo(() => {
    const map = new Map();
    paymentsByMethod.forEach((entry) => {
      map.set(entry.name.toLowerCase(), entry.color);
    });
    return map;
  }, [paymentsByMethod]);

  const topPaymentMethod = useMemo(() => {
    if (!paymentsByMethod.length) return null;
    return paymentsByMethod.reduce(
      (best, entry) => (!best || entry.amount > best.amount ? entry : best),
      null
    );
  }, [paymentsByMethod]);

  const dailyOrders = useMemo(() => {
    if (!customerData.length) return [];
    const map = new Map();
    customerData.forEach((transaction) => {
      const dateKey = new Date(transaction.date).toLocaleDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, { name: dateKey, orders: 0, revenue: 0 });
      }
      const bucket = map.get(dateKey);
      bucket.orders += 1;
      bucket.revenue += Number(transaction.amount || 0);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.name) - new Date(b.name)
    );
  }, [customerData]);

  const summary = useMemo(() => {
    const orders = customerData.length;
    const revenue = customerData.reduce(
      (sum, transaction) => sum + Number(transaction.amount || 0),
      0
    );
    const completedCount = customerData.reduce(
      (count, transaction) =>
        count + (normalizeStatus(transaction.status) === 'completed' ? 1 : 0),
      0
    );
    const average = orders ? revenue / orders : 0;
    const completionRate = orders ? (completedCount / orders) * 100 : 0;

    return {
      orders,
      revenue,
      average,
      completionRate,
    };
  }, [customerData]);

  const recentTransactions = useMemo(
    () => customerData.slice(0, 8),
    [customerData]
  );

  const ordersGradient = useMemo(
    () => ({
      id: 'ordersLineGradient',
      definition: (
        <linearGradient id="ordersLineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
        </linearGradient>
      ),
    }),
    []
  );
  const revenueGradient = useMemo(
    () => ({
      id: 'ordersRevenueGradient',
      definition: (
        <linearGradient id="ordersRevenueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#f97316" stopOpacity={0.9} />
          <stop offset="95%" stopColor="#f97316" stopOpacity={0.5} />
        </linearGradient>
      ),
    }),
    []
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-6 mb-4">
              <ShoppingCart className="h-12 w-12 text-primary animate-pulse" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Loading Orders &amp; Transactions
          </h3>
          <p className="text-sm text-muted-foreground">
            Gathering transaction history and order insights...
          </p>
          <div className="flex gap-2 mt-4">
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <div
              className="w-2 h-2 bg-primary rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="absolute inset-0 bg-destructive/20 blur-2xl rounded-full" />
            <div className="relative bg-gradient-to-br from-destructive/10 to-destructive/5 rounded-full p-6 mb-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2 text-destructive">
            Error Loading Order Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            Unable to fetch order and transaction details. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-primary/10 via-card to-primary/5 dark:from-primary/20 dark:via-card dark:to-primary/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-primary/10 rounded-lg p-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Total Orders
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              {formatNumber(summary.orders)}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-primary">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs font-medium">
                Tracked over the latest records
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-emerald-50 via-card to-emerald-50/30 dark:from-emerald-950/20 dark:via-card dark:to-emerald-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-emerald-500/10 rounded-lg p-2">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Collected Revenue
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              {currency(summary.revenue)}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-emerald-600">
              <Sparkles className="h-3 w-3" />
              <span className="text-xs font-medium">Latest payments</span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-50 via-card to-purple-50/30 dark:from-purple-950/20 dark:via-card dark:to-purple-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-purple-500/10 rounded-lg p-2">
                <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Average Order Value
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
              {currency(summary.average, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-purple-600">
              <TrendingUp className="h-3 w-3" />
              <span className="text-xs font-medium">Across recorded sales</span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-amber-50 via-card to-amber-50/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-amber-500/10 rounded-lg p-2">
                <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Payment Reliability
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
              {`${summary.completionRate.toFixed(1)}%`}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-amber-600">
              <CreditCard className="h-3 w-3" />
              <span className="text-xs font-medium">
                {topPaymentMethod
                  ? `Top method: ${topPaymentMethod.name} • ${topPaymentMethod.share.toFixed(1)}%`
                  : 'Awaiting transaction mix'}
              </span>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="col-span-1 lg:col-span-2 relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 rounded-lg p-2">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-bold">
                Orders vs Revenue
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Daily order counts compared with collected revenue
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            {dailyOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">No order data available</p>
              </div>
            ) : (
              <div className="relative -mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible">
                <div className="h-[260px] min-w-[520px] sm:min-w-0 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={dailyOrders}
                      margin={{ left: 8, right: 24 }}
                      {...ANIMATION_CONFIG.entrance}
                    >
                      <defs>
                        {ordersGradient.definition}
                        {revenueGradient.definition}
                        <filter id="ordersShadow" height="200%">
                          <feDropShadow
                            dx="0"
                            dy="2"
                            stdDeviation="3"
                            floodOpacity="0.25"
                          />
                        </filter>
                      </defs>
                      <CartesianGrid
                        strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                        opacity={CHART_STYLES.grid.opacity}
                      />
                      <XAxis dataKey="name" tick={CHART_STYLES.axisTick} />
                      <YAxis
                        yAxisId="left"
                        tick={CHART_STYLES.axisTick}
                        width={60}
                        tickFormatter={(value) => formatCompactCurrency(value)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={CHART_STYLES.axisTick}
                        width={50}
                        tickFormatter={(value) => formatNumber(value, true)}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length)
                            return null;
                          return (
                            <div style={CHART_STYLES.tooltip.contentStyle}>
                              <p style={CHART_STYLES.tooltip.labelStyle}>
                                {label}
                              </p>
                              {payload.map((entry, index) => (
                                <p
                                  key={`tooltip-item-${index}`}
                                  style={{
                                    ...CHART_STYLES.tooltip.itemStyle,
                                    color: entry.color,
                                  }}
                                >
                                  <span className="font-medium">
                                    {entry.name}:
                                  </span>{' '}
                                  <span className="font-semibold">
                                    {entry.name === 'Revenue'
                                      ? formatCurrency(entry.value)
                                      : formatNumber(entry.value)}
                                  </span>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={CHART_STYLES.legend.wrapperStyle} />
                      <Bar
                        yAxisId="left"
                        dataKey="revenue"
                        name="Revenue"
                        fill={`url(#${revenueGradient.id})`}
                        stroke="#f97316"
                        strokeWidth={1}
                        radius={[8, 8, 0, 0]}
                        maxBarSize={52}
                        filter="url(#ordersShadow)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="orders"
                        name="Orders"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#22c55e' }}
                        activeDot={{ r: 6, fill: '#22c55e' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-purple-400/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-purple-500/10 rounded-lg p-2">
                <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-base font-bold">Payment Mix</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Share of each payment method
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 relative">
            {paymentsByMethod.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">No payment data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paymentsByMethod}
                  margin={CHART_MARGINS.default}
                  {...ANIMATION_CONFIG.entrance}
                >
                  <CartesianGrid
                    strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                    opacity={CHART_STYLES.grid.opacity}
                  />
                  <XAxis dataKey="name" tick={CHART_STYLES.axisTick} />
                  <YAxis
                    tick={CHART_STYLES.axisTick}
                    width={60}
                    tickFormatter={(value) => formatCompactCurrency(value)}
                  />
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Bar
                    dataKey="amount"
                    name="Amount"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={56}
                  >
                    {paymentsByMethod.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-slate-400/10 to-transparent rounded-full blur-3xl" />
        <CardHeader className="pb-3 relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-slate-500/10 rounded-lg p-2">
              <ShieldCheck className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <CardTitle className="text-base font-bold">
              Recent Transactions
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Latest payment activity and order fulfillment
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-6"
                    >
                      No recent transactions
                    </TableCell>
                  </TableRow>
                ) : (
                  recentTransactions.map((transaction) => {
                    const orderLabel = formatOrderLabel(transaction);
                    const orderDisplay = orderLabel ? `#${orderLabel}` : '#—';
                    const methodRaw = transaction.method || '';
                    const methodDisplay = methodRaw
                      ? methodRaw.charAt(0).toUpperCase() + methodRaw.slice(1)
                      : 'Unknown';
                    const methodColor = methodColorLookup.get(
                      methodDisplay.toLowerCase()
                    );
                    const methodStyle = methodColor
                      ? {
                          backgroundColor: `${methodColor}1a`,
                          color: methodColor,
                          borderColor: `${methodColor}33`,
                        }
                      : undefined;

                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="p-4 align-middle font-medium">
                          {orderDisplay}
                        </TableCell>
                        <TableCell className="p-4 align-middle text-right">
                          {currency(transaction.amount)}
                        </TableCell>
                        <TableCell className="p-4 align-middle">
                          <Badge
                            variant="outline"
                            className="capitalize"
                            style={methodStyle}
                          >
                            {methodDisplay}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4 align-middle">
                          <Badge
                            variant="outline"
                            className={getStatusBadgeClasses(
                              transaction.status
                            )}
                          >
                            {transaction.status
                              ? transaction.status.toUpperCase()
                              : 'UNKNOWN'}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4 align-middle whitespace-nowrap">
                          {formatTimestamp(transaction.date)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
