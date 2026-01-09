import React, { useMemo, useState } from 'react';
import UserManagementCard from '@/components/users/UserManagementCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarRange,
  ChevronDown,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DEFAULT_DAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const coverageBadgeVariants = {
  none: 'border border-destructive/40 bg-destructive/10 text-destructive',
  low: 'border border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-50',
  ok: 'border border-sky-300/60 bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100',
  ideal:
    'border border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100',
};

const coverageCopy = {
  none: 'Needs coverage',
  low: 'Light coverage',
  ok: 'On track',
  ideal: 'Fully covered',
};

const getMinutesBetween = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some((value) => Number.isNaN(value))) return 0;
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(0, endMinutes - startMinutes);
};

const buildLocalOverview = (entries = []) => {
  const uniqueEmployeeIds = new Set();
  let minutes = 0;
  entries.forEach((entry) => {
    if (entry?.employeeId) uniqueEmployeeIds.add(entry.employeeId);
    minutes += getMinutesBetween(entry?.startTime, entry?.endTime);
  });
  const hours = minutes / 60;
  const roundedHours = Number(hours.toFixed(1));
  const avg = entries.length ? Number((hours / entries.length).toFixed(1)) : 0;
  return {
    totals: {
      shifts: entries.length,
      uniqueEmployees: uniqueEmployeeIds.size,
      totalHours: roundedHours,
      avgHoursPerShift: avg,
      utilizationScore: entries.length
        ? Math.min(100, Math.round((roundedHours / (entries.length * 8)) * 100))
        : 0,
    },
    days: [],
    alerts: [],
    topContributors: [],
  };
};

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || '??';

const formatDurationLabel = (start, end) => {
  const minutes = getMinutesBetween(start, end);
  if (!minutes) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const WeeklyScheduleCard = ({
  daysOfWeek = [],
  employeeList = [],
  employeeDirectory,
  schedule = [],
  overview,
  scheduleLoading = false,
  filters,
  onOpenAddSchedule,
  onOpenManageEmployees,
  onDeleteSchedule,
  onClearAllSchedules,
  onEditDaySchedule,
  canManage = false,
}) => {
  const filteredDays = daysOfWeek.length ? daysOfWeek : DEFAULT_DAY_OPTIONS;
  const selectableDays = (filteredDays || []).filter(
    (day) => String(day || '').toLowerCase() !== 'sunday'
  ).length
    ? (filteredDays || []).filter(
        (day) => String(day || '').toLowerCase() !== 'sunday'
      )
    : DEFAULT_DAY_OPTIONS;
  const [internalFilters] = useState({
    employeeId: '',
    day: '_all',
  });
  const [collapsedDays, setCollapsedDays] = useState(() => {
    const initial = new Set(selectableDays);
    initial.delete('Monday');
    return initial;
  });

  const appliedFilters = filters ?? internalFilters;

  const directoryList =
    Array.isArray(employeeDirectory) && employeeDirectory.length
      ? employeeDirectory
      : employeeList;

  const employeeMap = useMemo(() => {
    const map = new Map();
    directoryList.forEach((employee) => {
      if (!employee?.id) return;
      map.set(String(employee.id), employee);
    });
    return map;
  }, [directoryList]);

  const resolvedOverview = useMemo(() => {
    if (overview && overview.totals) return overview;
    return buildLocalOverview(schedule);
  }, [overview, schedule]);

  const daySummaries = useMemo(() => {
    const map = new Map();
    (resolvedOverview?.days || []).forEach((day) => {
      if (!day?.day) return;
      if (String(day.day).toLowerCase() === 'sunday') return;
      map.set(day.day, day);
    });
    return map;
  }, [resolvedOverview]);

  const normalizedSchedule = useMemo(() => {
    return (schedule || []).map((entry) => ({
      ...entry,
      employee: employeeMap.get(String(entry?.employeeId)) || null,
    }));
  }, [schedule, employeeMap]);

  const filteredSchedule = useMemo(() => {
    return normalizedSchedule.filter((entry) => {
      const isSunday = String(entry?.day || '').toLowerCase() === 'sunday';
      if (isSunday) return false;
      const matchesEmployee =
        !appliedFilters.employeeId ||
        String(entry.employeeId) === String(appliedFilters.employeeId);
      const matchesDay =
        !appliedFilters.day ||
        appliedFilters.day === '_all' ||
        entry.day === appliedFilters.day;
      return matchesEmployee && matchesDay;
    });
  }, [normalizedSchedule, appliedFilters]);

  const boardDays = useMemo(() => {
    if (appliedFilters.day && appliedFilters.day !== '_all') {
      return [appliedFilters.day];
    }
    return selectableDays;
  }, [appliedFilters.day, selectableDays]);

  const groupedSchedule = useMemo(() => {
    const map = new Map();
    boardDays.forEach((day) => map.set(day, []));
    filteredSchedule.forEach((entry) => {
      const dayKey = entry?.day || 'Unassigned';
      if (!map.has(dayKey)) {
        if (appliedFilters.day && appliedFilters.day !== '_all') return;
        map.set(dayKey, []);
      }
      map.get(dayKey).push(entry);
    });
    map.forEach((entries) => {
      entries.sort((a, b) =>
        (a.startTime || '').localeCompare(b.startTime || '')
      );
    });
    return map;
  }, [boardDays, filteredSchedule, appliedFilters.day]);

  const dayMetaMap = useMemo(() => {
    const map = new Map();
    groupedSchedule.forEach((entries, day) => {
      if (daySummaries.has(day)) {
        map.set(day, daySummaries.get(day));
      } else {
        const totalMinutes = entries.reduce(
          (acc, current) =>
            acc + getMinutesBetween(current.startTime, current.endTime),
          0
        );
        map.set(day, {
          day,
          shifts: entries.length,
          totalHours: Number((totalMinutes / 60).toFixed(1)),
          coverageRating:
            entries.length === 0
              ? 'none'
              : totalMinutes >= 8 * 60
                ? 'ok'
                : 'low',
        });
      }
    });
    return map;
  }, [groupedSchedule, daySummaries]);

  const showSkeletonBoard =
    scheduleLoading && (filteredSchedule.length === 0 || schedule.length === 0);

  const toggleDayCollapsed = (day) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const renderShiftCard = (entry) => {
    const employee =
      entry?.employee || employeeMap.get(String(entry?.employeeId));
    const initials = getInitials(employee?.name || entry?.employeeName);
    const canDelete =
      canManage && typeof onDeleteSchedule === 'function' && entry;

    return (
      <div
        key={entry.id}
        className="group relative flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm"
      >
        <Avatar className="h-10 w-10 border border-border/60">
          <AvatarImage
            src=""
            alt={employee?.name || 'Employee avatar'}
            className="bg-muted text-foreground"
          >
            {initials}
          </AvatarImage>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold leading-tight">
                {employee?.name || entry?.employeeName || 'Unassigned'}
              </p>
              <p className="text-xs text-muted-foreground">
                {entry?.position ||
                  employee?.position ||
                  entry?.employee?.position ||
                  'Team member'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {formatDurationLabel(entry?.startTime, entry?.endTime)}
              </Badge>
              {canDelete ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDeleteSchedule(entry)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Remove shift</span>
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {entry?.startTime} - {entry?.endTime}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      <UserManagementCard
        title="Weekly Shift Planner"
        titleStyle="accent"
        titleIcon={CalendarRange}
        description="Plan coverage, assign teammates, and publish this week's roster from a single view."
        headerActions={
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 rounded-full p-0"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Show roster actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onOpenManageEmployees}>
                  Edit Employee
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenAddSchedule}>
                  Add schedule
                </DropdownMenuItem>
                {typeof onEditDaySchedule === 'function' ? (
                  <DropdownMenuItem onClick={onEditDaySchedule}>
                    Edit day times
                  </DropdownMenuItem>
                ) : null}
                {typeof onClearAllSchedules === 'function' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onClearAllSchedules}>
                      Clear roster
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        decor={
          <div
            className="pointer-events-none absolute -right-16 -top-10 h-44 w-44 rounded-full bg-primary/20 blur-3xl"
            aria-hidden="true"
          />
        }
      >
        {showSkeletonBoard ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(groupedSchedule.entries()).map(([day, entries]) => {
              const meta = dayMetaMap.get(day);
              const isCollapsed = collapsedDays.has(day);
              const badgeKey = meta?.coverageRating || 'none';
              return (
                <div
                  key={day}
                  className="flex flex-col rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm"
                >
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleDayCollapsed(day)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleDayCollapsed(day);
                      }
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold leading-tight">
                        {day}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meta?.shifts ?? 0} shifts | {meta?.totalHours ?? 0}h
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          'text-[11px]',
                          coverageBadgeVariants[badgeKey] ||
                            coverageBadgeVariants.none
                        )}
                      >
                        {coverageCopy[badgeKey] || coverageCopy.none}
                      </Badge>
                      <span className="flex h-8 w-8 items-center justify-center text-muted-foreground">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          )}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <div className="mt-4 space-y-3">
                      {entries.length ? (
                        entries.map((entry) => renderShiftCard(entry))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                          No shifts planned.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </UserManagementCard>
    </>
  );
};

export default WeeklyScheduleCard;
