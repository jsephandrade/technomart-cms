import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatsCard = ({
  title,
  value,
  change,
  trend, // 'up' | 'down' | null
  comparisonPeriod, // 'yesterday' | 'last month' | etc
  icon: Icon,
  formatter = (v) => v,
  onClick,
}) => {
  const clickable = typeof onClick === 'function';

  return (
    <Card
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-background to-muted/20 hover:shadow-lg transition-all duration-300 ${
        clickable ? 'cursor-pointer hover:scale-[1.02]' : ''
      }`}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Gradient accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />

      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {title}
            </p>
            <h3 className="text-2xl font-bold tracking-tight">
              {formatter(value)}
            </h3>
          </div>

          {/* Icon with background */}
          <div className="ml-4 p-3 rounded-xl bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>

        {/* Trend indicator */}
        {change !== undefined && change !== null && (
          <div className="flex items-center gap-2">
            {trend === 'up' && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {change > 0 ? '+' : ''}
                  {change.toFixed(1)}%
                  {comparisonPeriod && ` from ${comparisonPeriod}`}
                </span>
              </div>
            )}
            {trend === 'down' && (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <TrendingDown className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {change.toFixed(1)}%
                  {comparisonPeriod && ` from ${comparisonPeriod}`}
                </span>
              </div>
            )}
            {!trend && (
              <span className="text-xs text-muted-foreground">
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}%
                {comparisonPeriod && ` from ${comparisonPeriod}`}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StatsCard;
