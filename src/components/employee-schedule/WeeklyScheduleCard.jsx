import React, { useMemo, useState } from 'react';
import UserManagementCard from '@/components/users/UserManagementCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CalendarRange,
  Copy,
  MoreHorizontal,
  ChevronDown,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

const buildDraftShift = (daysOfWeek, employeeList, preset = {}) => {
  const fallbackDay = preset.day || daysOfWeek[0] || 'Monday';
  const fallbackEmployee =
    preset.employeeId ??
    (employeeList.length ? String(employeeList[0].id) : '');

  return {
    id: preset.id || '',
    employeeId: fallbackEmployee ? String(fallbackEmployee) : '',
    day: fallbackDay,
    startTime: preset.startTime || '09:00',
    endTime: preset.endTime || '17:00',
    repeatDays:
      preset.repeatDays && preset.repeatDays.length
        ? [...new Set(preset.repeatDays)]
        : [fallbackDay],
  };
};

const WeeklyScheduleCard = ({
  daysOfWeek = [],
  employeeList = [],
  employeeDirectory,
  schedule = [],
  overview,
  overviewLoading = false,
  scheduleLoading = false,
  filters,
  onFiltersChange,
  onCreateShift,
  onUpdateShift,
  onDeleteShift,
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
  const [internalFilters, setInternalFilters] = useState({
    employeeId: '',
    day: '_all',
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState('create');
  const [composerSaving, setComposerSaving] = useState(false);
  const [draftShift, setDraftShift] = useState(() =>
    buildDraftShift(selectableDays, employeeList)
  );
  const [shiftPendingDelete, setShiftPendingDelete] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState(() => {
    const initial = new Set(selectableDays);
    initial.delete('Monday');
    return initial;
  });

  const appliedFilters = filters ?? internalFilters;

  const handleFiltersChange = (patch) => {
    const next = { ...appliedFilters, ...patch };
    if (typeof onFiltersChange === 'function') onFiltersChange(next);
    else setInternalFilters(next);
  };

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
  const composerHasEmployees = employeeList.length > 0;
  const composerValid =
    composerHasEmployees &&
    draftShift.employeeId &&
    draftShift.day &&
    draftShift.startTime &&
    draftShift.endTime;

  const handleComposerOpenChange = (open) => {
    setComposerOpen(open);
    if (!open) {
      setComposerMode('create');
      setComposerSaving(false);
      setDraftShift(buildDraftShift(selectableDays, employeeList));
    }
  };

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

  const handleOpenComposer = (mode, preset = {}) => {
    if (!canManage) return;
    setComposerMode(mode);
    setDraftShift(buildDraftShift(selectableDays, employeeList, preset));
    setComposerOpen(true);
  };

  const handleComposerFieldChange = (field, value) => {
    setDraftShift((prev) => {
      if (field === 'day') {
        const nextRepeat =
          composerMode === 'edit'
            ? [value]
            : prev.repeatDays.includes(value)
              ? prev.repeatDays
              : [...prev.repeatDays, value];
        return { ...prev, day: value, repeatDays: nextRepeat };
      }
      return { ...prev, [field]: value };
    });
  };

  const toggleRepeatDay = (day) => {
    if (composerMode === 'edit') return;
    setDraftShift((prev) => {
      const next = new Set(prev.repeatDays || []);
      if (next.has(day)) {
        if (next.size > 1) next.delete(day);
      } else {
        next.add(day);
      }
      return { ...prev, repeatDays: Array.from(next) };
    });
  };

  const handleComposerSubmit = async () => {
    if (!canManage || !composerValid || composerSaving) return;
    const createMode = composerMode === 'create';
    const handler =
      createMode && typeof onCreateShift === 'function'
        ? onCreateShift
        : !createMode && typeof onUpdateShift === 'function'
          ? onUpdateShift
          : null;
    if (!handler) return;

    const uniqueDays =
      createMode && draftShift.repeatDays?.length
        ? Array.from(new Set(draftShift.repeatDays))
        : [draftShift.day];

    setComposerSaving(true);
    try {
      if (createMode) {
        for (const day of uniqueDays) {
          const success = await handler({
            employeeId: draftShift.employeeId,
            day,
            startTime: draftShift.startTime,
            endTime: draftShift.endTime,
          });
          if (!success) {
            setComposerSaving(false);
            return;
          }
        }
      } else {
        const success = await handler({
          id: draftShift.id,
          employeeId: draftShift.employeeId,
          day: draftShift.day,
          startTime: draftShift.startTime,
          endTime: draftShift.endTime,
        });
        if (!success) {
          setComposerSaving(false);
          return;
        }
      }
      handleComposerOpenChange(false);
    } finally {
      setComposerSaving(false);
    }
  };

  const handleDuplicateShift = (shift) => {
    if (!canManage) return;
    handleOpenComposer('create', {
      employeeId: shift?.employeeId,
      day: shift?.day,
      startTime: shift?.startTime,
      endTime: shift?.endTime,
      repeatDays: [shift?.day],
    });
  };

  const handleConfirmDelete = async () => {
    if (
      !canManage ||
      !shiftPendingDelete ||
      typeof onDeleteShift !== 'function'
    ) {
      setShiftPendingDelete(null);
      return;
    }
    try {
      await onDeleteShift(shiftPendingDelete.id);
    } finally {
      setShiftPendingDelete(null);
    }
  };

  const renderShiftCard = (entry) => {
    const employee =
      entry?.employee || employeeMap.get(String(entry?.employeeId));
    const initials = getInitials(employee?.name || entry?.employeeName);

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
            <Badge variant="outline" className="text-[11px]">
              {formatDurationLabel(entry?.startTime, entry?.endTime)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {entry?.startTime} - {entry?.endTime}
          </p>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Open shift actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Shift actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleOpenComposer('edit', entry)}
              >
                Edit shift
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDuplicateShift(entry)}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShiftPendingDelete(entry)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
            <div className="flex items-center gap-3 text-sm">
              <Button
                size="sm"
                className="gap-2"
                onClick={() =>
                  handleOpenComposer('create', {
                    day:
                      appliedFilters.day && appliedFilters.day !== '_all'
                        ? appliedFilters.day
                        : selectableDays[0],
                  })
                }
                disabled={!composerHasEmployees}
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Plan shift
              </Button>
            </div>
          ) : null
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleDayCollapsed(day);
                        }}
                      >
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          )}
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {isCollapsed ? 'Expand shifts' : 'Collapse shifts'}
                        </span>
                      </Button>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            handleOpenComposer('create', {
                              day,
                              repeatDays: [day],
                            })
                          }
                          onMouseDown={(event) => event.stopPropagation()}
                          onClickCapture={(event) => event.stopPropagation()}
                        >
                          <PlusCircle className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Add shift for {day}</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <div className="mt-4 space-y-3">
                      {entries.length ? (
                        entries.map((entry) => renderShiftCard(entry))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                          No shifts planned.
                          {canManage ? (
                            <span>
                              {' Use "Plan shift" to assign coverage.'}
                            </span>
                          ) : null}
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

      <Sheet open={composerOpen} onOpenChange={handleComposerOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-[520px] overflow-y-auto border-l border-border/80 bg-background/95"
        >
          <SheetHeader>
            <SheetTitle>
              {composerMode === 'create' ? 'Plan a shift' : 'Edit shift'}
            </SheetTitle>
            <SheetDescription>
              Choose the teammate, timing, and (optionally) duplicate the shift
              across multiple days.
            </SheetDescription>
          </SheetHeader>
          {composerHasEmployees ? (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select
                  value={draftShift.employeeId || ''}
                  onValueChange={(value) =>
                    handleComposerFieldChange('employeeId', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeList.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.name} ({employee.position || 'Team member'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select
                    value={draftShift.day}
                    onValueChange={(value) =>
                      handleComposerFieldChange('day', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableDays.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Repeat on</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectableDays.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={
                          draftShift.repeatDays.includes(day)
                            ? 'default'
                            : 'outline'
                        }
                        className="rounded-full text-xs"
                        disabled={composerMode === 'edit'}
                        onClick={() => toggleRepeatDay(day)}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={draftShift.startTime}
                    onChange={(event) =>
                      handleComposerFieldChange('startTime', event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={draftShift.endTime}
                    onChange={(event) =>
                      handleComposerFieldChange('endTime', event.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              Add employees from the admin panel first to start planning shifts.
            </p>
          )}
          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleComposerOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleComposerSubmit}
              disabled={!composerValid || composerSaving}
            >
              {composerMode === 'create' ? 'Save shift' : 'Update shift'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(shiftPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setShiftPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift</AlertDialogTitle>
            <AlertDialogDescription>
              This shift will be removed from the weekly planner. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShiftPendingDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Delete shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default WeeklyScheduleCard;
