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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEmployees } from '@/hooks/useEmployees';
import { useScheduleAnalytics } from '@/hooks/useScheduleAnalytics';
import {
  CHART_STYLES,
  CHART_COLORS,
  CHART_MARGINS,
  ANIMATION_CONFIG,
  CustomNumericTooltip,
  formatHours,
} from '@/utils/chartConfig';
import {
  Users,
  Clock3,
  Timer,
  CalendarDays,
  Award,
  Sparkles,
  AlertCircle,
  UserCheck,
} from 'lucide-react';

const roundHours = (value) => Math.round(Number(value || 0) * 10) / 10;

const formatHoursValue = (value) => `${roundHours(value).toFixed(1)}h`;

const formatInitials = (name) => {
  if (!name) return '—';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const toHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 0;
  const startHours = sh + (sm || 0) / 60;
  const endHours = eh + (em || 0) / 60;
  return Math.max(endHours - startHours, 0);
};

export default function AttendancePanel() {
  const {
    employees,
    loading: employeesLoading,
    error: employeesError,
  } = useEmployees();
  const {
    schedule: analyticsSchedule,
    loading: scheduleLoading,
    error: scheduleError,
  } = useScheduleAnalytics();

  const loading = employeesLoading || scheduleLoading;
  const error = employeesError || scheduleError;

  const employeeLookup = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees]
  );

  const hoursByStaff = useMemo(() => {
    if (!analyticsSchedule.length) return [];

    const aggregated = new Map();

    analyticsSchedule.forEach((shift) => {
      const hoursWorked = toHours(shift.startTime, shift.endTime);
      if (hoursWorked <= 0) return;

      const key = shift.employeeId ?? shift.employeeName ?? shift.id;
      const employeeDetails = shift.employeeId
        ? employeeLookup.get(shift.employeeId)
        : undefined;
      const name =
        shift.employeeName || employeeDetails?.name || 'Unknown Staff';
      const position = employeeDetails?.position || 'Team Member';

      const entry = aggregated.get(key) || {
        employeeId: shift.employeeId ?? null,
        lookupKey: key,
        name,
        position,
        hours: 0,
      };

      entry.hours += hoursWorked;
      aggregated.set(key, entry);
    });

    return Array.from(aggregated.values()).map((entry) => ({
      ...entry,
      hours: roundHours(entry.hours),
    }));
  }, [employeeLookup, analyticsSchedule]);

  const summary = useMemo(() => {
    const totalEmployees = employees.length;
    const totalHours = hoursByStaff.reduce((sum, item) => sum + item.hours, 0);
    const totalShifts = analyticsSchedule.length;
    const averageShift = totalShifts ? roundHours(totalHours / totalShifts) : 0;
    const coverageDays = new Set(
      analyticsSchedule
        .map((shift) => shift.day)
        .filter((day) => typeof day === 'string' && day.trim().length)
        .map((day) => day.toLowerCase())
    ).size;

    const todayName = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
    }).format(new Date());
    const todaysShifts = analyticsSchedule.filter(
      (shift) =>
        typeof shift.day === 'string' &&
        shift.day.toLowerCase() === todayName.toLowerCase()
    ).length;

    const topContributor =
      hoursByStaff.length > 0
        ? hoursByStaff.reduce(
            (best, entry) => (entry.hours > best.hours ? entry : best),
            hoursByStaff[0]
          )
        : null;

    const topContributorShare =
      topContributor && totalHours
        ? Math.round(
            ((topContributor.hours / totalHours) * 100 + Number.EPSILON) * 10
          ) / 10
        : 0;

    return {
      totalEmployees,
      totalHours: roundHours(totalHours),
      totalShifts,
      averageShift,
      coverageDays,
      todaysShifts,
      topContributor,
      topContributorShare,
    };
  }, [employees, hoursByStaff, analyticsSchedule]);

  const chartData = useMemo(() => {
    if (!hoursByStaff.length) return [];
    return [...hoursByStaff]
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8)
      .reverse();
  }, [hoursByStaff]);

  const chartMaxHours = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.max(...chartData.map((entry) => entry.hours));
  }, [chartData]);

  const roster = useMemo(() => {
    const rosterList = employees.map((emp) => {
      const staffHours =
        hoursByStaff.find((entry) => entry.employeeId === emp.id)?.hours ?? 0;
      return {
        id: emp.id,
        name: emp.name,
        position: emp.position || 'Team Member',
        status: emp.status,
        weeklyHours: roundHours(staffHours),
        isExternal: false,
      };
    });

    hoursByStaff.forEach((entry) => {
      if (entry.employeeId) return;
      rosterList.push({
        id: entry.lookupKey,
        name: entry.name,
        position: entry.position,
        status: 'guest',
        weeklyHours: roundHours(entry.hours),
        isExternal: true,
      });
    });

    return rosterList.sort((a, b) => b.weeklyHours - a.weeklyHours);
  }, [employees, hoursByStaff]);

  const unscheduledCount = useMemo(
    () => roster.filter((member) => member.weeklyHours === 0).length,
    [roster]
  );

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
            Loading Attendance Insights
          </h3>
          <p className="text-sm text-muted-foreground">
            Compiling schedules and staffing metrics...
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
            Error Loading Attendance
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Unable to fetch staff rosters and schedules right now. Please
            refresh the page or try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-sky-50 via-card to-sky-50/40 dark:from-sky-950/20 dark:via-card dark:to-sky-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-sky-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-sky-500/10 rounded-lg p-2">
                <Users className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Team Members Active
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-sky-600 to-sky-500 bg-clip-text text-transparent">
              {summary.totalEmployees}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-sky-600 dark:text-sky-300">
              <UserCheck className="h-3 w-3" />
              <span className="text-xs font-medium">
                Scheduled team members this cycle
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-indigo-50 via-card to-indigo-50/30 dark:from-indigo-950/20 dark:via-card dark:to-indigo-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-indigo-500/10 rounded-lg p-2">
                <Clock3 className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Weekly Scheduled Hours
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 bg-clip-text text-transparent">
              {formatHoursValue(summary.totalHours)}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-indigo-600 dark:text-indigo-300">
              <Sparkles className="h-3 w-3" />
              <span className="text-xs font-medium">
                Across {summary.totalShifts} planned shifts
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-amber-50 via-card to-amber-50/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-amber-500/10 rounded-lg p-2">
                <Timer className="h-5 w-5 text-amber-600 dark:text-amber-300" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Average Shift Length
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
              {formatHoursValue(summary.averageShift)}
            </CardTitle>
            <div className="flex items-center justify-center gap-1 mt-2 text-amber-600 dark:text-amber-300">
              <Clock3 className="h-3 w-3" />
              <span className="text-xs font-medium">
                Typical workload per shift
              </span>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-md hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-emerald-50 via-card to-emerald-50/30 dark:from-emerald-950/20 dark:via-card dark:to-emerald-950/10 flex flex-col justify-center min-h-[180px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-full blur-2xl" />
          <CardHeader className="pb-3 pt-3 px-4 relative text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="bg-emerald-500/10 rounded-lg p-2">
                <CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              </div>
            </div>
            <CardDescription className="text-xs font-semibold uppercase tracking-wider mb-2">
              Coverage &amp; Leaders
            </CardDescription>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              {summary.coverageDays} days
            </CardTitle>
            <div className="text-xs font-medium mt-2 text-emerald-600 dark:text-emerald-300">
              {summary.topContributor ? (
                <span>
                  {summary.topContributor.name} •{' '}
                  {formatHoursValue(summary.topContributor.hours)} (
                  {summary.topContributorShare}%)
                </span>
              ) : (
                <span>Assign shifts to highlight leaders</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {summary.todaysShifts} shifts scheduled today
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 rounded-lg p-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base font-bold">
                Scheduled Hours Leaderboard
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Top team members by total scheduled hours
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 relative pt-6">
            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">
                  No schedule data available
                </p>
                <p className="text-xs text-muted-foreground">
                  Assign shifts to visualize staffing coverage.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={CHART_MARGINS.withXLabels}
                  {...ANIMATION_CONFIG.entrance}
                >
                  <CartesianGrid
                    strokeDasharray={CHART_STYLES.grid.strokeDasharray}
                    opacity={CHART_STYLES.grid.opacity}
                  />
                  <XAxis
                    dataKey="name"
                    tick={CHART_STYLES.axisTick}
                    height={60}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={CHART_STYLES.axisTick}
                    width={48}
                    domain={[0, chartMaxHours ? chartMaxHours + 10 : 10]}
                    tickFormatter={(value) => `${roundHours(value)}h`}
                  />
                  <Tooltip
                    content={
                      <CustomNumericTooltip
                        valueFormatter={(value) => formatHours(value)}
                      />
                    }
                  />
                  <Bar
                    dataKey="hours"
                    name="Scheduled Hours"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={56}
                  >
                    <LabelList
                      dataKey="hours"
                      position="top"
                      formatter={(value) => formatHoursValue(value)}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        fill: 'hsl(var(--muted-foreground))',
                      }}
                    />
                    {chartData.map((_, index) => (
                      <Cell
                        key={`bar-${index}`}
                        fill={
                          CHART_COLORS.palette[
                            index % CHART_COLORS.palette.length
                          ]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-amber-400/10 to-transparent rounded-full blur-3xl" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-amber-500/10 rounded-lg p-2">
                <Award className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              </div>
              <CardTitle className="text-base font-bold">
                Staff Roster
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Core team members, roles, and weekly hours
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Weekly Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-muted-foreground py-6"
                      >
                        No staff records available
                      </TableCell>
                    </TableRow>
                  ) : (
                    roster.slice(0, 8).map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                                {formatInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-medium">{member.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">
                                {member.status || 'active'}
                                {member.isExternal ? ' • guest' : ''}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {member.position || 'Team Member'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatHoursValue(member.weeklyHours)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {unscheduledCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {unscheduledCount} team member
                {unscheduledCount === 1 ? '' : 's'} currently have no assigned
                shifts.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
