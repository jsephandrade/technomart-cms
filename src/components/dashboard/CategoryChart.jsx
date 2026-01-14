import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import {
  CHART_STYLES,
  CHART_COLORS,
  CHART_MARGINS,
  ANIMATION_CONFIG,
  CustomCurrencyTooltip,
  formatCompactCurrency,
} from '@/utils/chartConfig';

const CategoryChart = ({
  data,
  title,
  description,
  timeRange = 'today',
  timeRangeLabel = 'Today',
  dateRangeDisplay,
}) => {
  const showComparison = timeRange === 'today';

  // Show empty state if no data
  if (!data || data.length === 0) {
    return (
      <Card className="border-0 bg-gradient-to-br from-blue-50/50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10 hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold tracking-tight">
                {title}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-56 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-muted" />
            </div>
            <p className="text-sm text-muted-foreground">
              No category data available
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-gradient-to-br from-blue-50/50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10 hover:shadow-lg transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-bold tracking-tight">
              {title}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {description}
              {dateRangeDisplay && (
                <span className="block mt-0.5 font-medium text-primary/80">
                  {dateRangeDisplay}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="h-56 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 24, right: 16, left: 16, bottom: 6 }}
            {...ANIMATION_CONFIG.entrance}
          >
            <CartesianGrid
              strokeDasharray={CHART_STYLES.grid.strokeDasharray}
              opacity={CHART_STYLES.grid.opacity}
              stroke={CHART_STYLES.grid.stroke}
            />
            <XAxis
              dataKey="name"
              tick={CHART_STYLES.axisTick}
              interval="preserveStartEnd"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={CHART_STYLES.axisTick}
              width={50}
              axisLine={false}
              tickLine={false}
              tickCount={5}
              tickFormatter={(value) => formatCompactCurrency(value)}
            />
            <Tooltip
              content={<CustomCurrencyTooltip />}
              cursor={{
                fill: 'hsl(var(--muted) / 0.1)',
                radius: 4,
              }}
              animationDuration={200}
            />
            <Legend
              wrapperStyle={{
                fontSize: '11px',
                paddingTop: '8px',
              }}
              iconType="rect"
            />
            {/* Current period sales - Primary colored bars */}
            <Bar
              dataKey="today"
              name={timeRangeLabel}
              radius={[6, 6, 0, 0]}
              maxBarSize={24}
              fill="hsl(var(--chart-primary))"
              isAnimationActive={true}
              animationDuration={800}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey="today"
                position="top"
                formatter={(value) => formatCompactCurrency(value)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  fill: 'hsl(var(--chart-primary))',
                }}
              />
            </Bar>
            {/* Yesterday's sales - Green bars (only for "today" view) */}
            {showComparison && (
              <Bar
                dataKey="yesterday"
                name="Yesterday"
                radius={[6, 6, 0, 0]}
                maxBarSize={24}
                fill="hsl(142 76% 36%)"
                fillOpacity={0.6}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="yesterday"
                  position="top"
                  formatter={(value) => formatCompactCurrency(value)}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fill: 'hsl(142 76% 36%)',
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default CategoryChart;
