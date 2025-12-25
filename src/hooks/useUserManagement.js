import { toast } from 'sonner';
import userService from '@/api/services/userService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Normalize params to stable queryKey
const normalizeParams = (params) => {
  const def = {
    page: 1,
    limit: 20,
    search: '',
    role: '',
    status: '',
    sortBy: 'name',
    sortDir: 'asc',
  };
  return { ...def, ...(params || {}) };
};

export const useUserManagement = (params = {}) => {
  const queryClient = useQueryClient();
  const qp = normalizeParams(params);

  const usersQuery = useQuery({
    queryKey: ['users', qp],
    queryFn: async () => {
      const res = await userService.getUsers(qp);
      if (!res?.success) throw new Error('Failed to load users');
      return res; // { success, data, pagination }
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['users'] });
  const broadcastUsersUpdated = (detail) => {
    try {
      window?.dispatchEvent?.(
        new CustomEvent('users.updated', { detail: detail || null })
      );
    } catch {}
  };

  const createUser = useMutation({
    mutationFn: (userData) => userService.createUser(userData),
    onSuccess: () => {
      invalidateUsers();
      broadcastUsersUpdated({ type: 'create' });
      toast.success('User Created', {
        description: 'User added successfully.',
      });
    },
    onError: (err) => {
      toast.error('Error Creating User', {
        description: err?.message || 'Failed to create user',
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ userId, updates }) =>
      userService.updateUser(userId, updates),
    onSuccess: () => {
      invalidateUsers();
      broadcastUsersUpdated({ type: 'update' });
      toast.success('User Updated', {
        description: 'User information has been updated.',
      });
    },
    onError: (err) => {
      toast.error('Error Updating User', {
        description: err?.message || 'Failed to update user',
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (userId) => userService.deleteUser(userId),
    onSuccess: () => {
      invalidateUsers();
      broadcastUsersUpdated({ type: 'delete' });
      toast.success('User Deleted', {
        description: 'User removed from the system.',
      });
    },
    onError: (err) => {
      toast.error('Error Deleting User', {
        description: err?.message || 'Failed to delete user',
      });
    },
  });

  const updateUserStatus = useMutation({
    mutationFn: ({ userId, status }) =>
      userService.updateUserStatus(userId, status),
    onSuccess: (_, variables) => {
      invalidateUsers();
      broadcastUsersUpdated({
        type: 'status',
        userId: variables.userId,
        status: variables.status,
      });
      const label = variables.status === 'active' ? 'Activated' : 'Deactivated';
      toast.success(`User ${label}`, {
        description: `User status updated to ${variables.status}.`,
      });
    },
    onError: (err) => {
      toast.error('Error Updating Status', {
        description: err?.message || 'Failed to update status',
      });
    },
  });

  const updateUserRole = useMutation({
    mutationFn: ({ userId, role }) => userService.updateUserRole(userId, role),
    onSuccess: () => {
      invalidateUsers();
      broadcastUsersUpdated({ type: 'role' });
      toast.success('Role Updated', {
        description: 'User role has been updated.',
      });
    },
    onError: (err) => {
      toast.error('Error Updating Role', {
        description: err?.message || 'Failed to update role',
      });
    },
  });

  return {
    users: usersQuery.data?.data || [],
    pagination: usersQuery.data?.pagination || {
      page: qp.page,
      limit: qp.limit,
      total: 0,
      totalPages: 0,
    },
    loading: usersQuery.isLoading,
    fetching: usersQuery.isFetching,
    error: usersQuery.error?.message || null,
    refetch: usersQuery.refetch,
    createUser,
    updateUser,
    deleteUser,
    updateUserStatus,
    updateUserRole,
  };
};

export const useRoles = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await userService.getRoles();
      if (!res?.success) throw new Error('Failed to load roles');
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const updateRoleConfig = useMutation({
    mutationFn: (roleConfig) => userService.updateRoleConfig(roleConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role Updated', {
        description: 'Role configuration has been saved.',
      });
    },
    onError: (err) => {
      toast.error('Error Updating Role', {
        description: err?.message || 'Failed to update role configuration',
      });
    },
  });

  if (query.error) {
    toast.error('Error Loading Roles', {
      description: query.error.message,
    });
  }

  return {
    roles: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    updateRoleConfig,
  };
};

export default useUserManagement;
