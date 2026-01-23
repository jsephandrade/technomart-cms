import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { calendarService } from '@/api/services/calendarService';

export const useCalendarExceptions = (initialParams = {}, options = {}) => {
  const { autoFetch = true } = options || {};
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(Boolean(autoFetch));
  const [error, setError] = useState(null);
  const [params, setParams] = useState(initialParams || {});

  const fetchExceptions = useCallback(
    async (override = null) => {
      try {
        setLoading(true);
        setError(null);
        const data = await calendarService.getExceptions(override || params);
        setExceptions(data || []);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to load calendar exceptions';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  const createException = async (payload) => {
    try {
      const created = await calendarService.createException(payload);
      await fetchExceptions();
      toast.success('Calendar exception added');
      return created;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to add exception';
      toast.error(errorMessage);
      throw err;
    }
  };

  const deleteException = async (id) => {
    try {
      await calendarService.deleteException(id);
      await fetchExceptions();
      toast.success('Calendar exception removed');
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove exception';
      toast.error(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    if (autoFetch) fetchExceptions();
  }, [autoFetch, fetchExceptions]);

  return {
    exceptions,
    loading,
    error,
    fetchExceptions,
    createException,
    deleteException,
    params,
    setParams,
  };
};
