import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import orderService from '@/api/services/orderService';
import { createRealtime } from '@/lib/realtime';

export const useOrderManagement = (params = {}) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  // Stable param key to avoid infinite effects when callers pass inline objects
  const ordersParamKey = JSON.stringify(
    (() => {
      try {
        const keys = Object.keys(params || {}).sort();
        const obj = {};
        keys.forEach((k) => {
          const v = params[k];
          if (v !== undefined && v !== null && v !== '') obj[k] = v;
        });
        return obj;
      } catch {
        return {};
      }
    })()
  );

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await orderService.getOrders(params);

      if (response.success) {
        setOrders(response.data);
        setPagination(response.pagination);
      } else {
        throw new Error('Failed to fetch orders');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Orders', {
        description: 'Failed to load orders. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [ordersParamKey]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const createOrder = async (orderData) => {
    try {
      const response = await orderService.createOrder(orderData);

      if (response.success) {
        setOrders((prev) => [...prev, response.data]);
        toast.success('Order Created', {
          description: `Order ${response.data.orderNumber} has been created successfully.`,
        });
        return response.data;
      } else {
        throw new Error('Failed to create order');
      }
    } catch (error) {
      toast.error('Error Creating Order', {
        description: error.message,
      });
      throw error;
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      const response = await orderService.updateOrderStatus(orderId, status);

      if (response.success) {
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, ...response.data } : order
          )
        );

        const statusText = {
          pending: 'pending',
          preparing: 'preparing',
          ready: 'ready for pickup',
          completed: 'completed',
          cancelled: 'cancelled',
        }[status];

        toast.success('Order Status Updated', {
          description: `Order is now ${statusText}.`,
        });
        return response.data;
      } else {
        throw new Error('Failed to update order status');
      }
    } catch (error) {
      toast.error('Error Updating Status', {
        description: error.message,
      });
      throw error;
    }
  };

  const cancelOrder = async (orderId, reason) => {
    try {
      const response = await orderService.cancelOrder(orderId, reason);

      if (response.success) {
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status: 'cancelled' } : order
          )
        );
        toast.success('Order Cancelled', {
          description: 'Order has been cancelled successfully.',
        });
        return true;
      } else {
        throw new Error('Failed to cancel order');
      }
    } catch (error) {
      toast.error('Error Cancelling Order', {
        description: error.message,
      });
      throw error;
    }
  };

  const processPayment = async (orderId, paymentData) => {
    try {
      const response = await orderService.processPayment(orderId, paymentData);

      if (response.success) {
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  paymentMethod: paymentData.method,
                  status:
                    order.status === 'pending' ? 'preparing' : order.status,
                }
              : order
          )
        );
        toast.success('Payment Processed', {
          description: `Payment of ₱${paymentData.amount.toFixed(2)} processed successfully.`,
        });
        return response.data;
      } else {
        throw new Error('Failed to process payment');
      }
    } catch (error) {
      toast.error('Payment Failed', {
        description: error.message,
      });
      throw error;
    }
  };

  const refetch = () => {
    fetchOrders();
  };

  return {
    orders,
    loading,
    error,
    pagination,
    createOrder,
    updateOrderStatus,
    cancelOrder,
    processPayment,
    refetch,
  };
};

export const useOrderQueue = (params = {}) => {
  const [orderQueue, setOrderQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const rtRef = useRef(null);

  const queueParamKey = JSON.stringify(
    (() => {
      try {
        const keys = Object.keys(params || {}).sort();
        const obj = {};
        keys.forEach((k) => {
          const v = params[k];
          if (v !== undefined && v !== null && v !== '') obj[k] = v;
        });
        return obj;
      } catch {
        return {};
      }
    })()
  );

  const fetchOrderQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await orderService.getOrderQueue(params);

      if (response.success) {
        setOrderQueue(response.data);
      } else {
        throw new Error('Failed to fetch order queue');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Queue', {
        description: 'Failed to load order queue. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [queueParamKey]);

  useEffect(() => {
    fetchOrderQueue();

    const enableRealtime = Boolean(import.meta?.env?.VITE_WS_URL);
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(fetchOrderQueue, 5000);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    if (enableRealtime) {
      rtRef.current = createRealtime({
        path: '/orders',
        onMessage: (msg) => {
          // Expecting { type, data }
          const t = msg?.type || '';
          if (t === 'order_queue_update') {
            if (Array.isArray(msg.data)) setOrderQueue(msg.data);
          } else if (t === 'order_update') {
            const o = msg.data;
            if (!o?.id) return;
            setOrderQueue((prev) =>
              prev.map((x) => (x.id === o.id ? { ...x, ...o } : x))
            );
          }
        },
        onStatusChange: (status) => {
          if (status === 'open') {
            stopPolling();
          } else if (
            status === 'reconnecting' ||
            status === 'error' ||
            status === 'closed'
          ) {
            startPolling();
          }
        },
      });
      // While connecting, start a short-lived polling to keep data fresh
      startPolling();
    } else {
      startPolling();
    }

    return () => {
      stopPolling();
      rtRef.current?.close?.();
    };
  }, [queueParamKey, fetchOrderQueue]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      const response = await orderService.updateOrderStatus(orderId, status);

      if (response.success) {
        setOrderQueue((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, ...response.data } : order
          )
        );
        return response.data;
      } else {
        throw new Error('Failed to update order status');
      }
    } catch (error) {
      toast.error('Error Updating Status', {
        description: error.message,
      });
      throw error;
    }
  };

  const refetch = () => {
    fetchOrderQueue();
  };

  return {
    orderQueue,
    loading,
    error,
    updateOrderStatus,
    refetch,
  };
};

export const useOrderHistory = (params = {}, options = {}) => {
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const auto = options?.auto !== false; // default to true
  const fetchRef = useRef(false);

  const historyParamKey = JSON.stringify(
    (() => {
      try {
        const keys = Object.keys(params || {}).sort();
        const obj = {};
        keys.forEach((k) => {
          const v = params[k];
          if (v !== undefined && v !== null && v !== '') obj[k] = v;
        });
        return obj;
      } catch {
        return {};
      }
    })()
  );

  const fetchOrderHistory = useCallback(async () => {
    if (fetchRef.current) return; // prevent overlapping fetches
    fetchRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await orderService.getOrderHistory(params);

      if (response.success) {
        const data = response.data || [];
        setOrderHistory(data);
        setPagination(response.pagination);
        // Fallback: if history is empty, show recent orders regardless of status
        if (Array.isArray(data) && data.length === 0) {
          try {
            const recent = await orderService.getOrders({ limit: 50 });
            if (recent?.success && Array.isArray(recent.data)) {
              setOrderHistory(recent.data);
              setPagination(recent.pagination || null);
            }
          } catch {}
        }
      } else {
        throw new Error('Failed to fetch order history');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading History', {
        description: 'Failed to load order history. Please try again.',
      });
    } finally {
      setLoading(false);
      fetchRef.current = false;
    }
  }, [historyParamKey]);

  useEffect(() => {
    if (auto) fetchOrderHistory();
  }, [auto, fetchOrderHistory]);

  const refetch = useCallback(() => {
    fetchOrderHistory();
  }, [fetchOrderHistory]);

  return {
    orderHistory,
    loading,
    error,
    pagination,
    refetch,
  };
};

export default useOrderManagement;
