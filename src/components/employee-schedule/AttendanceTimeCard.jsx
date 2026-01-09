import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Clock, LogOut } from 'lucide-react';
import { useAttendance } from '@/hooks/useAttendance';
import { useAuth } from '@/components/AuthContext';
import FeaturePanelCard from '../shared/FeaturePanelCard';
import { cn } from '@/lib/utils';

const buildLocalKey = (employeeId, date) =>
  `attendance:${employeeId || 'unknown'}:${date || ''}`;

const defaultLocalAttendance = {
  checkIn: false,
  checkOut: false,
  checkInAt: null,
  checkOutAt: null,
};

const readLocalAttendance = (employeeId, date) => {
  try {
    const raw = localStorage.getItem(buildLocalKey(employeeId, date));
    if (!raw) return { ...defaultLocalAttendance };
    const parsed = JSON.parse(raw);
    const checkInAt = parsed.checkInAt || null;
    const checkOutAt = parsed.checkOutAt || null;
    return {
      ...defaultLocalAttendance,
      checkIn: Boolean(parsed.checkIn || checkInAt),
      checkOut: Boolean(parsed.checkOut || checkOutAt),
      checkInAt,
      checkOutAt,
    };
  } catch {
    return { ...defaultLocalAttendance };
  }
};

const writeLocalAttendance = (employeeId, date, data) => {
  try {
    const next = {
      checkIn: Boolean(data?.checkIn),
      checkOut: Boolean(data?.checkOut),
      checkInAt: data?.checkInAt || null,
      checkOutAt: data?.checkOutAt || null,
    };
    localStorage.setItem(buildLocalKey(employeeId, date), JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
};

const getManilaNow = () =>
  new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
    })
  );

const formatTimeForRecord = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
};

const createManilaDateFromTime = (timeStr, referenceDate) => {
  if (!timeStr) return null;
  const segments = timeStr.split(':');
  if (segments.length < 2) return null;
  const [hours = '0', minutes = '0', seconds = '0'] = segments;
  const h = Number.parseInt(hours, 10);
  const m = Number.parseInt(minutes, 10);
  const s = Number.parseInt(seconds, 10) || 0;
  if ([h, m, s].some((value) => Number.isNaN(value))) return null;
  const reference =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? new Date(referenceDate)
      : getManilaNow();
  reference.setHours(h, m, s, 0);
  return reference;
};

const toLocalDateStr = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return '';
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const AttendanceTimeCard = ({ user, className, dailySchedule }) => {
  const { updateProfile } = useAuth();
  const subjectEmployeeId = useMemo(() => {
    if (!user) return null;
    return user.employeeId ?? user.id ?? null;
  }, [user]);

  const attendanceParams = useMemo(() => {
    if (!subjectEmployeeId) return {};
    return { employeeId: subjectEmployeeId };
  }, [subjectEmployeeId]);

  const {
    records = [],
    createRecord,
    updateRecord,
  } = useAttendance(attendanceParams, {
    autoFetch: Boolean(subjectEmployeeId),
    watchInitialParams: true,
    suppressErrorToast: true,
  });

  const syncEmployeeId = useCallback(
    async (employeeId) => {
      if (!employeeId || user?.employeeId === employeeId) return;
      if (typeof updateProfile === 'function') {
        await updateProfile({ employeeId });
      }
    },
    [updateProfile, user?.employeeId]
  );

  const initialTodayKey = toLocalDateStr(getManilaNow());
  const [currentTime, setCurrentTime] = useState(() => getManilaNow());
  const today = useMemo(() => toLocalDateStr(currentTime), [currentTime]);
  const [localStatus, setLocalStatus] = useState(() =>
    readLocalAttendance(subjectEmployeeId, initialTodayKey)
  );
  const nowTime = useCallback(() => {
    const current = getManilaNow();
    return `${String(current.getHours()).padStart(2, '0')}:${String(
      current.getMinutes()
    ).padStart(2, '0')}:${String(current.getSeconds()).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const interval = window.setInterval(() => {
      setCurrentTime(getManilaNow());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const todayRecord = useMemo(() => {
    if (!subjectEmployeeId) return undefined;
    const targetId = String(subjectEmployeeId);
    return records.find(
      (record) =>
        record &&
        record.date === today &&
        record.employeeId != null &&
        String(record.employeeId) === targetId
    );
  }, [records, subjectEmployeeId, today]);

  useEffect(() => {
    if (todayRecord?.employeeId) {
      syncEmployeeId(todayRecord.employeeId);
    }
  }, [todayRecord?.employeeId, syncEmployeeId]);

  useEffect(() => {
    setLocalStatus(readLocalAttendance(subjectEmployeeId, today));
  }, [subjectEmployeeId, today, todayRecord?.checkIn, todayRecord?.checkOut]);

  const effectiveRecord = useMemo(() => {
    if (todayRecord) return todayRecord;
    if (!subjectEmployeeId) return null;
    if (localStatus.checkIn || localStatus.checkOut) {
      return {
        id: `local-${today}`,
        employeeId: subjectEmployeeId,
        date: today,
        checkIn:
          localStatus.checkInAt || (localStatus.checkIn ? 'local' : null),
        checkOut:
          localStatus.checkOutAt || (localStatus.checkOut ? 'local' : null),
        status: 'present',
      };
    }
    return null;
  }, [todayRecord, localStatus, subjectEmployeeId, today]);

  const shiftEndDate = useMemo(
    () => createManilaDateFromTime(dailySchedule?.endTime, currentTime),
    [dailySchedule, currentTime]
  );
  const attendanceWindowClosed = Boolean(
    dailySchedule?.endTime &&
      shiftEndDate &&
      currentTime.getTime() > shiftEndDate.getTime()
  );
  const autoAbsentRef = useRef(false);
  const autoLateRef = useRef(false);

  useEffect(() => {
    autoAbsentRef.current = false;
    autoLateRef.current = false;
  }, [dailySchedule, today]);

  useEffect(() => {
    if (
      !dailySchedule ||
      !attendanceWindowClosed ||
      !subjectEmployeeId ||
      !today
    ) {
      return;
    }
    const shiftEndTimeValue = formatTimeForRecord(shiftEndDate);
    const markAbsent = async () => {
      try {
        await createRecord({
          employeeId: subjectEmployeeId,
          employeeName: user?.name || '',
          date: today,
          status: 'absent',
          notes: 'Shift window closed without clock-in',
        });
      } catch (error) {
        console.error('Auto-mark absent failed', error);
        autoAbsentRef.current = false;
      }
    };
    const markLate = async () => {
      if (!effectiveRecord?.id) return;
      try {
        await updateRecord(effectiveRecord.id, {
          status: 'late',
          checkOut: shiftEndTimeValue || nowTime(),
          notes: 'Shift window closed without clock-out',
        });
      } catch (error) {
        console.error('Auto-mark late failed', error);
        autoLateRef.current = false;
      }
    };
    if (!effectiveRecord?.checkIn && !autoAbsentRef.current) {
      autoAbsentRef.current = true;
      markAbsent();
      return;
    }
    if (
      effectiveRecord?.checkIn &&
      !effectiveRecord?.checkOut &&
      !autoLateRef.current
    ) {
      autoLateRef.current = true;
      markLate();
    }
  }, [
    attendanceWindowClosed,
    createRecord,
    dailySchedule,
    effectiveRecord,
    nowTime,
    shiftEndDate,
    subjectEmployeeId,
    today,
    updateRecord,
    user?.name,
  ]);

  const handleTimeIn = async () => {
    const selectedEmployeeId = subjectEmployeeId;
    if (!selectedEmployeeId) {
      toast.error('Unable to identify user for attendance.');
      return;
    }
    if (effectiveRecord?.checkIn) {
      toast.error('Already timed in today.');
      return;
    }

    try {
      const checkInTime = nowTime();
      const created = await createRecord({
        employeeId: selectedEmployeeId,
        employeeName: user?.name || '',
        date: today,
        checkIn: checkInTime,
        status: 'present',
      });
      const resolvedEmployeeId = created?.employeeId || selectedEmployeeId;
      await syncEmployeeId(created?.employeeId);
      writeLocalAttendance(resolvedEmployeeId, today, {
        checkIn: true,
        checkOut: Boolean(effectiveRecord?.checkOut),
        checkInAt: checkInTime,
        checkOutAt: effectiveRecord?.checkOut || null,
      });
      setLocalStatus((prev) => ({
        ...prev,
        checkIn: true,
        checkInAt: checkInTime,
      }));
      toast.success('Timed in successfully');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || 'Failed to time in');
    }
  };

  const handleTimeOut = async () => {
    const selectedEmployeeId = subjectEmployeeId;
    if (!selectedEmployeeId) {
      toast.error('Unable to identify user for attendance.');
      return;
    }
    if (!effectiveRecord || !effectiveRecord.checkIn) {
      toast.error('No active time-in record today');
      return;
    }
    if (effectiveRecord.checkOut) {
      toast.error('You already completed time out today.');
      return;
    }

    try {
      const checkOutTime = nowTime();
      const checkInTimeValue =
        (effectiveRecord.checkIn &&
          String(effectiveRecord.checkIn).includes(':') &&
          effectiveRecord.checkIn) ||
        localStatus.checkInAt ||
        null;
      const recordId = effectiveRecord?.id;
      const isLocalRecord = !recordId || String(recordId).startsWith('local-');
      let updated = null;
      if (isLocalRecord) {
        const payload = {
          employeeId: selectedEmployeeId,
          employeeName: user?.name || '',
          date: today,
          checkOut: checkOutTime,
          status: 'present',
        };
        if (checkInTimeValue) {
          payload.checkIn = checkInTimeValue;
        }
        updated = await createRecord(payload);
      } else {
        try {
          updated = await updateRecord(recordId, {
            checkOut: checkOutTime,
          });
        } catch (error) {
          if (error?.status === 404) {
            const payload = {
              employeeId: selectedEmployeeId,
              employeeName: user?.name || '',
              date: today,
              checkOut: checkOutTime,
              status: 'present',
            };
            if (checkInTimeValue) {
              payload.checkIn = checkInTimeValue;
            }
            updated = await createRecord(payload);
          } else {
            throw error;
          }
        }
      }
      const resolvedEmployeeId =
        updated?.employeeId ||
        effectiveRecord?.employeeId ||
        selectedEmployeeId;
      await syncEmployeeId(updated?.employeeId || effectiveRecord?.employeeId);
      writeLocalAttendance(resolvedEmployeeId, today, {
        checkIn: true,
        checkOut: true,
        checkInAt: checkInTimeValue,
        checkOutAt: checkOutTime,
      });
      setLocalStatus({
        checkIn: true,
        checkOut: true,
        checkInAt: checkInTimeValue,
        checkOutAt: checkOutTime,
      });
      toast.success('Timed out successfully');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || 'Failed to time out');
    }
  };

  const parseTimeToDate = (timeStr) => {
    if (!timeStr) return null;
    const segments = timeStr.split(':');
    if (segments.length < 2) return null;
    const [hours = '0', minutes = '0', seconds = '0'] = segments;
    const h = Number.parseInt(hours, 10);
    const m = Number.parseInt(minutes, 10);
    const s = Number.parseInt(seconds, 10) || 0;
    if ([h, m, s].some((value) => Number.isNaN(value))) return null;
    const date = new Date();
    date.setHours(h, m, s, 0);
    return date;
  };

  const formatTo12Hour = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  };

  const formatDuration = (milliseconds) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const checkInDate = useMemo(
    () => parseTimeToDate(effectiveRecord?.checkIn),
    [effectiveRecord?.checkIn]
  );
  const checkOutDate = useMemo(
    () => parseTimeToDate(effectiveRecord?.checkOut),
    [effectiveRecord?.checkOut]
  );

  const displayCurrentTime = formatTo12Hour(currentTime);

  const durationMs = useMemo(() => {
    if (!checkInDate) return null;
    const end = checkOutDate || currentTime;
    return end.getTime() - checkInDate.getTime();
  }, [checkInDate, checkOutDate, currentTime]);

  const statusConfig = useMemo(() => {
    if (!effectiveRecord) {
      return { label: 'Not Clocked In', className: 'text-muted-foreground' };
    }
    if (effectiveRecord.checkIn && !effectiveRecord.checkOut) {
      return { label: 'Clocked In', className: 'text-emerald-600' };
    }
    if (effectiveRecord.checkOut) {
      return { label: 'Clocked Out', className: 'text-red-600' };
    }
    return {
      label: effectiveRecord.status || 'Unknown Status',
      className: 'text-muted-foreground',
    };
  }, [effectiveRecord]);

  const hasTimedInToday = Boolean(effectiveRecord?.checkIn);
  const isClockedIn = Boolean(
    effectiveRecord?.checkIn && !effectiveRecord?.checkOut
  );
  const canTimeOut =
    Boolean(effectiveRecord?.checkIn) && !effectiveRecord?.checkOut;

  return (
    <FeaturePanelCard
      className={cn('w-full', className)}
      badgeText="Daily Time Record"
      badgeIcon={Clock}
      badgeClassName="whitespace-nowrap tracking-[0.12em]"
      description="Monitor today's clock-ins and duration."
      contentClassName="space-y-6"
    >
      <div className="space-y-2 text-center">
        <div className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {displayCurrentTime}
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          Status:{' '}
          <span className={cn('font-semibold', statusConfig.className)}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          size="lg"
          className={cn(
            'flex-1 min-w-[140px] border-2 border-emerald-600 bg-emerald-600 text-white transition-colors hover:bg-emerald-600/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-60'
          )}
          onClick={handleTimeIn}
          disabled={hasTimedInToday || attendanceWindowClosed}
        >
          <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
          Time In
        </Button>
        <Button
          size="lg"
          className={cn(
            'flex-1 min-w-[140px] border-2 bg-red-500 text-white transition-opacity hover:bg-red-500/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500',
            !canTimeOut || attendanceWindowClosed
              ? 'cursor-not-allowed opacity-70'
              : 'opacity-100'
          )}
          onClick={handleTimeOut}
          disabled={!canTimeOut || attendanceWindowClosed}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Time Out
        </Button>
      </div>

      <div className="space-y-1 text-center text-xs text-muted-foreground">
        {dailySchedule ? (
          <p>
            Scheduled: {dailySchedule.startTime} - {dailySchedule.endTime}
          </p>
        ) : (
          <p>No scheduled shift found for today.</p>
        )}
        {attendanceWindowClosed ? (
          <p className="text-destructive">
            Shift window closed — attendance locked and auto recorded.
          </p>
        ) : null}
      </div>

      <div className="space-y-1 text-center text-sm text-muted-foreground">
        <div>
          Time In:{' '}
          <span className="font-semibold text-foreground">
            {checkInDate ? formatTo12Hour(checkInDate) : '--:--'}
          </span>
        </div>
        <div>
          Time Out:{' '}
          <span className="font-semibold text-foreground">
            {checkOutDate ? formatTo12Hour(checkOutDate) : '--:--'}
          </span>
        </div>
        <div>
          Duration:{' '}
          <span
            className={cn(
              'font-semibold',
              isClockedIn ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {durationMs != null ? formatDuration(durationMs) : '--:--'}
          </span>
        </div>
      </div>
    </FeaturePanelCard>
  );
};

export default AttendanceTimeCard;
