import React, { useEffect, useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Area,
  AreaChart,
} from 'recharts';
import { cateringService } from '@/api/services/cateringService';
import {
  CHART_STYLES,
  CHART_COLORS,
  CHART_MARGINS,
  ANIMATION_CONFIG,
  CustomCurrencyTooltip,
  formatCompactCurrency,
} from '@/utils/chartConfig';
import {
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

const currency = (n) =>
  `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const getStatusBadgeVariant = (status) => {
  const normalizedStatus = (status || '').toLowerCase();
  switch (normalizedStatus) {
    case 'confirmed':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'completed':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
};

// Helper function to safely parse dates
const safeParseDate = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? null : date;
};

export default function CateringPanel() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCateringData = async () => {
      try {
        setLoading(true);
        const response = await cateringService.listEvents();
        const eventsData = response.data || [];

        // Debug logging to understand data structure
        console.log('📊 Catering Events Data:', eventsData);
        if (eventsData.length > 0) {
          console.log('📋 Sample Event Structure:', eventsData[0]);
        }

        setEvents(eventsData);
        setError(null);
      } catch (err) {
        console.error('❌ Error fetching catering data:', err);
        setError(err.message || 'Failed to load catering data');
      } finally {
        setLoading(false);
      }
    };

    fetchCateringData();
  }, []);

  // Revenue by month - Fixed date handling
  const revenueByMonth = useMemo(() => {
    if (!events.length) return [];
    const map = new Map();

    console.log('📈 Processing revenue by month for', events.length, 'events');

    events.forEach((event, idx) => {
      const status = (event.status || event.event_status || '').toLowerCase();
      if (status === 'cancelled') return;

      // Parse the event date properly with flexible field names
      const dateStr = event.eventDate || event.date || event.event_date;
      const date = safeParseDate(dateStr);

      if (!date) {
        console.warn(`⚠️ Event ${idx + 1}: Invalid date "${dateStr}"`, event);
        return;
      }

      // Create a key for year-month (e.g., "2025-01")
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;

      // Format for display
      const displayName = date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const amount = Number(
        event.totalAmount || event.total || event.total_amount || 0
      );

      if (map.has(key)) {
        const existing = map.get(key);
        existing.revenue += amount;
      } else {
        map.set(key, {
          key,
          name: displayName,
          revenue: amount,
          sortDate: date,
        });
      }
    });

    // Convert to array and sort by actual date
    const result = Array.from(map.values())
      .sort((a, b) => a.sortDate - b.sortDate)
      .map(({ name, revenue }) => ({ name, revenue }));

    console.log('💰 Revenue by month:', result);
    return result;
  }, [events]);

  // Events by status - Improved handling
  const eventsByStatus = useMemo(() => {
    if (!events.length) return [];
    const statusCount = new Map();

    events.forEach((event) => {
      const status = (
        event.status ||
        event.event_status ||
        'pending'
      ).toLowerCase();
      const currentCount = statusCount.get(status) || 0;
      statusCount.set(status, currentCount + 1);
    });

    // Convert to array with proper capitalization
    return Array.from(statusCount.entries())
      .map(([status, count]) => ({
        status: status.charAt(0).toUpperCase() + status.slice(1),
        count,
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [events]);

  // Summary stats - Improved with flexible field handling
  const stats = useMemo(() => {
    const totalRevenue = events
      .filter((e) => {
        const status = (e.status || e.event_status || '').toLowerCase();
        return status !== 'cancelled';
      })
      .reduce((sum, e) => {
        const amount = Number(e.totalAmount || e.total || e.total_amount || 0);
        return sum + amount;
      }, 0);

    const confirmedEvents = events.filter((e) => {
      const status = (e.status || e.event_status || '').toLowerCase();
      return status === 'confirmed';
    }).length;

    const pendingEvents = events.filter((e) => {
      const status = (e.status || e.event_status || '').toLowerCase();
      return status === 'pending';
    }).length;

    const completedEvents = events.filter((e) => {
      const status = (e.status || e.event_status || '').toLowerCase();
      return status === 'completed';
    }).length;

    return {
      totalRevenue,
      confirmedEvents,
      pendingEvents,
      completedEvents,
      totalEvents: events.length,
    };
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading State */}
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-6 mb-4">
              <Sparkles className="h-12 w-12 text-primary animate-pulse" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">
            Loading Catering Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            Fetching event data and statistics...
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
        {/* Error State */}
        <Card className="border-2 border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-destructive/20 blur-2xl rounded-full" />
              <div className="relative bg-destructive/10 rounded-full p-6">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-destructive">
              Error Loading Catering Data
            </h3>
            <p className="text-sm text-muted-foreground max-w-md text-center mb-4">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="border-destructive/20 hover:bg-destructive/10"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-50 via-card to-green-50/30 dark:from-green-950/20 dark:via-card dark:to-green-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-green-500/10 rounded-lg p-2">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Total Revenue
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
              {currency(stats.totalRevenue)}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-xs text-green-600 font-medium">
                From catering events
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Total Events Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-primary/10 via-card to-primary/5 dark:from-primary/20 dark:via-card dark:to-primary/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-primary/10 rounded-lg p-2">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Total Events
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              {stats.totalEvents}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Users className="h-3 w-3 text-primary" />
              <span className="text-xs text-primary font-medium">
                All bookings
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Confirmed Events Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-emerald-50 via-card to-emerald-50/30 dark:from-emerald-950/20 dark:via-card dark:to-emerald-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-emerald-500/10 rounded-lg p-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Confirmed
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              {stats.confirmedEvents}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              <span className="text-xs text-emerald-600 font-medium">
                Ready to go
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Pending Events Card */}
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-amber-50 via-card to-amber-50/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-amber-500/10 rounded-lg p-2">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Pending
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
              {stats.pendingEvents}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              <span className="text-xs text-amber-600 font-medium">
                Awaiting confirmation
              </span>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Enhanced Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Over Time - Enhanced */}
        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 rounded-lg p-2">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-bold">
                Revenue Over Time
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Monthly catering revenue trends
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 relative">
            {revenueByMonth.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <TrendingUp className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">No revenue data available</p>
                <p className="text-xs">
                  Revenue will appear once events are booked
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueByMonth}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  {...ANIMATION_CONFIG.entrance}
                >
                  <defs>
                    <linearGradient
                      id="revenueAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <filter id="shadow" height="200%">
                      <feDropShadow
                        dx="0"
                        dy="3"
                        stdDeviation="3"
                        floodOpacity="0.3"
                      />
                    </filter>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    opacity={0.1}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    tickFormatter={(value) => formatCompactCurrency(value)}
                  />
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fill="url(#revenueAreaGrad)"
                    fillOpacity={1}
                    filter="url(#shadow)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Events by Status - Enhanced */}
        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 rounded-lg p-2">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-bold">
                Events by Status
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Distribution of event statuses
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 relative">
            {eventsByStatus.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Calendar className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">No event data available</p>
                <p className="text-xs">Event statistics will appear here</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={eventsByStatus}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  {...ANIMATION_CONFIG.entrance}
                >
                  <defs>
                    <linearGradient
                      id="barGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={1}
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.6}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    opacity={0.1}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="status"
                    tick={{
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="url(#barGradient)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Events Table - Enhanced */}
      <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-400/10 to-transparent rounded-full blur-3xl" />
        <CardHeader className="pb-3 relative border-b">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-purple-500/10 rounded-lg p-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
            </div>
            <CardTitle className="text-base font-bold">Recent Events</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Latest catering event bookings
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold text-xs">
                    Event Name
                  </TableHead>
                  <TableHead className="font-semibold text-xs">Date</TableHead>
                  <TableHead className="font-semibold text-xs">
                    Customer
                  </TableHead>
                  <TableHead className="font-semibold text-xs">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-semibold text-xs">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <Calendar className="h-12 w-12 mb-3 opacity-20" />
                        <p className="text-sm font-medium">
                          No catering events found
                        </p>
                        <p className="text-xs mt-1">
                          Events will appear here once booked
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  events
                    .sort((a, b) => {
                      const dateA = new Date(
                        a.eventDate || a.date || a.event_date
                      );
                      const dateB = new Date(
                        b.eventDate || b.date || b.event_date
                      );
                      return dateB - dateA;
                    })
                    .slice(0, 10)
                    .map((event, index) => {
                      // Flexible field extraction
                      const eventName =
                        event.eventName ||
                        event.name ||
                        event.event_name ||
                        '—';
                      const customerName =
                        event.customerName ||
                        event.client ||
                        event.customer ||
                        event.client_name ||
                        '—';
                      const eventDate =
                        event.eventDate || event.date || event.event_date;
                      const eventStatus =
                        event.status || event.event_status || 'pending';
                      const totalAmount =
                        event.totalAmount ||
                        event.total ||
                        event.total_amount ||
                        0;

                      return (
                        <TableRow
                          key={event.id || index}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <TableCell className="font-semibold text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-primary">
                                  {index + 1}
                                </span>
                              </div>
                              <span
                                className="truncate max-w-[200px]"
                                title={eventName}
                              >
                                {eventName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {eventDate
                              ? new Date(eventDate).toLocaleDateString(
                                  'en-US',
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }
                                )
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span
                                className="truncate max-w-[150px]"
                                title={customerName}
                              >
                                {customerName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getStatusBadgeVariant(eventStatus)}
                              className="font-medium text-xs"
                            >
                              {eventStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-sm bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
                              {currency(totalAmount)}
                            </span>
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
