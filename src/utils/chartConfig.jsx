/**
 * Professional Chart Configuration Utilities
 * Enhanced styling and formatting for stakeholder-ready visualizations
 */

// ============================================
// COLOR PALETTE
// ============================================

export const CHART_COLORS = {
  // Primary brand colors
  primary: 'hsl(var(--chart-primary))',
  primaryLight: 'hsl(var(--chart-primary) / 0.8)',
  primaryDark: 'hsl(var(--chart-primary))',

  // Secondary colors for multi-series charts
  secondary: 'hsl(var(--secondary))',
  accent: 'hsl(var(--accent))',

  // Status colors
  success: '#10b981', // Green
  warning: '#f59e0b', // Orange
  danger: 'hsl(var(--destructive))', // Red
  info: 'hsl(var(--chart-primary))', // Chart info blue

  // Neutral colors
  muted: 'hsl(var(--muted-foreground))',
  border: 'hsl(var(--border))',
  background: 'hsl(var(--background))',

  // Multi-series palette (for category charts)
  palette: [
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#f59e0b', // Orange
    '#10b981', // Green
    '#06b6d4', // Cyan
    '#6366f1', // Indigo
    '#f43f5e', // Rose
  ],
};

// ============================================
// GRADIENTS
// ============================================

export const CHART_GRADIENTS = {
  // Revenue/Sales gradient (green to light green)
  revenue: (id = 'gradRevenue') => ({
    id,
    definition: (
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.8} />
        <stop
          offset="95%"
          stopColor={CHART_COLORS.primary}
          stopOpacity={0.05}
        />
      </linearGradient>
    ),
  }),

  // Orders gradient (blue theme)
  orders: (id = 'gradOrders') => ({
    id,
    definition: (
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={CHART_COLORS.info} stopOpacity={0.8} />
        <stop offset="95%" stopColor={CHART_COLORS.info} stopOpacity={0.05} />
      </linearGradient>
    ),
  }),

  // Success gradient (green)
  success: (id = 'gradSuccess') => ({
    id,
    definition: (
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.8} />
        <stop
          offset="95%"
          stopColor={CHART_COLORS.success}
          stopOpacity={0.05}
        />
      </linearGradient>
    ),
  }),
};

// ============================================
// TYPOGRAPHY & STYLING
// ============================================

export const CHART_STYLES = {
  // Axis tick styling
  axisTick: {
    fontSize: 11,
    fill: 'hsl(var(--muted-foreground))',
    fontFamily: 'inherit',
  },

  // Axis label styling
  axisLabel: {
    fontSize: 12,
    fill: 'hsl(var(--foreground))',
    fontWeight: 500,
    fontFamily: 'inherit',
  },

  // Grid styling
  grid: {
    strokeDasharray: '3 3',
    opacity: 0.2,
    stroke: 'hsl(var(--border))',
  },

  // Tooltip styling
  tooltip: {
    contentStyle: {
      backgroundColor: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '12px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    },
    labelStyle: {
      fontSize: '12px',
      fontWeight: 600,
      marginBottom: '4px',
      color: 'hsl(var(--foreground))',
    },
    itemStyle: {
      fontSize: '12px',
      color: 'hsl(var(--muted-foreground))',
    },
    cursor: {
      stroke: 'hsl(var(--border))',
      strokeWidth: 1,
      strokeDasharray: '5 5',
    },
  },

  // Legend styling
  legend: {
    wrapperStyle: {
      fontSize: '12px',
      fontFamily: 'inherit',
    },
    iconSize: 10,
  },

  // Active dot styling (for line/area charts)
  activeDot: {
    r: 4,
    strokeWidth: 2,
    stroke: 'hsl(var(--background))',
  },
};

// ============================================
// NUMBER FORMATTING
// ============================================

/**
 * Format currency values with proper localization
 */
export const formatCurrency = (value, options = {}) => {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    compact = false,
  } = options;

  const num = Number(value || 0);

  if (compact && Math.abs(num) >= 1000) {
    return formatCompactCurrency(num);
  }

  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits,
    maximumFractionDigits,
  })}`;
};

/**
 * Format large numbers in compact form (e.g., 1.5K, 2.3M)
 */
export const formatCompactCurrency = (value) => {
  const num = Number(value || 0);
  const absNum = Math.abs(num);

  if (absNum >= 1e6) {
    return `₱${(num / 1e6).toFixed(1)}M`;
  } else if (absNum >= 1e3) {
    return `₱${(num / 1e3).toFixed(1)}K`;
  }

  return `₱${num.toFixed(0)}`;
};

/**
 * Format numbers with abbreviations (for non-currency)
 */
export const formatNumber = (value, compact = false) => {
  const num = Number(value || 0);

  if (compact && Math.abs(num) >= 1000) {
    const absNum = Math.abs(num);
    if (absNum >= 1e6) {
      return `${(num / 1e6).toFixed(1)}M`;
    } else if (absNum >= 1e3) {
      return `${(num / 1e3).toFixed(1)}K`;
    }
  }

  return num.toLocaleString();
};

/**
 * Format percentage values
 */
export const formatPercent = (value, decimals = 1) => {
  return `${Number(value || 0).toFixed(decimals)}%`;
};

/**
 * Format time values (hours)
 */
export const formatHours = (value) => {
  const num = Number(value || 0);
  return `${num.toFixed(1)} hrs`;
};

// ============================================
// CUSTOM TOOLTIP COMPONENTS
// ============================================

/**
 * Professional tooltip for currency data
 */
export const CustomCurrencyTooltip = ({
  active,
  payload,
  label,
  labelFormatter,
}) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={CHART_STYLES.tooltip.contentStyle} className="custom-tooltip">
      <p style={CHART_STYLES.tooltip.labelStyle}>
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, index) => (
        <p
          key={`item-${index}`}
          style={{
            ...CHART_STYLES.tooltip.itemStyle,
            color: entry.color,
          }}
        >
          <span className="font-medium">{entry.name}:</span>{' '}
          <span className="font-semibold">{formatCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
};

/**
 * Professional tooltip for numeric data
 */
export const CustomNumericTooltip = ({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div style={CHART_STYLES.tooltip.contentStyle} className="custom-tooltip">
      <p style={CHART_STYLES.tooltip.labelStyle}>
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry, index) => (
        <p
          key={`item-${index}`}
          style={{
            ...CHART_STYLES.tooltip.itemStyle,
            color: entry.color,
          }}
        >
          <span className="font-medium">{entry.name}:</span>{' '}
          <span className="font-semibold">
            {valueFormatter
              ? valueFormatter(entry.value)
              : formatNumber(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
};

/**
 * Professional tooltip for percentage data (pie charts)
 */
export const CustomPercentTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0];
  const total = data.payload.total || 100;
  const percentage = ((data.value / total) * 100).toFixed(1);

  return (
    <div style={CHART_STYLES.tooltip.contentStyle} className="custom-tooltip">
      <p style={CHART_STYLES.tooltip.labelStyle}>{data.name}</p>
      <p style={CHART_STYLES.tooltip.itemStyle}>
        <span className="font-medium">Count:</span>{' '}
        <span className="font-semibold">{formatNumber(data.value)}</span>
      </p>
      <p style={CHART_STYLES.tooltip.itemStyle}>
        <span className="font-medium">Percentage:</span>{' '}
        <span className="font-semibold">{percentage}%</span>
      </p>
    </div>
  );
};

// ============================================
// CHART MARGINS & DIMENSIONS
// ============================================

export const CHART_MARGINS = {
  default: { top: 6, right: 16, left: 16, bottom: 6 },
  withXLabels: { top: 6, right: 16, left: 16, bottom: 40 },
  tight: { top: 4, right: 8, left: 8, bottom: 4 },
  comfortable: { top: 12, right: 24, left: 24, bottom: 12 },
};

// ============================================
// ANIMATION CONFIG
// ============================================

export const ANIMATION_CONFIG = {
  // Smooth entrance animations
  entrance: {
    animationBegin: 0,
    animationDuration: 800,
    animationEasing: 'ease-out',
  },

  // Faster updates
  update: {
    animationDuration: 400,
    animationEasing: 'ease-in-out',
  },
};

// ============================================
// RESPONSIVE BREAKPOINTS
// ============================================

export const CHART_RESPONSIVE = {
  mobile: {
    width: '100%',
    height: 200,
    fontSize: 10,
  },
  tablet: {
    width: '100%',
    height: 250,
    fontSize: 11,
  },
  desktop: {
    width: '100%',
    height: 300,
    fontSize: 12,
  },
};

// ============================================
// REFERENCE LINES
// ============================================

/**
 * Common reference line configurations
 */
export const REFERENCE_LINES = {
  average: (value) => ({
    y: value,
    stroke: CHART_COLORS.info,
    strokeDasharray: '5 5',
    strokeWidth: 1.5,
    label: {
      value: `Avg: ${formatCurrency(value, { compact: true })}`,
      position: 'right',
      fill: CHART_COLORS.info,
      fontSize: 11,
      fontWeight: 600,
    },
  }),

  target: (value) => ({
    y: value,
    stroke: CHART_COLORS.success,
    strokeDasharray: '8 4',
    strokeWidth: 2,
    label: {
      value: `Target: ${formatCurrency(value, { compact: true })}`,
      position: 'right',
      fill: CHART_COLORS.success,
      fontSize: 11,
      fontWeight: 600,
    },
  }),

  threshold: (value) => ({
    y: value,
    stroke: CHART_COLORS.danger,
    strokeDasharray: '5 5',
    strokeWidth: 1.5,
    label: {
      value: `Min: ${formatNumber(value)}`,
      position: 'right',
      fill: CHART_COLORS.danger,
      fontSize: 11,
      fontWeight: 600,
    },
  }),
};

// ============================================
// EXPORT UTILITIES
// ============================================

/**
 * Generate chart data for export
 */
export const prepareChartDataForExport = (data, columns) => {
  return data.map((row) => {
    const exportRow = {};
    columns.forEach((col) => {
      exportRow[col.label] = col.format
        ? col.format(row[col.key])
        : row[col.key];
    });
    return exportRow;
  });
};
