import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import analyticsService from '@/api/services/analyticsService';
import { subscribeInventoryMutations } from '@/lib/inventoryMutations';

/**
 * Hook for fetching sales report data
 */
export const useSalesReport = (range = '7d') => {
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSalesReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await analyticsService.getSalesReport(range);

      if (response.success) {
        setSalesData(response.data);
      } else {
        throw new Error('Failed to fetch sales report');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Sales Report', {
        description: 'Failed to load sales report. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchSalesReport();
  }, [fetchSalesReport]);

  const refetch = () => {
    fetchSalesReport();
  };

  return {
    salesData,
    loading,
    error,
    refetch,
  };
};

/**
 * Hook for fetching inventory report data
 */
export const useInventoryReport = () => {
  const [inventoryData, setInventoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isFetchingRef = useRef(false);
  const pendingRefetchRef = useRef(null);
  const lastFetchCompletedRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const fetchInventoryReport = useCallback(async (options = {}) => {
    const { showLoading = !hasLoadedRef.current } = options;
    if (isFetchingRef.current) {
      if (!pendingRefetchRef.current) {
        pendingRefetchRef.current = { showLoading };
      } else if (showLoading) {
        pendingRefetchRef.current.showLoading = true;
      }
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    isFetchingRef.current = true;

    try {
      const response = await analyticsService.getInventoryReport();

      if (response.success) {
        const normalized = (response.data || []).map((item) => ({
          ...item,
          quantity: Number(item.quantity ?? 0),
          minStock: Number(item.minStock ?? item.min_stock ?? 0),
          expiryDate:
            item.expiryDate ?? item.expiry_date ?? item.expiry ?? null,
        }));
        setInventoryData(normalized);
        lastFetchCompletedRef.current = Date.now();
        hasLoadedRef.current = true;
      } else {
        throw new Error('Failed to fetch inventory report');
      }
    } catch (error) {
      if (showLoading || !hasLoadedRef.current) {
        setError(error.message);
        toast.error('Error Loading Inventory Report', {
          description: 'Failed to load inventory report. Please try again.',
        });
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
      isFetchingRef.current = false;
      if (pendingRefetchRef.current) {
        const pending = pendingRefetchRef.current;
        pendingRefetchRef.current = null;
        setTimeout(() => {
          fetchInventoryReport(pending);
        }, 0);
      }
    }
  }, []);

  useEffect(() => {
    fetchInventoryReport();
  }, [fetchInventoryReport]);

  useEffect(() => {
    const unsubscribe = subscribeInventoryMutations(
      ({ pendingCount, lastMutationAt }) => {
        if (pendingCount > 0) return;
        if (lastMutationAt <= lastFetchCompletedRef.current) return;
        if (isFetchingRef.current) {
          if (!pendingRefetchRef.current) {
            pendingRefetchRef.current = { showLoading: false };
          }
          return;
        }
        fetchInventoryReport({ showLoading: false });
      }
    );
    return unsubscribe;
  }, [fetchInventoryReport]);

  const refetch = (options = {}) => {
    fetchInventoryReport({ showLoading: true, ...options });
  };

  return {
    inventoryData,
    loading,
    error,
    refetch,
  };
};

/**
 * Hook for fetching orders report data
 */
export const useOrdersReport = (range = '7d') => {
  const [ordersData, setOrdersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrdersReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await analyticsService.getOrdersReport(range);

      if (response.success) {
        setOrdersData(response.data);
      } else {
        throw new Error('Failed to fetch orders report');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Orders Report', {
        description: 'Failed to load orders report. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchOrdersReport();
  }, [fetchOrdersReport]);

  const refetch = () => {
    fetchOrdersReport();
  };

  return {
    ordersData,
    loading,
    error,
    refetch,
  };
};

/**
 * Hook for fetching customer history data
 */
export const useCustomerHistory = (params = {}) => {
  const [customerData, setCustomerData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stringify params to avoid infinite loops from object reference changes
  const paramsString = JSON.stringify(params);

  const fetchCustomerHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const parsedParams = JSON.parse(paramsString);
      const response = await analyticsService.getCustomerHistory(parsedParams);

      if (response.success) {
        setCustomerData(response.data);
      } else {
        throw new Error('Failed to fetch customer history');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Customer History', {
        description: 'Failed to load customer history. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [paramsString]);

  useEffect(() => {
    fetchCustomerHistory();
  }, [fetchCustomerHistory]);

  const refetch = () => {
    fetchCustomerHistory();
  };

  return {
    customerData,
    loading,
    error,
    refetch,
  };
};

/**
 * Hook for fetching attendance report data
 */
export const useAttendanceReport = (range = '7d') => {
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAttendanceReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await analyticsService.getAttendanceReport(range);

      if (response.success) {
        setAttendanceData(response.data);
      } else {
        throw new Error('Failed to fetch attendance report');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Attendance Report', {
        description: 'Failed to load attendance report. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchAttendanceReport();
  }, [fetchAttendanceReport]);

  const refetch = () => {
    fetchAttendanceReport();
  };

  return {
    attendanceData,
    loading,
    error,
    refetch,
  };
};

export default {
  useSalesReport,
  useInventoryReport,
  useOrdersReport,
  useCustomerHistory,
  useAttendanceReport,
};
