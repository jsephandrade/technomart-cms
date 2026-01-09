import { useState, useEffect, useCallback, useRef } from 'react';
import { userService } from '@/api/services/userService';
import { toast } from 'sonner';

export const useUsers = (params = {}, options = {}) => {
  const { autoFetch = true, suppressErrorToast = false } = options || {};
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizeUserList = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    return [];
  };

  const paramsKey = JSON.stringify(params || {});
  const paramsRef = useRef(params || {});

  useEffect(() => {
    paramsRef.current = params || {};
  }, [paramsKey, params]);

  const fetchUsers = useCallback(
    async (override = null) => {
      try {
        setLoading(true);
        setError(null);
        const response = await userService.getUsers(
          override || paramsRef.current
        );
        setUsers(normalizeUserList(response));
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch users';
        setError(errorMessage);
        if (!suppressErrorToast) toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [paramsKey, suppressErrorToast]
  );

  const addUser = async (user) => {
    try {
      const payload = await userService.createUser(user);
      const newUser = payload?.data || payload;
      setUsers((prev) => [...prev, newUser]);
      toast.success('User added successfully');
      return newUser;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to add user';
      toast.error(errorMessage);
      throw err;
    }
  };

  const updateUser = async (id, updates) => {
    try {
      const payload = await userService.updateUser(id, updates);
      const updatedUser = payload?.data || payload;
      setUsers((prev) =>
        prev.map((user) => (user.id === id ? updatedUser : user))
      );
      toast.success('User updated successfully');
      return updatedUser;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update user';
      toast.error(errorMessage);
      throw err;
    }
  };

  const deleteUser = async (id) => {
    try {
      await userService.deleteUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
      toast.success('User deleted successfully');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(errorMessage);
      throw err;
    }
  };

  useEffect(() => {
    if (autoFetch) fetchUsers();
  }, [autoFetch, fetchUsers]);

  return {
    users,
    loading,
    error,
    addUser,
    updateUser,
    deleteUser,
    refetch: fetchUsers,
  };
};

export const useUserLogs = (params) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userService.getUserLogs(params);
      setLogs(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch activity logs';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs,
  };
};
