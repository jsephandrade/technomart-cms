import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthContext';
import { useEmployees, useSchedule } from '@/hooks/useEmployees';
import { useLocation, useNavigate } from 'react-router-dom';

import ManageEmployeesDialog from '@/components/employee-schedule/ManageEmployeesDialog';
import AddScheduleDialog from '@/components/employee-schedule/AddScheduleDialog';
import EditScheduleDialog from '@/components/employee-schedule/EditScheduleDialog';
import AttendanceAdmin from '@/components/AttendanceAdmin';
import LeaveManagement from '@/components/LeaveManagement';
import AttendanceTimeCard from '@/components/employee-schedule/AttendanceTimeCard';
import AddEmployeeTab from '@/components/employee-schedule/AddEmployeeTab';
import ScheduleTab from '@/components/employee-schedule/ScheduleTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Archive,
  CalendarDays,
  ClipboardList,
  Plane,
  ShieldPlus,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    repeatDays: ['Monday'],
    startTime: '08:00',
    endTime: '16:00',
  });
  const [activeTab, setActiveTab] = useState('schedule');
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archivingEmployee, setArchivingEmployee] = useState(false);
  const attendanceAutoOpenDismissed = useRef(false);

  const handleQuickAdd = async () => {
    if (!canManage) return;
    if (!quickAdd.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const repeatDays =
      Array.isArray(quickAdd.repeatDays) && quickAdd.repeatDays.length
        ? Array.from(new Set(quickAdd.repeatDays))
        : [];
    if (repeatDays.length === 0) {
      toast.error('Select at least one day');
      return;
    }
    const scheduleEntries = repeatDays.map((day) => ({
      day,
      startTime: quickAdd.startTime,
      endTime: quickAdd.endTime,
    }));
    const payload = {
      name: quickAdd.name,
      position: quickAdd.position,
      schedule: scheduleEntries,
    };
    try {
      await addEmployeeWithSchedule(payload);
      await Promise.all([refetchEmployees(), refetchSchedule()]);
      setQuickAdd({
        name: '',
        position: '',
        repeatDays: ['Monday'],
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
    if (archiveDialogOpen) {
      setArchiveDialogOpen(false);
      setArchiveTarget(null);
    }
  }, [
    canManage,
    dialogOpen,
    editingSchedule,
    employeeDialogOpen,
    archiveDialogOpen,
  ]);

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

  const handleManageEmployeeClick = (employee) => {
    if (!canManage || !employee) return;
    setManagedEmployee({
      id: employee.id,
      name: employee.name || '',
      position: employee.position || '',
      hourlyRate: employee.hourlyRate ?? 0,
      contact: employee.contact || '',
      status: employee.status || 'active',
    });
    setEmployeeDialogOpen(true);
  };

  const handleArchiveEmployeeRequest = (employee) => {
    if (!canManage || !employee?.id) return;
    setArchiveTarget(employee);
    setArchiveDialogOpen(true);
  };

  const handleConfirmArchiveEmployee = async () => {
    if (!canManage || !archiveTarget?.id || archivingEmployee) return;
    setArchivingEmployee(true);
    try {
      await updateEmployee(archiveTarget.id, { status: 'inactive' });
      await Promise.all([refetchEmployees(), refetchSchedule()]);
      toast.success('Employee archived');
      setArchiveDialogOpen(false);
      setArchiveTarget(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to archive employee');
    } finally {
      setArchivingEmployee(false);
    }
  };

  const handleOpenManageEmployees = () => {
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
  };

  const addEmployeeContent = (
    <AddEmployeeTab
      quickAdd={quickAdd}
      setQuickAdd={setQuickAdd}
      handleQuickAdd={handleQuickAdd}
      employeesLoading={employeesLoading}
      scheduleLoading={scheduleLoading}
      canManage={canManage}
      daysOfWeek={DAYS_OF_WEEK}
      employees={displayEmployees}
      onManageEmployee={handleManageEmployeeClick}
      onArchiveEmployee={handleArchiveEmployeeRequest}
      onOpenManageEmployees={handleOpenManageEmployees}
    />
  );

  const schedulePane = (
    <ScheduleTab
      daysOfWeek={DAYS_OF_WEEK}
      displayEmployees={displayEmployees}
      employeeDirectory={employees}
      schedule={schedule}
      canManage={canManage}
      setEditingSchedule={setEditingSchedule}
      handleDeleteSchedule={handleDeleteSchedule}
      lookupEmployeeName={lookupEmployeeName}
      setNewScheduleEntry={setNewScheduleEntry}
      handleScheduleDialogOpenChange={handleScheduleDialogOpenChange}
      defaultScheduleEntry={DEFAULT_SCHEDULE_ENTRY}
      user={user}
      isStaffOnly={isStaffOnly}
      onOpenManageEmployees={handleOpenManageEmployees}
      onOpenAddSchedule={() => {
        if (!canManage) return;
        setNewScheduleEntry({ ...DEFAULT_SCHEDULE_ENTRY });
        handleScheduleDialogOpenChange(true);
      }}
    />
  );

  return (
    <div className="space-y-6">
      {canManage ? (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-6"
        >
          <TabsList className="w-full grid grid-cols-4 gap-2 bg-muted/40 p-1 rounded-lg">
            <TabsTrigger
              value="add"
              aria-label="Add Employee"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Add Employee</span>
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              aria-label="Weekly Schedule"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Weekly Schedule</span>
            </TabsTrigger>
            <TabsTrigger
              value="attendance"
              aria-label="Attendance Records"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Attendance Records</span>
            </TabsTrigger>
            <TabsTrigger
              value="leave"
              aria-label="Leave Records"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <Plane className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Leave Records</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="add" className="space-y-6">
            {activeTab === 'add' ? addEmployeeContent : null}
          </TabsContent>
          <TabsContent value="schedule" className="space-y-6">
            {activeTab === 'schedule' ? schedulePane : null}
          </TabsContent>
          <TabsContent value="attendance" className="space-y-6">
            {activeTab === 'attendance' ? <AttendanceAdmin /> : null}
          </TabsContent>
          <TabsContent value="leave" className="space-y-6">
            {activeTab === 'leave' ? <LeaveManagement /> : null}
          </TabsContent>
        </Tabs>
      ) : (
        schedulePane
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

      <AlertDialog
        open={archiveDialogOpen}
        onOpenChange={(open) => {
          setArchiveDialogOpen(open);
          if (!open) {
            setArchiveTarget(null);
            setArchivingEmployee(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <Archive className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Archive employee?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.name
                ? `Archive ${archiveTarget.name}?`
                : 'Archive this employee?'}{' '}
              They will be hidden from scheduling, but their profile and history
              stay available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel disabled={archivingEmployee}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-amber-500 text-white hover:bg-amber-500/90"
              disabled={archivingEmployee}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmArchiveEmployee();
              }}
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
              Archive employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
