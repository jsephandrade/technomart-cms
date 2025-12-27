import React, { useEffect, useMemo, useState } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const SHORT_DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DAY_INDEX_BY_NAME = DAY_LABELS.reduce((acc, label, index) => {
  acc[label] = index;
  return acc;
}, {});

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfMonth = (date) => {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
};

const shiftDateByMonths = (date, months) => {
  const base = date ? new Date(date) : startOfDay(new Date());
  const desiredDay = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(desiredDay, lastDayOfTargetMonth));
  return startOfDay(target);
};

const getNextDateForDay = (targetDayIndex, baseDate) => {
  const reference = startOfDay(baseDate || new Date());
  const offset = (targetDayIndex - reference.getDay() + 7) % 7;
  reference.setDate(reference.getDate() + offset);
  return reference;
};

const computeInitialSelectedDate = (schedule = []) => {
  const today = startOfDay(new Date());

  const candidates = schedule
    .map((entry) => DAY_INDEX_BY_NAME[entry.day])
    .filter((dayIndex) => Number.isInteger(dayIndex))
    .map((dayIndex) => getNextDateForDay(dayIndex, today));

  if (candidates.length === 0) {
    return today;
  }

  const nearestTime = Math.min(
    ...candidates.map((candidate) => candidate.getTime())
  );

  return new Date(nearestTime);
};

const deriveScheduleByDay = (schedule = []) => {
  const map = new Map();
  schedule.forEach((entry) => {
    if (!entry) return;
    const dayIndex = DAY_INDEX_BY_NAME[entry.day];
    if (!Number.isInteger(dayIndex)) return;

    if (!map.has(dayIndex)) {
      map.set(dayIndex, []);
    }
    map.get(dayIndex).push(entry);
  });
  return map;
};

const toMinutes = (time) => {
  if (typeof time !== 'string') return Number.POSITIVE_INFINITY;
  const [hours, minutes] = time.split(':').map(Number);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    minutes < 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return hours * 60 + minutes;
};

const ScheduleCalendar = ({
  schedule = [],
  employeeList,
  employees,
  date,
  defaultDate,
  onDateSelect,
  className,
}) => {
  const resolvedEmployees = useMemo(() => {
    if (Array.isArray(employeeList) && employeeList.length > 0) {
      return employeeList;
    }
    return employees || [];
  }, [employeeList, employees]);

  const scheduleByDay = useMemo(
    () => deriveScheduleByDay(schedule),
    [schedule]
  );

  const scheduledDayIndices = useMemo(
    () => new Set(scheduleByDay.keys()),
    [scheduleByDay]
  );

  const controlledDate = date ? startOfDay(date) : null;

  const computeFallbackDate = useMemo(() => {
    if (controlledDate) return controlledDate;
    if (defaultDate) return startOfDay(defaultDate);
    if (schedule.length > 0) {
      return computeInitialSelectedDate(schedule);
    }
    return startOfDay(new Date());
  }, [controlledDate, defaultDate, schedule]);

  const [internalSelectedDate, setInternalSelectedDate] = useState(
    () => computeFallbackDate
  );

  const selectedDate = controlledDate || internalSelectedDate;

  const [viewDate, setViewDate] = useState(() =>
    startOfMonth(selectedDate || computeFallbackDate)
  );

  useEffect(() => {
    if (controlledDate) return;
    setInternalSelectedDate((prev) => {
      if (prev) return prev;
      return computeInitialSelectedDate(schedule) || computeFallbackDate;
    });
  }, [controlledDate, computeFallbackDate, schedule]);

  useEffect(() => {
    const base = selectedDate || startOfDay(new Date());
    setViewDate((prev) => {
      const next = startOfMonth(base);
      if (
        !prev ||
        prev.getMonth() !== next.getMonth() ||
        prev.getFullYear() !== next.getFullYear()
      ) {
        return next;
      }
      return prev;
    });
  }, [selectedDate]);

  const handleSelectDate = (nextDate) => {
    if (!nextDate) return;
    const normalized = startOfDay(nextDate);

    onDateSelect?.(normalized);

    if (!controlledDate) {
      setInternalSelectedDate(normalized);
    }
    setViewDate(startOfMonth(normalized));
  };

  const goToPreviousMonth = () => {
    const base = selectedDate || viewDate || startOfDay(new Date());
    handleSelectDate(shiftDateByMonths(base, -1));
  };

  const goToNextMonth = () => {
    const base = selectedDate || viewDate || startOfDay(new Date());
    handleSelectDate(shiftDateByMonths(base, 1));
  };

  const selectedDayIndex = selectedDate ? selectedDate.getDay() : null;
  const selectedDayLabel =
    typeof selectedDayIndex === 'number' ? DAY_LABELS[selectedDayIndex] : null;

  const employeeLookup = useMemo(() => {
    const lookup = new Map();
    resolvedEmployees.forEach((employee) => {
      if (employee?.id == null) return;
      lookup.set(employee.id, employee);
    });
    return lookup;
  }, [resolvedEmployees]);

  const selectedDayEntries = useMemo(() => {
    if (typeof selectedDayIndex !== 'number') return [];
    const entries = scheduleByDay.get(selectedDayIndex) || [];
    return [...entries].sort(
      (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
    );
  }, [scheduleByDay, selectedDayIndex]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }),
    []
  );
  const dayLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );
  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const currentMonthStart = viewDate
    ? startOfMonth(viewDate)
    : startOfMonth(new Date());
  const currentMonthLabel = monthFormatter.format(currentMonthStart);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null;
    return fullDateFormatter.format(selectedDate);
  }, [selectedDate, fullDateFormatter]);

  const calendarDays = useMemo(() => {
    const monthStart = currentMonthStart;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const dateValue = new Date(gridStart);
      dateValue.setDate(gridStart.getDate() + index);
      const normalized = startOfDay(dateValue);
      const isCurrentMonth = normalized.getMonth() === monthStart.getMonth();
      const isSelected =
        selectedDate && normalized.getTime() === selectedDate.getTime();
      const isToday = normalized.getTime() === today.getTime();
      const isScheduled = scheduledDayIndices.has(normalized.getDay());

      return {
        date: normalized,
        key: normalized.toISOString(),
        isCurrentMonth,
        isSelected,
        isToday,
        isScheduled,
      };
    });
  }, [currentMonthStart, selectedDate, today, scheduledDayIndices]);

  return (
    <FeaturePanelCard
      badgeText="Shift Calendar"
      badgeIcon={CalendarClock}
      description="Monthly view of scheduled shifts. Select a day to review assignments."
      className={cn('w-full', className ? className : 'max-w-xs')}
      contentClassName="space-y-4"
    >
      <div className="rounded-lg border border-border/60 bg-background/70 p-3 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>{currentMonthLabel}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background transition-colors hover:bg-muted"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background transition-colors hover:bg-muted"
              aria-label="Next month"
            >
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
          {SHORT_DAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1 text-[11px]">
          {calendarDays.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => handleSelectDate(day.date)}
              className={cn(
                'relative flex h-7 items-center justify-center rounded-sm border border-transparent leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                day.isCurrentMonth
                  ? 'text-foreground'
                  : 'text-muted-foreground/60',
                day.isSelected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'hover:bg-muted',
                day.isToday && !day.isSelected
                  ? 'border border-primary/50'
                  : null
              )}
              aria-pressed={day.isSelected}
              aria-label={dayLabelFormatter.format(day.date)}
            >
              {day.date.getDate()}
              {day.isScheduled ? (
                <span
                  className={cn(
                    'absolute bottom-0.5 h-1 w-1 rounded-full',
                    day.isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  )}
                />
              ) : null}
            </button>
          ))}
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground text-center">
          Dates with a dot indicate at least one scheduled shift.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">
            {selectedDayLabel ? `${selectedDayLabel} Shifts` : 'Shifts'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {selectedDayLabel
              ? `Showing assignments for ${selectedDayLabel}${
                  selectedDateLabel ? ` (${selectedDateLabel})` : ''
                }.`
              : 'Select a day to review assignments.'}
          </p>
        </div>

        {selectedDayEntries.length > 0 ? (
          <div className="space-y-2">
            {selectedDayEntries.map((entry) => {
              const employee = employeeLookup.get(entry.employeeId);
              const displayName =
                employee?.name || entry.employeeName || 'Unassigned';
              const displayRole =
                employee?.position ||
                entry?.position ||
                entry?.employee?.position ||
                'N/A';
              const compositeKey =
                entry.id ??
                `${entry.employeeId || 'unknown'}-${entry.day}-${entry.startTime}-${entry.endTime}`;

              return (
                <div
                  key={compositeKey}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-background/95 p-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {displayRole}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {entry.startTime} - {entry.endTime}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </FeaturePanelCard>
  );
};

export default ScheduleCalendar;
export { ScheduleCalendar };
