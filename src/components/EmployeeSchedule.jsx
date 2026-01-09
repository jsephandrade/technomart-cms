import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthContext';
import { useEmployees, useSchedule } from '@/hooks/useEmployees';
import { employeeService } from '@/api/services/employeeService';
import { useLocation, useNavigate } from 'react-router-dom';

import ManageEmployeesDialog from '@/components/employee-schedule/ManageEmployeesDialog';
import AddScheduleDialog from '@/components/employee-schedule/AddScheduleDialog';
import EditScheduleDialog from '@/components/employee-schedule/EditScheduleDialog';
import TeamCompositionCard from '@/components/employee-schedule/TeamCompositionCard';
import AttendanceAdmin from '@/components/AttendanceAdmin';
import LeaveManagement from '@/components/LeaveManagement';
import AttendanceTimeCard from '@/components/employee-schedule/AttendanceTimeCard';
import AddEmployeeTab from '@/components/employee-schedule/AddEmployeeTab';
import ScheduleTab from '@/components/employee-schedule/ScheduleTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Archive,
  CalendarDays,
  ClipboardList,
  Plane,
  RotateCcw,
  ShieldPlus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

const buildEmptyRoleTargets = (days = []) => {
  const targets = {};
  (days || []).forEach((day) => {
    if (!day) return;
    targets[day] = [];
  });
  return targets;
};

const normalizeRole = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const normalizeTargetsByDay = (targetsByDay = {}, days = []) => {
  const base = buildEmptyRoleTargets(days);
  const source =
    targetsByDay && typeof targetsByDay === 'object' ? targetsByDay : {};
  Object.keys(base).forEach((day) => {
    const entries = Array.isArray(source[day]) ? source[day] : [];
    base[day] = entries
      .map((entry) => ({
        id: entry?.id,
        role: String(entry?.role || '').trim(),
        target: Number(entry?.target || 0),
      }))
      .filter((entry) => entry.role);
  });
  return base;
};

const normalizeExceptionEntry = (entry) => {
  if (!entry) return null;
  const requestedAt = entry.requestedAt || entry.requested_at;
  const parsed =
    typeof requestedAt === 'number'
      ? requestedAt
      : Date.parse(requestedAt || '');
  return {
    id: entry.id,
    day: entry.day,
    role: entry.role,
    message: entry.message || '',
    requestedBy: entry.requestedBy || entry.requested_by || '',
    requestedAt: Number.isFinite(parsed) ? parsed : Date.now(),
  };
};

const extractTargetsByDay = (payload, days) => {
  if (payload?.targetsByDay && typeof payload.targetsByDay === 'object') {
    return payload.targetsByDay;
  }
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  if (!items.length) return {};
  const base = buildEmptyRoleTargets(days);
  items.forEach((entry) => {
    const day = entry?.day;
    if (!day || !base[day]) return;
    base[day].push({
      id: entry?.id,
      role: entry?.role,
      target: entry?.target,
    });
  });
  return base;
};

const EmployeeSchedule = () => {
  const { hasAnyRole, user } = useAuth();
  const canManage = hasAnyRole(['manager']);
  const isAdmin = hasAnyRole(['admin']);
  const isStaffOnly = hasAnyRole(['staff']) && !canManage;
  const allowAttendanceWithoutShift = isStaffOnly;
  const showCombinedAttendanceLeave = canManage && !isAdmin;
  const attendanceTabValue = showCombinedAttendanceLeave
    ? 'attendance-leave'
    : 'attendance';
  const attendanceTabLabel = showCombinedAttendanceLeave
    ? 'Attendance & Leave'
    : 'Attendance Records';
  const leaveTabLabel = isAdmin ? 'Leave Management' : 'Leave Records';
  const staffLeaveTabValue = 'leave-request';
  const tabsGridCols = showCombinedAttendanceLeave
    ? 'grid-cols-4'
    : 'grid-cols-5';
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

  const resolvedEmployeeId = useMemo(() => {
    if (!user) return null;
    if (user.employeeId) return String(user.employeeId);
    const email = (user.email || '').trim().toLowerCase();
    const name = (user.name || '').trim().toLowerCase();
    let match = null;
    if (email) {
      match =
        employees.find(
          (emp) => (emp?.contact || '').trim().toLowerCase() === email
        ) || null;
    }
    if (!match && name) {
      match =
        employees.find(
          (emp) => (emp?.name || '').trim().toLowerCase() === name
        ) || null;
    }
    return match?.id ? String(match.id) : null;
  }, [employees, user]);

  const attendanceUser = useMemo(() => {
    if (!user) return null;
    if (!resolvedEmployeeId || user.employeeId === resolvedEmployeeId) {
      return user;
    }
    return { ...user, employeeId: resolvedEmployeeId };
  }, [resolvedEmployeeId, user]);

  const displayEmployees = useMemo(
    () =>
      employees.filter(
        (emp) => emp && emp.status !== 'inactive' && emp.status !== 'pending'
      ),
    [employees]
  );
  const archivedEmployees = useMemo(() => {
    return employees
      .filter((emp) => emp && (emp.status || '').toLowerCase() === 'inactive')
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [employees]);

  const {
    schedule = [],
    addScheduleEntry,
    updateScheduleEntry,
    deleteScheduleEntry,
    clearScheduleEntries,
    loading: scheduleLoading,
    refetch: refetchSchedule,
  } = useSchedule({}, { autoFetch: true });

  const [roleTargetsByDay, setRoleTargetsByDay] = useState(() =>
    buildEmptyRoleTargets(DAYS_OF_WEEK)
  );
  const [roleTargetsLoading, setRoleTargetsLoading] = useState(false);
  const [roleExceptions, setRoleExceptions] = useState([]);

  const roleOptions = useMemo(() => {
    const unique = new Set();
    displayEmployees.forEach((employee) => {
      const role = String(employee?.position || '').trim();
      if (role) unique.add(role);
    });
    Object.values(roleTargetsByDay || {}).forEach((entries) => {
      (entries || []).forEach((entry) => {
        const role = String(entry?.role || '').trim();
        if (role) unique.add(role);
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [displayEmployees, roleTargetsByDay]);

  const employeeRoleMap = useMemo(() => {
    const map = new Map();
    displayEmployees.forEach((employee) => {
      if (!employee?.id) return;
      const roleLabel = String(employee?.position || '').trim() || 'Unassigned';
      const roleKey = normalizeRole(roleLabel) || 'unassigned';
      map.set(String(employee.id), { roleKey, roleLabel });
    });
    return map;
  }, [displayEmployees]);

  const roleLabelMap = useMemo(() => {
    const map = {};
    displayEmployees.forEach((employee) => {
      const label = String(employee?.position || '').trim();
      if (!label) return;
      map[normalizeRole(label)] = label;
    });
    Object.values(roleTargetsByDay || {}).forEach((entries) => {
      (entries || []).forEach((entry) => {
        const label = String(entry?.role || '').trim();
        if (!label) return;
        map[normalizeRole(label)] = label;
      });
    });
    return map;
  }, [displayEmployees, roleTargetsByDay]);

  const roleCountsByDay = useMemo(() => {
    const counts = {};
    (schedule || []).forEach((entry) => {
      const day = entry?.day;
      if (!day) return;
      const roleInfo = employeeRoleMap.get(String(entry.employeeId));
      const roleKey = roleInfo?.roleKey || 'unassigned';
      if (!counts[day]) counts[day] = {};
      counts[day][roleKey] = (counts[day][roleKey] || 0) + 1;
    });
    return counts;
  }, [schedule, employeeRoleMap]);

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
  const [roleExceptionDialog, setRoleExceptionDialog] = useState(null);
  const [roleExceptionReason, setRoleExceptionReason] = useState('');
  const [autoBuildDialogOpen, setAutoBuildDialogOpen] = useState(false);
  const [autoBuildBusy, setAutoBuildBusy] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archivingEmployee, setArchivingEmployee] = useState(false);
  const [archivedDialogOpen, setArchivedDialogOpen] = useState(false);
  const [restoringEmployeeId, setRestoringEmployeeId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const attendanceAutoOpenDismissed = useRef(false);

  const resolveRoleInfo = (employeeId) => {
    if (!employeeId) {
      return { roleKey: 'unassigned', roleLabel: 'Unassigned' };
    }
    const info = employeeRoleMap.get(String(employeeId));
    if (info) return info;
    return { roleKey: 'unassigned', roleLabel: 'Unassigned' };
  };

  const getRoleTarget = (day, roleKey) => {
    if (!day || !roleKey) return 0;
    const targets = Array.isArray(roleTargetsByDay?.[day])
      ? roleTargetsByDay[day]
      : [];
    const match = targets.find(
      (entry) => normalizeRole(entry?.role) === roleKey
    );
    return Number(match?.target || 0);
  };

  const getRoleCapacity = (employeeId, day, excludeScheduleId = null) => {
    const roleInfo = resolveRoleInfo(employeeId);
    const roleKey = roleInfo.roleKey || 'unassigned';
    const target = getRoleTarget(day, roleKey);
    let currentCount = roleCountsByDay?.[day]?.[roleKey] || 0;

    if (excludeScheduleId) {
      const existing = (schedule || []).find(
        (entry) => String(entry?.id) === String(excludeScheduleId)
      );
      if (existing && existing.day === day) {
        const existingRole = resolveRoleInfo(existing.employeeId);
        if (existingRole.roleKey === roleKey) {
          currentCount = Math.max(0, currentCount - 1);
        }
      }
    }

    const status =
      target <= 0 ? 'missing' : currentCount >= target ? 'full' : 'available';

    return {
      day,
      roleKey,
      roleLabel: roleInfo.roleLabel || roleKey,
      target,
      currentCount,
      status,
    };
  };

  const getRoleCapacityForRole = (day, roleKey) => {
    const target = getRoleTarget(day, roleKey);
    const currentCount = roleCountsByDay?.[day]?.[roleKey] || 0;
    const status =
      target <= 0 ? 'missing' : currentCount >= target ? 'full' : 'available';
    return {
      day,
      roleKey,
      roleLabel: roleLabelMap?.[roleKey] || roleKey || 'Unassigned',
      target,
      currentCount,
      status,
    };
  };

  const handleUpdateRoleTargets = async (day, targets) => {
    if (!canManage || !day) return;
    setRoleTargetsLoading(true);
    try {
      const res = await employeeService.updateRoleTargets({
        day,
        targets: Array.isArray(targets) ? targets : [],
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'Failed to update role targets');
      }
      const payload = res?.data || res || {};
      const normalized = normalizeTargetsByDay(
        extractTargetsByDay(payload, DAYS_OF_WEEK),
        DAYS_OF_WEEK
      );
      setRoleTargetsByDay(normalized);
      toast.success('Team composition updated');
    } catch (error) {
      console.error(error);
      toast.error('Unable to update team composition targets');
    } finally {
      setRoleTargetsLoading(false);
    }
  };

  const handleAddRoleException = async (payload) => {
    if (!canManage) return;
    try {
      const res = await employeeService.createRoleException({
        day: payload?.day || '',
        role: payload?.roleLabel || 'Role',
        message: payload?.message || '',
        requestedBy: payload?.requestedBy || '',
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'Failed to create exception');
      }
      const entry = normalizeExceptionEntry(res?.data || res);
      if (entry) {
        setRoleExceptions((prev) => [entry, ...(prev || [])]);
      }
      toast.success('Exception request submitted');
    } catch (error) {
      console.error(error);
      toast.error('Unable to submit exception request');
    }
  };

  const handleClearRoleException = async (id) => {
    if (!canManage || !id) return;
    try {
      const res = await employeeService.deleteRoleException(id);
      if (res?.success === false) {
        throw new Error(res?.message || 'Failed to clear exception');
      }
      setRoleExceptions((prev) =>
        (prev || []).filter((item) => String(item.id) !== String(id))
      );
    } catch (error) {
      console.error(error);
      toast.error('Unable to clear exception request');
    }
  };

  const handleClearAllRoleExceptions = async () => {
    if (!canManage) return;
    try {
      const res = await employeeService.clearRoleExceptions();
      if (res?.success === false) {
        throw new Error(res?.message || 'Failed to clear exceptions');
      }
      setRoleExceptions([]);
    } catch (error) {
      console.error(error);
      toast.error('Unable to clear exception requests');
    }
  };

  const openRoleExceptionDialog = (payload) => {
    setRoleExceptionDialog(payload || null);
    setRoleExceptionReason('');
  };

  const closeRoleExceptionDialog = () => {
    setRoleExceptionDialog(null);
    setRoleExceptionReason('');
  };

  const submitRoleException = async () => {
    if (!roleExceptionDialog) return;
    const reason = roleExceptionReason.trim();
    const baseMessage = roleExceptionDialog.message || '';
    const message = reason ? `${baseMessage} Reason: ${reason}` : baseMessage;
    await handleAddRoleException({
      day: roleExceptionDialog.day,
      roleLabel: roleExceptionDialog.roleLabel,
      message,
      requestedBy: user?.name || user?.email || 'Manager',
    });
    closeRoleExceptionDialog();
  };

  const handleQuickAdd = async () => {
    if (!canManage) return;
    if (!quickAdd.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (roleTargetsLoading) {
      toast.info('Loading team composition targets. Please try again.');
      return;
    }
    const roleLabel = String(quickAdd.position || '').trim();
    const roleKey = normalizeRole(roleLabel) || 'unassigned';
    const repeatDays =
      Array.isArray(quickAdd.repeatDays) && quickAdd.repeatDays.length
        ? Array.from(new Set(quickAdd.repeatDays))
        : [];
    if (repeatDays.length === 0) {
      toast.error('Select at least one day');
      return;
    }

    if (!roleLabel) {
      toast.error('Role is required to schedule under team composition rules');
      return;
    }

    const availableRepeatDays = repeatDays.filter((day) => {
      const status = getRoleCapacityForRole(day, roleKey)?.status || 'missing';
      return status !== 'full';
    });
    if (availableRepeatDays.length === 0) {
      toast.error(
        'The selected role has reached its capacity for the days you picked.'
      );
      return;
    }

    const capacityIssues = availableRepeatDays
      .map((day) => getRoleCapacityForRole(day, roleKey))
      .filter((issue) => issue.status !== 'available');
    if (capacityIssues.length) {
      const missingDays = capacityIssues
        .filter((issue) => issue.status === 'missing')
        .map((issue) => issue.day);
      const fullDays = capacityIssues
        .filter((issue) => issue.status === 'full')
        .map(
          (issue) =>
            `${issue.day} (${issue.currentCount}/${issue.target} ${roleLabel})`
        );
      const parts = [];
      if (missingDays.length) {
        parts.push(
          `No target set for ${roleLabel} on ${missingDays.join(', ')}`
        );
      }
      if (fullDays.length) {
        parts.push(`Role capacity reached on ${fullDays.join(', ')}`);
      }
      toast.error(`${parts.join('. ')}. Update team composition to proceed.`);
      return;
    }
    const scheduleEntries = availableRepeatDays.map((day) => ({
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

  const handleAutoBuildRoster = async () => {
    if (!canManage || autoBuildBusy) return;

    if (!autoBuildPlan.entries.length) {
      toast.info('No new shifts needed for the current targets.');
      setAutoBuildDialogOpen(false);
      return;
    }

    setAutoBuildBusy(true);
    try {
      await Promise.all(
        autoBuildPlan.entries.map((entry) =>
          addScheduleEntry(entry, { suppressToast: true })
        )
      );
      toast.success(
        `Added ${autoBuildPlan.entries.length} shift${
          autoBuildPlan.entries.length === 1 ? '' : 's'
        } from team composition targets.`
      );
    } catch (error) {
      console.error(error);
      toast.error('Failed to auto-build the roster.');
    } finally {
      setAutoBuildBusy(false);
      setAutoBuildDialogOpen(false);
    }
  };

  const hasShiftToday = useMemo(() => {
    // Check if user has a linked Employee record
    const userEmployeeId = resolvedEmployeeId || user?.employeeId || user?.id;
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
  }, [schedule, resolvedEmployeeId, user?.employeeId, user?.id]);

  const autoBuildPlan = useMemo(() => {
    const plan = { entries: [], shortfalls: [] };
    if (!canManage) return plan;

    const activeDays = DAYS_OF_WEEK.filter(
      (day) => String(day || '').toLowerCase() !== 'sunday'
    );

    const scheduledByDay = new Map();
    (schedule || []).forEach((entry) => {
      const day = entry?.day;
      if (!day || !entry?.employeeId) return;
      const key = String(entry.employeeId);
      if (!scheduledByDay.has(day)) {
        scheduledByDay.set(day, new Set());
      }
      scheduledByDay.get(day).add(key);
    });

    const employeesByRole = new Map();
    displayEmployees.forEach((employee) => {
      if (!employee?.id) return;
      const roleKey = normalizeRole(employee.position) || 'unassigned';
      if (!employeesByRole.has(roleKey)) {
        employeesByRole.set(roleKey, []);
      }
      employeesByRole.get(roleKey).push(employee);
    });

    employeesByRole.forEach((list) =>
      list.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
    );

    activeDays.forEach((day) => {
      const targets = Array.isArray(roleTargetsByDay?.[day])
        ? roleTargetsByDay[day]
        : [];
      targets.forEach((entry) => {
        const roleKey = normalizeRole(entry?.role);
        const target = Number(entry?.target || 0);
        if (!roleKey || target <= 0) return;
        const currentCount = roleCountsByDay?.[day]?.[roleKey] || 0;
        const needed = target - currentCount;
        if (needed <= 0) return;

        const available = employeesByRole.get(roleKey) || [];
        const daySet = scheduledByDay.get(day) || new Set();
        let added = 0;

        for (const employee of available) {
          if (added >= needed) break;
          const key = String(employee.id);
          if (daySet.has(key)) continue;
          daySet.add(key);
          scheduledByDay.set(day, daySet);
          plan.entries.push({
            employeeId: employee.id,
            employeeName: employee.name || '',
            day,
            startTime: DEFAULT_SCHEDULE_ENTRY.startTime,
            endTime: DEFAULT_SCHEDULE_ENTRY.endTime,
          });
          added += 1;
        }

        if (added < needed) {
          plan.shortfalls.push({
            day,
            role: entry.role || roleLabelMap?.[roleKey] || roleKey,
            missing: needed - added,
          });
        }
      });
    });

    return plan;
  }, [
    canManage,
    displayEmployees,
    roleCountsByDay,
    roleLabelMap,
    roleTargetsByDay,
    schedule,
  ]);

  const newScheduleCapacity = useMemo(() => {
    if (!newScheduleEntry.employeeId || !newScheduleEntry.day) return null;
    return getRoleCapacity(newScheduleEntry.employeeId, newScheduleEntry.day);
  }, [getRoleCapacity, newScheduleEntry]);

  const editScheduleCapacity = useMemo(() => {
    if (!editingSchedule?.employeeId || !editingSchedule?.day) return null;
    return getRoleCapacity(
      editingSchedule.employeeId,
      editingSchedule.day,
      editingSchedule.id
    );
  }, [editingSchedule, getRoleCapacity]);

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
    if (archivedDialogOpen) {
      setArchivedDialogOpen(false);
      setRestoringEmployeeId(null);
    }
    if (deleteDialogOpen) {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeletingEmployee(false);
    }
  }, [
    canManage,
    dialogOpen,
    editingSchedule,
    employeeDialogOpen,
    archiveDialogOpen,
    archivedDialogOpen,
    deleteDialogOpen,
  ]);

  useEffect(() => {
    if (!canManage) return;
    let active = true;

    const loadTargets = async () => {
      setRoleTargetsLoading(true);
      try {
        const res = await employeeService.getRoleTargets();
        if (!active) return;
        if (res?.success === false) {
          throw new Error(res?.message || 'Failed to load role targets');
        }
        const payload = res?.data || res || {};
        const normalized = normalizeTargetsByDay(
          extractTargetsByDay(payload, DAYS_OF_WEEK),
          DAYS_OF_WEEK
        );
        setRoleTargetsByDay(normalized);
      } catch (error) {
        if (!active) return;
        console.error(error);
        toast.error('Unable to load team composition targets');
      } finally {
        if (active) setRoleTargetsLoading(false);
      }
    };

    loadTargets();
    return () => {
      active = false;
    };
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    let active = true;

    const loadExceptions = async () => {
      try {
        const res = await employeeService.getRoleExceptions();
        if (!active) return;
        if (res?.success === false) {
          throw new Error(res?.message || 'Failed to load exceptions');
        }
        const items = res?.data || res || [];
        const list = Array.isArray(items) ? items : items.items || [];
        const normalized = list
          .map((entry) => normalizeExceptionEntry(entry))
          .filter(Boolean);
        setRoleExceptions(normalized);
      } catch (error) {
        if (!active) return;
        console.error(error);
        toast.error('Unable to load exception requests');
      } finally {
        // no-op
      }
    };

    loadExceptions();
    return () => {
      active = false;
    };
  }, [canManage]);

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

    if (!hasShiftToday && !allowAttendanceWithoutShift) {
      clearAttendanceIndicators();
      return;
    }

    if (!attendanceDialogOpen) {
      setAttendanceDialogOpen(true);
    }

    clearAttendanceIndicators();
  }, [
    attendanceDialogOpen,
    allowAttendanceWithoutShift,
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

    if (!hasShiftToday && !allowAttendanceWithoutShift) {
      clearPopupState();
      return;
    }

    if (!attendanceDialogOpen) {
      setAttendanceDialogOpen(true);
    }

    clearPopupState();
  }, [
    attendanceDialogOpen,
    allowAttendanceWithoutShift,
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

    if (scheduleLoading) return;
    if (!hasShiftToday && !allowAttendanceWithoutShift) return;
    if (attendanceDialogOpen || attendanceAutoOpenDismissed.current) return;

    attendanceAutoOpenDismissed.current = true;
    setAttendanceDialogOpen(true);
  }, [
    attendanceDialogOpen,
    allowAttendanceWithoutShift,
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

    if (roleTargetsLoading) {
      toast.info('Loading team composition targets. Please try again.');
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

    const capacity = getRoleCapacity(employeeId, day);
    if (capacity.status !== 'available') {
      const employeeName = lookupEmployeeName(employeeId);
      const message =
        capacity.status === 'missing'
          ? `${employeeName} needs a ${capacity.roleLabel} target set for ${day}.`
          : `${employeeName} exceeds the ${capacity.roleLabel} target (${capacity.currentCount}/${capacity.target}) on ${day}.`;
      toast.warning(
        'Role capacity reached. Update targets or request an exception.'
      );
      openRoleExceptionDialog({
        day,
        roleLabel: capacity.roleLabel,
        currentCount: capacity.currentCount,
        target: capacity.target,
        employeeName,
        message,
      });
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

    if (roleTargetsLoading) {
      toast.info('Loading team composition targets. Please try again.');
      return;
    }

    const capacity = getRoleCapacity(
      editingSchedule.employeeId,
      editingSchedule.day,
      editingSchedule.id
    );
    if (capacity.status !== 'available') {
      const employeeName = lookupEmployeeName(editingSchedule.employeeId);
      const message =
        capacity.status === 'missing'
          ? `${employeeName} needs a ${capacity.roleLabel} target set for ${editingSchedule.day}.`
          : `${employeeName} exceeds the ${capacity.roleLabel} target (${capacity.currentCount}/${capacity.target}) on ${editingSchedule.day}.`;
      toast.warning(
        'Role capacity reached. Update targets or request an exception.'
      );
      openRoleExceptionDialog({
        day: editingSchedule.day,
        roleLabel: capacity.roleLabel,
        currentCount: capacity.currentCount,
        target: capacity.target,
        employeeName,
        message,
      });
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

  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState(null);
  const [scheduleDeleteDialogOpen, setScheduleDeleteDialogOpen] =
    useState(false);
  const [editDayDialogOpen, setEditDayDialogOpen] = useState(false);
  const [editDay, setEditDay] = useState('Monday');
  const [editDayStartTime, setEditDayStartTime] = useState('08:00');
  const [editDayEndTime, setEditDayEndTime] = useState('16:00');
  const [editDayBusy, setEditDayBusy] = useState(false);
  const [scheduleClearDialogOpen, setScheduleClearDialogOpen] = useState(false);

  const handleDeleteSchedule = (entryOrId) => {
    if (!canManage) return;
    setScheduleDeleteTarget(entryOrId);
    setScheduleDeleteDialogOpen(true);
  };

  const performDeleteSchedule = async () => {
    if (!canManage || !scheduleDeleteTarget) return;
    try {
      await deleteScheduleEntry(scheduleDeleteTarget);
    } catch {
      // Errors shown by hook.
    } finally {
      setScheduleDeleteDialogOpen(false);
      setScheduleDeleteTarget(null);
    }
  };

  const handleOpenEditDaySchedule = () => {
    if (!canManage) return;
    setEditDayDialogOpen(true);
  };

  const performEditDaySchedule = async () => {
    if (!canManage) return;
    const startMinutes = toMinutes(editDayStartTime);
    const endMinutes = toMinutes(editDayEndTime);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      toast.error('Invalid time values');
      return;
    }
    if (endMinutes <= startMinutes) {
      toast.error('End time must be after start time');
      return;
    }
    const entries = (schedule || []).filter(
      (entry) => String(entry?.day) === String(editDay)
    );
    if (!entries.length) {
      toast.info('No shifts found for the selected day');
      setEditDayDialogOpen(false);
      return;
    }

    setEditDayBusy(true);
    try {
      await Promise.all(
        entries.map((entry) =>
          updateScheduleEntry(entry.id, {
            startTime: editDayStartTime,
            endTime: editDayEndTime,
          })
        )
      );
      toast.success(`Updated ${entries.length} shift(s) on ${editDay}`);
      setEditDayDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update shifts');
    } finally {
      setEditDayBusy(false);
    }
  };

  const handleClearAllSchedules = () => {
    if (!canManage) return;
    setScheduleClearDialogOpen(true);
  };

  const performClearAllSchedules = async () => {
    try {
      await clearScheduleEntries();
    } catch {
      // toast from hook
    } finally {
      setScheduleClearDialogOpen(false);
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

  const handleOpenArchivedEmployees = () => {
    if (!canManage) return;
    setArchivedDialogOpen(true);
  };

  const handleRestoreEmployee = async (employee) => {
    if (!canManage || !employee?.id || restoringEmployeeId) return;
    setRestoringEmployeeId(employee.id);
    try {
      await updateEmployee(employee.id, { status: 'active' });
      await Promise.all([refetchEmployees(), refetchSchedule()]);
      toast.success('Employee restored');
    } catch (error) {
      console.error(error);
      toast.error('Failed to restore employee');
    } finally {
      setRestoringEmployeeId(null);
    }
  };

  const handleDeleteEmployeeRequest = (employee) => {
    if (!canManage || !employee?.id) return;
    setDeleteTarget(employee);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!canManage || !deleteTarget?.id || deletingEmployee) return;
    setDeletingEmployee(true);
    try {
      await deleteEmployee(deleteTarget.id);
      await refetchSchedule();
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingEmployee(false);
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
      archivedEmployees={archivedEmployees}
      onManageEmployee={handleManageEmployeeClick}
      onArchiveEmployee={handleArchiveEmployeeRequest}
      onOpenManageEmployees={handleOpenManageEmployees}
      onOpenArchivedEmployees={handleOpenArchivedEmployees}
      getRoleCapacityForRole={getRoleCapacityForRole}
    />
  );

  const teamCompositionPane = canManage ? (
    <div className="space-y-6">
      <TeamCompositionCard
        daysOfWeek={DAYS_OF_WEEK}
        targetsByDay={roleTargetsByDay}
        countsByDay={roleCountsByDay}
        roleLabelMap={roleLabelMap}
        roleOptions={roleOptions}
        canManage={canManage}
        onUpdateTargets={handleUpdateRoleTargets}
        onAutoBuildRoster={() => setAutoBuildDialogOpen(true)}
        autoBuildBusy={autoBuildBusy || roleTargetsLoading}
        exceptionRequests={roleExceptions}
        onClearException={handleClearRoleException}
        onClearAllExceptions={handleClearAllRoleExceptions}
      />
    </div>
  ) : null;

  const schedulePane = (
    <div className="space-y-6">
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
        onOpenManageEmployees={handleOpenManageEmployees}
        onOpenAddSchedule={() => {
          if (!canManage) return;
          setNewScheduleEntry({ ...DEFAULT_SCHEDULE_ENTRY });
          handleScheduleDialogOpenChange(true);
        }}
        onClearAllSchedules={handleClearAllSchedules}
        onEditDaySchedule={handleOpenEditDaySchedule}
      />
    </div>
  );

  const leaveRequestPanel =
    attendanceUser && !isAdmin ? <LeaveManagement /> : null;

  return (
    <div className="space-y-6">
      {canManage ? (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-6"
        >
          <TabsList
            className={`w-full grid ${tabsGridCols} gap-2 bg-muted/40 p-1 rounded-lg`}
          >
            <TabsTrigger
              value="team-composition"
              aria-label="Team Composition"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Team Composition</span>
            </TabsTrigger>
            <TabsTrigger
              value="add"
              aria-label="Add Employee and Schedule"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Add Employee & Sched</span>
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
              value={attendanceTabValue}
              aria-label={attendanceTabLabel}
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">{attendanceTabLabel}</span>
            </TabsTrigger>
            {isAdmin ? (
              <TabsTrigger
                value="leave"
                aria-label={leaveTabLabel}
                className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
              >
                <Plane className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">{leaveTabLabel}</span>
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="team-composition" className="space-y-6">
            {activeTab === 'team-composition' ? teamCompositionPane : null}
          </TabsContent>
          <TabsContent value="add" className="space-y-6">
            {activeTab === 'add' ? addEmployeeContent : null}
          </TabsContent>
          <TabsContent value="schedule" className="space-y-6">
            {activeTab === 'schedule' ? schedulePane : null}
          </TabsContent>
          <TabsContent value={attendanceTabValue} className="space-y-6">
            {activeTab === attendanceTabValue ? (
              showCombinedAttendanceLeave ? (
                <div className="space-y-6">
                  <AttendanceAdmin />
                  {leaveRequestPanel}
                </div>
              ) : (
                <AttendanceAdmin />
              )
            ) : null}
          </TabsContent>
          {isAdmin ? (
            <TabsContent value="leave" className="space-y-6">
              {activeTab === 'leave' ? <LeaveManagement /> : null}
            </TabsContent>
          ) : null}
        </Tabs>
      ) : isStaffOnly ? (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-6"
        >
          <TabsList className="w-full grid grid-cols-2 gap-2 bg-muted/40 p-1 rounded-lg">
            <TabsTrigger
              value="schedule"
              aria-label="Weekly Schedule"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Weekly Schedule</span>
            </TabsTrigger>
            <TabsTrigger
              value={staffLeaveTabValue}
              aria-label="Leave Request"
              className="flex min-w-0 items-center justify-center gap-2 px-0 py-2 rounded-md"
            >
              <Plane className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Leave Request</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="schedule" className="space-y-6">
            {activeTab === 'schedule' ? schedulePane : null}
          </TabsContent>
          <TabsContent value={staffLeaveTabValue} className="space-y-6">
            {activeTab === staffLeaveTabValue ? leaveRequestPanel : null}
          </TabsContent>
        </Tabs>
      ) : (
        <>
          {schedulePane}
          {leaveRequestPanel}
        </>
      )}

      <EditScheduleDialog
        editingSchedule={editingSchedule}
        setEditingSchedule={setEditingSchedule}
        daysOfWeek={DAYS_OF_WEEK}
        employeeList={displayEmployees}
        capacityStatus={editScheduleCapacity}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Archive className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Archive employee?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.name
                ? `Archive ${archiveTarget.name}?`
                : 'Archive this employee?'}{' '}
              They will be hidden from scheduling, but their profile and history
              stay available. You can restore them from Archived employees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel disabled={archivingEmployee}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
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

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTarget(null);
            setDeletingEmployee(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Permanently delete employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name || 'this employee'}
              </span>{' '}
              from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel disabled={deletingEmployee}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingEmployee}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDeleteEmployee();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={scheduleDeleteDialogOpen}
        onOpenChange={(open) => {
          setScheduleDeleteDialogOpen(open);
          if (!open) {
            setScheduleDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Delete schedule entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing this shift will delete it from the roster. Confirm to
              remove the assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                performDeleteSchedule();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={scheduleClearDialogOpen}
        onOpenChange={(open) => {
          setScheduleClearDialogOpen(open);
        }}
      >
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Delete all shifts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every schedule entry for the week. Confirm only
              if you are sure you want to start over.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                performClearAllSchedules();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete all shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editDayDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditDayDialogOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit daily shift time</DialogTitle>
            <DialogDescription>
              Set a uniform start/end time for every shift in a single day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-day" className="text-right">
                Day
              </Label>
              <Select
                value={editDay}
                onValueChange={(value) => setEditDay(value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a day" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-start" className="text-right">
                Start time
              </Label>
              <Input
                id="edit-start"
                type="time"
                value={editDayStartTime}
                onChange={(event) => setEditDayStartTime(event.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-end" className="text-right">
                End time
              </Label>
              <Input
                id="edit-end"
                type="time"
                value={editDayEndTime}
                onChange={(event) => setEditDayEndTime(event.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setEditDayDialogOpen(false)}
              disabled={editDayBusy}
            >
              Cancel
            </Button>
            <Button onClick={performEditDaySchedule} disabled={editDayBusy}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={autoBuildDialogOpen}
        onOpenChange={(open) => {
          if (!open) setAutoBuildDialogOpen(false);
          else setAutoBuildDialogOpen(true);
        }}
      >
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Auto-build roster?</AlertDialogTitle>
            <AlertDialogDescription>
              The system will assign available teammates to meet the daily role
              targets. Existing shifts will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              {autoBuildPlan.entries.length
                ? `${autoBuildPlan.entries.length} shift${
                    autoBuildPlan.entries.length === 1 ? '' : 's'
                  } will be created.`
                : 'No new shifts are needed to meet current targets.'}
            </p>
            {autoBuildPlan.shortfalls.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900">
                <p className="font-semibold">Unfilled targets</p>
                <ul className="mt-2 space-y-1">
                  {autoBuildPlan.shortfalls.map((shortfall, index) => (
                    <li key={`${shortfall.day}-${shortfall.role}-${index}`}>
                      {shortfall.day}: {shortfall.role} missing{' '}
                      {shortfall.missing}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-3">
            <AlertDialogCancel disabled={autoBuildBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
              disabled={autoBuildBusy || autoBuildPlan.entries.length === 0}
              onClick={(event) => {
                event.preventDefault();
                handleAutoBuildRoster();
              }}
            >
              Auto-build roster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={archivedDialogOpen}
        onOpenChange={(open) => {
          setArchivedDialogOpen(open);
          if (!open) {
            setRestoringEmployeeId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Archive className="h-4 w-4" aria-hidden="true" />
            </div>
            <DialogTitle>Archived employees</DialogTitle>
            <DialogDescription>
              Archived team members are hidden from scheduling. Restore them
              anytime.
            </DialogDescription>
          </DialogHeader>
          {archivedEmployees.length ? (
            <div className="space-y-2">
              {archivedEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {employee.name || 'Unnamed employee'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {employee.position || 'No role'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => handleRestoreEmployee(employee)}
                      disabled={
                        restoringEmployeeId === employee.id ||
                        (deleteTarget?.id === employee.id && deletingEmployee)
                      }
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Restore
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteEmployeeRequest(employee)}
                      disabled={
                        deleteTarget?.id === employee.id && deletingEmployee
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Delete employee</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              No archived employees yet.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddScheduleDialog
        open={dialogOpen}
        onOpenChange={handleScheduleDialogOpenChange}
        newScheduleEntry={newScheduleEntry}
        setNewScheduleEntry={setNewScheduleEntry}
        employeeList={displayEmployees}
        daysOfWeek={DAYS_OF_WEEK}
        onAddSchedule={handleAddSchedule}
        capacityStatus={newScheduleCapacity}
        showTrigger={false}
      />

      <Dialog
        open={Boolean(roleExceptionDialog)}
        onOpenChange={(open) => {
          if (!open) closeRoleExceptionDialog();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Request a role exception</DialogTitle>
            <DialogDescription>
              Daily team composition limits prevent duplicate roles. Add a note
              to request an exception.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                {roleExceptionDialog?.day} - {roleExceptionDialog?.roleLabel}
              </p>
              <p>
                {roleExceptionDialog?.currentCount ?? 0} /
                {roleExceptionDialog?.target ?? 0} currently scheduled
              </p>
              {roleExceptionDialog?.employeeName ? (
                <p className="text-xs text-muted-foreground">
                  Requested for {roleExceptionDialog.employeeName}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-exception-reason">
                Exception reason (optional)
              </Label>
              <Textarea
                id="role-exception-reason"
                value={roleExceptionReason}
                onChange={(event) => setRoleExceptionReason(event.target.value)}
                placeholder="Explain why this role needs an exception for the day."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRoleExceptionDialog}>
              Cancel
            </Button>
            <Button onClick={submitRoleException}>Request exception</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {attendanceUser && (
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
            <AttendanceTimeCard user={attendanceUser} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EmployeeSchedule;
