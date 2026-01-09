import { useState, useEffect, useCallback } from 'react';
import { employeeService } from '@/api/services/employeeService';
import { toast } from 'sonner';

export const useEmployees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await employeeService.getAllEmployees({ limit: 500 });
      setEmployees(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch employees';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEmployee = async (id, updates) => {
    try {
      const updatedEmployee = await employeeService.updateEmployee(id, updates);
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === id ? updatedEmployee : emp))
      );
      toast.success('Employee updated successfully');
      await fetchEmployees();
      return updatedEmployee;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update employee';
      toast.error(errorMessage);
      throw err;
    }
  };

  const deleteEmployee = async (id) => {
    try {
      await employeeService.deleteEmployee(id);
      setEmployees((prev) => prev.filter((emp) => emp.id !== id));
      toast.success('Employee deleted successfully');
      await fetchEmployees();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete employee';
      toast.error(errorMessage);
      throw err;
    }
  };

  const addEmployeeWithSchedule = async (payload) => {
    try {
      const res = await employeeService.createEmployeeWithSchedule(payload);
      toast.success('Employee and schedule added successfully');
      await fetchEmployees();
      return res;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to add employee';
      toast.error(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees,
    loading,
    error,
    addEmployeeWithSchedule,
    updateEmployee,
    deleteEmployee,
    refetch: fetchEmployees,
  };
};

export const useSchedule = (initialParams = {}, options = {}) => {
  const { autoFetch = true, suppressErrorToast = false } = options || {};
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(Boolean(autoFetch));
  const [error, setError] = useState(null);
  const [params, setParams] = useState(initialParams || {});

  const fetchSchedule = useCallback(
    async (override = null) => {
      try {
        setLoading(true);
        setError(null);
        const data = await employeeService.getSchedule(override || params);
        setSchedule(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch schedule';
        setError(errorMessage);
        if (!suppressErrorToast) toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [params, suppressErrorToast]
  );

  const updateScheduleEntry = async (id, updates) => {
    try {
      const updatedEntry = await employeeService.updateSchedule(id, updates);
      setSchedule((prev) =>
        prev.map((entry) => (entry.id === id ? updatedEntry : entry))
      );
      toast.success('Schedule updated successfully');
      return updatedEntry;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update schedule';
      toast.error(errorMessage);
      throw err;
    }
  };

  const addScheduleEntry = async (entry, options = {}) => {
    const { suppressToast = false } = options || {};
    try {
      const created = await employeeService.createSchedule(entry);
      setSchedule((prev) => [...prev, created]);
      if (!suppressToast) {
        toast.success('Schedule added successfully');
      }
      return created;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to add schedule';
      toast.error(errorMessage);
      throw err;
    }
  };

  const isUuidLike = (value) => {
    if (!value) return false;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return false;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hexPattern = /^[0-9a-f]{32}$/i;
    return uuidPattern.test(raw) || hexPattern.test(raw);
  };

  const deleteScheduleEntry = async (entryOrId) => {
    const entry = entryOrId && typeof entryOrId === 'object' ? entryOrId : null;
    const scheduleId = entry ? entry.id : entryOrId;
    try {
      if (scheduleId && isUuidLike(scheduleId)) {
        await employeeService.deleteSchedule(scheduleId);
        setSchedule((prev) => prev.filter((s) => s.id !== scheduleId));
        toast.success('Schedule deleted successfully');
        return;
      }

      if (
        entry?.employeeId &&
        entry?.day &&
        entry?.startTime &&
        entry?.endTime
      ) {
        await employeeService.deleteScheduleByMeta({
          employeeId: entry.employeeId,
          day: entry.day,
          startTime: entry.startTime,
          endTime: entry.endTime,
        });
        setSchedule((prev) =>
          prev.filter(
            (s) =>
              !(
                String(s.employeeId) === String(entry.employeeId) &&
                s.day === entry.day &&
                s.startTime === entry.startTime &&
                s.endTime === entry.endTime
              )
          )
        );
        toast.success('Schedule deleted successfully');
        return;
      }

      throw new Error('Missing schedule identifier');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete schedule';
      toast.error(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    if (autoFetch) fetchSchedule();
  }, [autoFetch, fetchSchedule]);

  return {
    schedule,
    loading,
    error,
    updateScheduleEntry,
    addScheduleEntry,
    deleteScheduleEntry,
    params,
    setParams,
    refetch: fetchSchedule,
  };
};
