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
  Legend,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useInventoryReport } from '@/hooks/useAnalytics';
import {
  ANIMATION_CONFIG,
  CHART_STYLES,
  CustomNumericTooltip,
  formatPercent,
} from '@/utils/chartConfig';
import {
  Package,
  AlertTriangle,
  Clock,
  PackageCheck,
  Sparkles,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

export default function InventoryPanel() {
  const { inventoryData, loading, error } = useInventoryReport();

  // Calculate coverage data (stock levels with color coding)
  const coverageLimit = 24;
  const coverageChartData = useMemo(() => {
    return inventoryData
      .map((item) => {
        const minStockValue = Number(item.minStock || 0);
        const ratio =
          minStockValue > 0
            ? item.quantity / minStockValue
            : item.quantity > 0
              ? 3
              : 0;
        let fill;
        let status;

        if (item.quantity === 0 || ratio < 0.5) {
          fill = '#dc2626'; // Critical - Darker Red
          status = 'Critical';
        } else if (ratio <= 1.0) {
          fill = '#f59e0b'; // Low - Orange
          status = 'Low';
        } else if (ratio <= 2.0) {
          fill = '#3b82f6'; // Medium - Blue
          status = 'Medium';
        } else {
          fill = '#10b981'; // Healthy - Green
          status = 'Healthy';
        }

        return {
          name: item.name,
          quantity: item.quantity,
          minStock: minStockValue,
          ratio,
          ratioLabel: minStockValue > 0 ? `${ratio.toFixed(1)}x` : 'No min',
          status,
          fill,
          unit: item.unit,
        };
      })
      .sort((a, b) => a.ratio - b.ratio || a.name.localeCompare(b.name))
      .slice(0, coverageLimit);
  }, [inventoryData]);
  const coverageChartHeight = Math.max(240, coverageChartData.length * 28);

  // Calculate stock distribution
  const stockDistribution = useMemo(() => {
    const critical = inventoryData.filter(
      (i) => i.quantity <= i.minStock * 0.5
    ).length;
    const low = inventoryData.filter(
      (i) => i.quantity > i.minStock * 0.5 && i.quantity <= i.minStock
    ).length;
    const medium = inventoryData.filter(
      (i) => i.quantity > i.minStock && i.quantity <= i.minStock * 2
    ).length;
    const healthy = inventoryData.filter(
      (i) => i.quantity > i.minStock * 2
    ).length;

    return [
      { name: 'Critical', value: critical, fill: '#dc2626' },
      { name: 'Low', value: low, fill: '#f59e0b' },
      { name: 'Medium', value: medium, fill: '#3b82f6' },
      { name: 'Healthy', value: healthy, fill: '#10b981' },
    ];
  }, [inventoryData]);

  const lowStock = useMemo(
    () => inventoryData.filter((i) => i.quantity <= i.minStock).length,
    [inventoryData]
  );

  const soonToExpire = useMemo(() => {
    const now = new Date();
    const thresholdDays = 7;
    return inventoryData
      .filter((i) => i.expiryDate)
      .map((i) => ({
        ...i,
        daysToExpiry: Math.ceil(
          (new Date(i.expiryDate) - now) / (1000 * 60 * 60 * 24)
        ),
      }))
      .filter((i) => i.daysToExpiry <= thresholdDays)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  }, [inventoryData]);

  const totalItems = inventoryData.length;
  const healthyStock = totalItems - lowStock;
  const lowStockPercent = totalItems > 0 ? (lowStock / totalItems) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-6 mb-4">
              <Sparkles className="h-12 w-12 text-primary animate-pulse" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Loading Inventory Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            Fetching stock data and metrics...
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
            Error Loading Inventory Data
          </h3>
          <p className="text-sm text-muted-foreground">
            Unable to fetch inventory analytics. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics - Individual Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Items Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-blue-50 via-card to-blue-50/30 dark:from-blue-950/20 dark:via-card dark:to-blue-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-blue-500/10 rounded-lg p-2">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Total Items
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
              {totalItems}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <PackageCheck className="h-3 w-3 text-blue-600" />
              <span className="text-xs text-blue-600 font-medium">
                In inventory
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Low Stock Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-orange-50 via-card to-orange-50/30 dark:from-orange-950/20 dark:via-card dark:to-orange-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-orange-500/10 rounded-lg p-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Low Stock Items
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
              {lowStock}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <TrendingUp className="h-3 w-3 text-orange-600" />
              <span className="text-xs text-orange-600 font-medium">
                {formatPercent(lowStockPercent, 0)} of total
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Expiring Soon Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-red-50 via-card to-red-50/30 dark:from-red-950/20 dark:via-card dark:to-red-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-red-500/10 rounded-lg p-2">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Expiring Soon
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
              {soonToExpire.length}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Clock className="h-3 w-3 text-red-600" />
              <span className="text-xs text-red-600 font-medium">
                Within 7 days
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Healthy Stock Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-50 via-card to-green-50/30 dark:from-green-950/20 dark:via-card dark:to-green-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-green-500/10 rounded-lg p-2">
                <PackageCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Healthy Stock
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
              {healthyStock}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Sparkles className="h-3 w-3 text-green-600" />
              <span className="text-xs text-green-600 font-medium">
                Above minimum
              </span>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stock Coverage Heatmap */}
        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 rounded-lg p-2">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-bold">
                Inventory Coverage Heatmap
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Sorted by coverage ratio (quantity / minimum). Showing{' '}
              {Math.min(coverageLimit, inventoryData.length)} of {totalItems}{' '}
              items.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Critical
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                Low
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                Medium
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Healthy
              </div>
              <span className="text-muted-foreground/60">|</span>
              <span>Min line = 1.0x</span>
            </div>
            {coverageChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">
                  No inventory data available
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-2">
                <div style={{ height: coverageChartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={coverageChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
                      barCategoryGap={8}
                    >
                      <CartesianGrid
                        {...CHART_STYLES.grid}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_STYLES.axisTick}
                        tickFormatter={(value) => `${value.toFixed(1)}x`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_STYLES.axisTick}
                        tickFormatter={(value) =>
                          value.length > 16 ? `${value.slice(0, 16)}...` : value
                        }
                      />
                      <ReferenceLine
                        x={1}
                        stroke="hsl(var(--border))"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Min',
                          position: 'insideTopRight',
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 10,
                        }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload[0]) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background/95 backdrop-blur-sm border-2 border-border rounded-lg p-3 shadow-lg">
                              <p className="font-bold text-sm mb-1">
                                {data.name}
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  Current:{' '}
                                  <span className="font-bold text-foreground">
                                    {data.quantity}
                                    {data.unit ? ` ${data.unit}` : ''}
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Minimum:{' '}
                                  <span className="font-bold text-foreground">
                                    {data.minStock > 0
                                      ? data.minStock
                                      : 'Not set'}
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Coverage:{' '}
                                  <span className="font-bold text-foreground">
                                    {data.minStock > 0
                                      ? `${data.ratio.toFixed(1)}x`
                                      : 'N/A'}
                                  </span>
                                </p>
                                <div className="pt-1">
                                  <Badge
                                    className="border border-border/60 text-white"
                                    style={{ backgroundColor: data.fill }}
                                  >
                                    {data.status}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="ratio" radius={[0, 8, 8, 0]} barSize={14}>
                        {coverageChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                        <LabelList
                          dataKey="ratioLabel"
                          position="right"
                          formatter={(value) => value}
                          style={{
                            fontSize: 10,
                            fill: 'hsl(var(--muted-foreground))',
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Distribution Donut Chart */}
        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-orange-400/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-orange-500/10 rounded-lg p-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle className="text-base font-bold">
                Stock Health Distribution
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Items by stock level category
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={
                    <CustomNumericTooltip
                      valueFormatter={(v) => `${v} items`}
                    />
                  }
                />
                <Pie
                  data={stockDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={3}
                  {...ANIMATION_CONFIG.entrance}
                >
                  {stockDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="outside"
                    formatter={(value) => `${value}`}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      fill: 'hsl(var(--foreground))',
                    }}
                  />
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }}
                  iconSize={10}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Soon Table */}
      <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-red-400/10 to-transparent rounded-full blur-3xl" />
        <CardHeader className="pb-3 relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-red-500/10 rounded-lg p-2">
              <Clock className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-base font-bold">
              Items Expiring Soon
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Items expiring within 7 days - prioritize usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">#</TableHead>
                  <TableHead className="font-bold">Item</TableHead>
                  <TableHead className="font-bold">Quantity</TableHead>
                  <TableHead className="font-bold">Expiry Date</TableHead>
                  <TableHead className="font-bold">Days Left</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soonToExpire.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <PackageCheck className="h-8 w-8 opacity-50" />
                        <span>No items expiring soon - all good!</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  soonToExpire.map((item, index) => (
                    <TableRow
                      key={item.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="font-medium">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {item.name}
                      </TableCell>
                      <TableCell>
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell>
                        {new Date(item.expiryDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="font-bold">
                        <span
                          className={
                            item.daysToExpiry <= 2
                              ? 'text-red-600 dark:text-red-400'
                              : item.daysToExpiry <= 4
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-yellow-600 dark:text-yellow-400'
                          }
                        >
                          {item.daysToExpiry}{' '}
                          {item.daysToExpiry === 1 ? 'day' : 'days'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.daysToExpiry <= 2 ? 'destructive' : 'secondary'
                          }
                          className={
                            item.daysToExpiry <= 2
                              ? ''
                              : item.daysToExpiry <= 4
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }
                        >
                          {item.daysToExpiry <= 2
                            ? 'Critical'
                            : item.daysToExpiry <= 4
                              ? 'Urgent'
                              : 'Warning'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
