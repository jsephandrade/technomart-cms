import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import verificationService from '@/api/services/verificationService';

export const useVerificationQueue = (params = {}) => {
  const queryClient = useQueryClient();
  const qp = {
    status: 'pending',
    page: 1,
    limit: 10,
    search: '',
    ...(params || {}),
  };
  const enabled =
    params?.enabled !== undefined ? Boolean(params.enabled) : true;

  const query = useQuery({
    queryKey: ['verify-requests', qp],
    queryFn: async () => {
      try {
        const res = await verificationService.list(qp);
        if (!res?.success)
          throw new Error(
            res?.message || 'Failed to load verification requests'
          );
        return res;
      } catch (err) {
        throw new Error(err?.message || 'Failed to load verification requests');
      }
    },
    enabled,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['verify-requests'] });
  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['users'] });
  const broadcastUsersUpdated = (detail) => {
    try {
      window?.dispatchEvent?.(
        new CustomEvent('users.updated', { detail: detail || null })
      );
    } catch {}
  };

  const approve = useMutation({
    mutationFn: ({ requestId, role, note }) =>
      verificationService.approve({ requestId, role, note }),
    onSuccess: () => {
      invalidate();
      refreshUsers();
      broadcastUsersUpdated({ type: 'approve' });
      toast.success('Approved', {
        description: 'Access granted.',
      });
    },
    onError: (err) => {
      toast.error('Approval failed', {
        description: err?.message || 'Unable to approve',
      });
    },
  });

  const reject = useMutation({
    mutationFn: ({ requestId, note }) =>
      verificationService.reject({ requestId, note }),
    onSuccess: () => {
      invalidate();
      toast('Rejected', {
        description: 'Request has been rejected.',
      });
    },
    onError: (err) => {
      toast.error('Rejection failed', {
        description: err?.message || 'Unable to reject',
      });
    },
  });

  return {
    requests: query.data?.data || [],
    pagination: query.data?.pagination || {
      page: qp.page,
      limit: qp.limit,
      total: 0,
      totalPages: 0,
    },
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error?.message || null,
    refetch: query.refetch,
    approve,
    reject,
  };
};

export default useVerificationQueue;
