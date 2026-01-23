import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import dashboardService from '@/api/services/dashboardService';

export const useDashboard = (timeRange = 'today', options = {}) => {
  const enabled =
    options?.enabled !== undefined ? Boolean(options.enabled) : true;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const fetchDashboardStats = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await dashboardService.getDashboardStats(timeRange);

      if (response.success) {
        setStats(response.data);
      } else {
        throw new Error('Failed to fetch dashboard stats');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Dashboard', {
        description: 'Failed to load dashboard statistics. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [timeRange, enabled]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const refetch = () => {
    fetchDashboardStats();
  };

  return {
    stats,
    loading,
    error,
    refetch,
  };
};

export const useSalesData = (params = {}) => {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSalesData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dashboardService.getSalesData(params);

      if (response.success) {
        setSalesData(response.data);
      } else {
        throw new Error('Failed to fetch sales data');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Sales Data', {
        description: 'Failed to load sales data. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  const refetch = () => {
    fetchSalesData();
  };

  return {
    salesData,
    loading,
    error,
    refetch,
    fetchSalesData,
  };
};

export const useRecentActivity = (limit = 10) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecentActivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dashboardService.getRecentActivity(limit);

      if (response.success) {
        setActivities(response.data);
      } else {
        throw new Error('Failed to fetch recent activity');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Activity', {
        description: 'Failed to load recent activity. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchRecentActivity();
  }, [fetchRecentActivity]);

  const refetch = () => {
    fetchRecentActivity();
  };

  return {
    activities,
    loading,
    error,
    refetch,
  };
};

export const usePopularItems = (timeRange = 'week') => {
  const [popularItems, setPopularItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPopularItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await dashboardService.getPopularItems(timeRange);

      if (response.success) {
        setPopularItems(response.data);
      } else {
        throw new Error('Failed to fetch popular items');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Popular Items', {
        description: 'Failed to load popular items. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchPopularItems();
  }, [fetchPopularItems]);

  const refetch = () => {
    fetchPopularItems();
  };

  return {
    popularItems,
    loading,
    error,
    refetch,
  };
};

export default useDashboard;
