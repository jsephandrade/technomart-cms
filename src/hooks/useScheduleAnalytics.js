import { useState, useEffect, useCallback } from 'react';
import { employeeService } from '@/api/services/employeeService';
import { toast } from 'sonner';

export const useScheduleAnalytics = () => {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await employeeService.getScheduleAnalytics();
      setSchedule(data || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to fetch schedule analytics';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  return {
    schedule,
    loading,
    error,
    refetch: fetchSchedule,
  };
};
