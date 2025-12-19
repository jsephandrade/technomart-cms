import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthContext';
import { useEmployees, useSchedule } from '@/hooks/useEmployees';
import { useLocation, useNavigate } from 'react-router-dom';

import ManageEmployeesDialog from '@/components/employee-schedule/ManageEmployeesDialog';
import AddScheduleDialog from '@/components/employee-schedule/AddScheduleDialog';
import WeeklyScheduleCard from '@/components/employee-schedule/WeeklyScheduleCard';
import EditScheduleDialog from '@/components/employee-schedule/EditScheduleDialog';
import ScheduleCalendar from '@/components/schedule/ScheduleCalendar';
import AttendanceAdmin from '@/components/AttendanceAdmin';
import LeaveManagement from '@/components/LeaveManagement';
import AttendanceTimeCard from '@/components/employee-schedule/AttendanceTimeCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, ClipboardList, Plane, ShieldPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DEFAULT_SCHEDULE_ENTRY = {
  employeeId: '',
  employeeName: '',
  day: '',
  startTime: '06:00',
  endTime: '14:00',
};

const DEFAULT_EMPLOYEE_FORM = {
  id: '',
  name: '',
  position: '',
  hourlyRate: 0,
  contact: '',
  status: 'active',
};

const EmployeeSchedule = () => {
  const { hasAnyRole, user } = useAuth();
  const canManage = hasAnyRole(['manager', 'admin']);
  const isStaffOnly = hasAnyRole(['staff']) && !canManage;
  const location = useLocation();
  const navigate = useNavigate();

  const {
    employees = [],
    addEmployeeWithSchedule,
    updateEmployee,
    deleteEmployee,
    loading: employeesLoading,
    refetch: refetchEmployees,
  } = useEmployees();

  const displayEmployees = useMemo(
    () =>
      employees.filter(
        (emp) => emp && emp.status !== 'inactive' && emp.status !== 'pending'
      ),
    [employees]
  );

  const {
    schedule = [],
    addScheduleEntry,
    updateScheduleEntry,
    deleteScheduleEntry,
    loading: scheduleLoading,
    refetch: refetchSchedule,
  } = useSchedule({}, { autoFetch: true });

  const [dialogOpen, setDialogOpenState] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [newScheduleEntry, setNewScheduleEntry] = useState({
    ...DEFAULT_SCHEDULE_ENTRY,
  });
  const [managedEmployee, setManagedEmployee] = useState({
    ...DEFAULT_EMPLOYEE_FORM,
  });
  const [quickAdd, setQuickAdd] = useState({
    name: '',
    position: '',
    day: 'Monday',
    startTime: '08:00',
    endTime: '16:00',
  });
  const [activeTab, setActiveTab] = useState('schedule');
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const attendanceAutoOpenDismissed = useRef(false);

  const handleQuickAdd = async () => {
    if (!canManage) return;
    if (!quickAdd.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = {
      name: quickAdd.name,
      position: quickAdd.position,
      schedule: [
        {
          day: quickAdd.day,
          startTime: quickAdd.startTime,
          endTime: quickAdd.endTime,
        },
      ],
    };
    try {
      await addEmployeeWithSchedule(payload);
      await Promise.all([refetchEmployees(), refetchSchedule()]);
      setQuickAdd({
        name: '',
        position: '',
        day: 'Monday',
        startTime: '08:00',
        endTime: '16:00',
      });
      toast.success('Employee and shift added');
    } catch (error) {
      console.error(error);
    }
  };

  const hasShiftToday = useMemo(() => {
    // Check if user has a linked Employee record
    const userEmployeeId = user?.employeeId || user?.id;
    if (!userEmployeeId || !Array.isArray(schedule) || schedule.length === 0) {
      return false;
    }

    const todayIndex = new Date().getDay();
    const todayName = DAYS_OF_WEEK[todayIndex] || '';
    if (!todayName) return false;
    const normalize = (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    const todayKey = normalize(todayName);

    return schedule.some((entry) => {
      if (!entry) return false;
      const entryEmployeeId =
        entry.employeeId ??
        entry.employee?.id ??
        entry.employee?.employeeId ??
        null;
      if (entryEmployeeId == null) return false;
      // Compare with user's employeeId (preferred) or fall back to user.id for backwards compat
      if (String(entryEmployeeId) !== String(userEmployeeId)) return false;
      return normalize(entry.day) === todayKey;
    });
  }, [schedule, user?.employeeId, user?.id]);

  const handleScheduleDialogOpenChange = (open) => {
    if (!open) {
      setNewScheduleEntry({ ...DEFAULT_SCHEDULE_ENTRY });
    }
    setDialogOpenState(open);
  };

  useEffect(() => {
    if (canManage) return;

    if (editingSchedule) {
      setEditingSchedule(null);
    }
    if (dialogOpen) {
      setDialogOpenState(false);
      setNewScheduleEntry({ ...DEFAULT_SCHEDULE_ENTRY });
    }
    if (employeeDialogOpen) {
      setEmployeeDialogOpen(false);
      setManagedEmployee({ ...DEFAULT_EMPLOYEE_FORM });
    }
  }, [canManage, dialogOpen, editingSchedule, employeeDialogOpen]);

  useEffect(() => {
    if (!isStaffOnly) return;

    const searchParams = new URLSearchParams(location.search || '');
    const attendanceParam = (
      searchParams.get('attendance') || ''
    ).toLowerCase();
    const openFromSearch = ['1', 'true', 'yes'].includes(attendanceParam);
    const openFromState = Boolean(
      location.state && location.state.openAttendance
    );
    const requested = openFromSearch || openFromState;

    const clearAttendanceIndicators = () => {
      if (openFromSearch || searchParams.has('attendance')) {
        searchParams.delete('attendance');
        navigate(
          {
            pathname: location.pathname,
            search: searchParams.toString()
              ? `?${searchParams.toString()}`
              : '',
          },
          {
            replace: true,
            state: { ...(location.state || {}), openAttendance: false },
          }
        );
      } else if (openFromState) {
        navigate(location.pathname + (location.search || ''), {
          replace: true,
          state: { ...(location.state || {}), openAttendance: false },
        });
      }
    };

    if (!requested) return;

    if (scheduleLoading) return;

    if (!hasShiftToday) {
      clearAttendanceIndicators();
      return;
    }

    if (!attendanceDialogOpen) {
      setAttendanceDialogOpen(true);
    }

    clearAttendanceIndicators();
  }, [
    attendanceDialogOpen,
    hasShiftToday,
    isStaffOnly,
    location,
    scheduleLoading,
    navigate,
  ]);

  useEffect(() => {
    if (!location.state?.openAttendancePopup) return;

    if (scheduleLoading) return;

    const { openAttendancePopup, attendanceNavTimestamp, ...restState } =
      location.state || {};

    const nextState = Object.keys(restState).length > 0 ? restState : undefined;

    const clearPopupState = () => {
      navigate(
        {
          pathname: location.pathname,
          search: location.search || '',
        },
        {
          replace: true,
          state: nextState,
        }
      );
    };

    if (!hasShiftToday) {
      clearPopupState();
      return;
    }

    if (!attendanceDialogOpen) {
      setAttendanceDialogOpen(true);
    }

    clearPopupState();
  }, [
    attendanceDialogOpen,
    hasShiftToday,
    location.pathname,
    location.search,
    location.state,
    scheduleLoading,
    navigate,
  ]);

  const handleAttendanceDialogChange = (open) => {
    if (!open) {
      attendanceAutoOpenDismissed.current = true;
    }
    setAttendanceDialogOpen(open);
  };

  useEffect(() => {
    if (!isStaffOnly) return;

    const normalizedPath = (location.pathname || '').replace(/\/+$/, '') || '/';
    const matchesEmployeesRoute =
      normalizedPath === '/employees' || normalizedPath === '/employeed';

    if (!matchesEmployeesRoute) {
      attendanceAutoOpenDismissed.current = false;
      return;
    }

    if (scheduleLoading || !hasShiftToday) return;
    if (attendanceDialogOpen || attendanceAutoOpenDismissed.current) return;

    attendanceAutoOpenDismissed.current = true;
    setAttendanceDialogOpen(true);
  }, [
    attendanceDialogOpen,
    hasShiftToday,
    isStaffOnly,
    location.pathname,
    scheduleLoading,
  ]);

  const lookupEmployeeName = (employeeId) =>
    displayEmployees.find((e) => e?.id === employeeId)?.name || 'Unknown';

  const toMinutes = (time) => {
    if (!time) return NaN;
    const match = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return NaN;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const handleUpdateEmployee = async (updates) => {
    if (!canManage) return;
    const { id, name, position, hourlyRate, contact, status } = updates || {};

    if (!id) {
      toast.error('Select an employee to update');
      return;
    }

    if (!name?.trim() || !position?.trim()) {
      toast.error('Please provide employee name and position');
      return;
    }

    try {
      const sanitizedRate = Number.isFinite(Number(hourlyRate))
        ? Number(hourlyRate)
        : 0;

      await updateEmployee(id, {
        name: name.trim(),
        position: position.trim(),
        hourlyRate: sanitizedRate,
        contact: contact?.trim() || '',
        status: status ? String(status).toLowerCase() : 'active',
      });

      setManagedEmployee({ ...DEFAULT_EMPLOYEE_FORM });
      setEmployeeDialogOpen(false);
    } catch (error) {
      console.error(error);
      // useEmployees hook surfaces toast messaging on failure.
    }
  };

  const handleAddSchedule = async () => {
    if (!canManage) return;
    const { employeeId, day, startTime, endTime } = newScheduleEntry;

    if (!employeeId || !day || !startTime || !endTime) {
      toast.error('Please fill in all fields');
      return;
    }

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      toast.error('Invalid time range');
      return;
    }

    if (
      schedule.some(
        (entry) => entry?.employeeId === employeeId && entry?.day === day
      )
    ) {
      toast.error('Schedule already exists for this day');
      return;
    }

    try {
      await addScheduleEntry({
        ...newScheduleEntry,
        employeeName: lookupEmployeeName(employeeId),
      });
      handleScheduleDialogOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to add schedule');
    }
  };

  const handleEditSchedule = async () => {
    if (!editingSchedule || !canManage) return;
    const start = toMinutes(editingSchedule?.startTime);
    const end = toMinutes(editingSchedule?.endTime);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      toast.error('Invalid time range');
      return;
    }

    try {
      await updateScheduleEntry(editingSchedule?.id, editingSchedule);
      setEditingSchedule(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!canManage) return;

    const confirmDelete =
      typeof window !== 'undefined'
        ? window.confirm('Delete this schedule entry?')
        : true;

    if (!confirmDelete) return;

    try {
      await deleteScheduleEntry(id);
      toast.success('Deleted schedule');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete schedule');
    }
  };

  const scheduleContent = (
    <>
      <div className="mt-2 space-y-6">
        {canManage ? (
          <Card className="border-dashed border-primary/30 bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldPlus
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  <CardTitle className="text-base font-semibold">
                    Add Employee and Shift
                  </CardTitle>
                </div>
                <span className="text-xs text-muted-foreground hidden md:inline">
                  Aligned with Weekly Shift Planner styling
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] items-end">
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide">
                    Name *
                  </Label>
                  <Input
                    value={quickAdd.name}
                    onChange={(e) =>
                      setQuickAdd((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide">
                    Role
                  </Label>
                  <Input
                    value={quickAdd.position}
                    onChange={(e) =>
                      setQuickAdd((prev) => ({
                        ...prev,
                        position: e.target.value,
                      }))
                    }
                    placeholder="Barista"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide">Day</Label>
                  <div className="relative">
                    <select
                      className={cn(
                        'w-full appearance-none rounded-md border-input bg-background text-sm px-3 py-2',
                        'focus:outline-none focus:ring-2 focus:ring-primary/40'
                      )}
                      value={quickAdd.day}
                      onChange={(e) =>
                        setQuickAdd((prev) => ({
                          ...prev,
                          day: e.target.value,
                        }))
                      }
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground/70 text-xs">
                      ▼
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide">
                    Start
                  </Label>
                  <Input
                    type="time"
                    value={quickAdd.startTime}
                    onChange={(e) =>
                      setQuickAdd((prev) => ({
                        ...prev,
                        startTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wide">End</Label>
                  <Input
                    type="time"
                    value={quickAdd.endTime}
                    onChange={(e) =>
                      setQuickAdd((prev) => ({
                        ...prev,
                        endTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={handleQuickAdd}
                    disabled={employeesLoading || scheduleLoading}
                  >
                    Save & schedule
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <div className="grid gap-2 items-start lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.6fr)] 2xl:grid-cols-[minmax(0,1.8fr)_minmax(0,0.6fr)]">
          <WeeklyScheduleCard
            daysOfWeek={DAYS_OF_WEEK}
            employeeList={displayEmployees}
            schedule={schedule}
            onEditSchedule={canManage ? setEditingSchedule : undefined}
            onDeleteSchedule={handleDeleteSchedule}
            onAddScheduleForDay={(employeeId, day) => {
              if (!canManage) return;
              setNewScheduleEntry({
                ...DEFAULT_SCHEDULE_ENTRY,
                employeeId,
                employeeName: lookupEmployeeName(employeeId),
                day,
              });
              handleScheduleDialogOpenChange(true);
            }}
            onOpenManageEmployees={() => {
              if (!canManage) return;
              const firstEmployee = displayEmployees[0];
              if (firstEmployee) {
                setManagedEmployee({
                  id: firstEmployee.id,
                  name: firstEmployee.name || '',
                  position: firstEmployee.position || '',
                  hourlyRate: firstEmployee.hourlyRate ?? 0,
                  contact: firstEmployee.contact || '',
                  status: firstEmployee.status || 'active',
                });
              } else {
                setManagedEmployee({ ...DEFAULT_EMPLOYEE_FORM });
              }
              setEmployeeDialogOpen(true);
            }}
            onOpenAddSchedule={() => {
              if (!canManage) return;
              setNewScheduleEntry({ ...DEFAULT_SCHEDULE_ENTRY });
              handleScheduleDialogOpenChange(true);
            }}
            canManage={canManage}
          />
          <div className="space-y-6 lg:w-full lg:max-w-md lg:justify-self-end">
            <ScheduleCalendar
              schedule={schedule}
              employeeList={displayEmployees}
              className="w-full max-w-none lg:max-w-sm lg:ml-auto"
            />
            {user && !isStaffOnly ? (
              <AttendanceTimeCard user={user} className="w-full" />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      {canManage ? (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-3 divide-x divide-border rounded-lg bg-muted/40 text-xs sm:flex sm:w-fit sm:flex-wrap sm:gap-2 sm:divide-x-0 sm:bg-transparent">
            <TabsTrigger
              value="schedule"
              aria-label="Weekly Schedule"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 sm:min-w-[160px] sm:flex-none sm:px-4"
            >
              <CalendarDays className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Weekly Schedule</span>
            </TabsTrigger>
            <TabsTrigger
              value="attendance"
              aria-label="Attendance Records"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 sm:min-w-[160px] sm:flex-none sm:px-4"
            >
              <ClipboardList className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Attendance Records</span>
            </TabsTrigger>
            <TabsTrigger
              value="leave"
              aria-label="Leave Records"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 sm:min-w-[160px] sm:flex-none sm:px-4"
            >
              <Plane className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Leave Records</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="schedule" className="space-y-6">
            {activeTab === 'schedule' ? scheduleContent : null}
          </TabsContent>
          <TabsContent value="attendance" className="space-y-6">
            {activeTab === 'attendance' ? <AttendanceAdmin /> : null}
          </TabsContent>
          <TabsContent value="leave" className="space-y-6">
            {activeTab === 'leave' ? <LeaveManagement /> : null}
          </TabsContent>
        </Tabs>
      ) : (
        scheduleContent
      )}

      <EditScheduleDialog
        editingSchedule={editingSchedule}
        setEditingSchedule={setEditingSchedule}
        daysOfWeek={DAYS_OF_WEEK}
        employeeList={displayEmployees}
        onSave={handleEditSchedule}
      />

      <ManageEmployeesDialog
        open={employeeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setManagedEmployee({ ...DEFAULT_EMPLOYEE_FORM });
          }
          setEmployeeDialogOpen(open);
        }}
        employeeList={displayEmployees}
        managedEmployee={managedEmployee}
        setManagedEmployee={setManagedEmployee}
        onUpdateEmployee={handleUpdateEmployee}
        showTrigger={false}
      />

      <AddScheduleDialog
        open={dialogOpen}
        onOpenChange={handleScheduleDialogOpenChange}
        newScheduleEntry={newScheduleEntry}
        setNewScheduleEntry={setNewScheduleEntry}
        employeeList={displayEmployees}
        daysOfWeek={DAYS_OF_WEEK}
        onAddSchedule={handleAddSchedule}
        showTrigger={false}
      />

      {user && (
        <Dialog
          open={attendanceDialogOpen}
          onOpenChange={handleAttendanceDialogChange}
        >
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Record Your Attendance</DialogTitle>
              <DialogDescription>
                Track today's time in and time out.
              </DialogDescription>
            </DialogHeader>
            <AttendanceTimeCard user={user} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EmployeeSchedule;
