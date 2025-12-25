import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import inventoryService from '@/api/services/inventoryService';

export const useInventoryManagement = (params = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchInventoryItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await inventoryService.getInventoryItems(params);

      if (response.success) {
        setItems(response.data);
        setPagination(response.pagination);
      } else {
        throw new Error('Failed to fetch inventory items');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Inventory', {
        description: 'Failed to load inventory items. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [params, toast]);

  useEffect(() => {
    fetchInventoryItems();
  }, [fetchInventoryItems]);

  const createInventoryItem = useCallback(async (itemData) => {
    const tempId = `temp-${Date.now()}`;
    const optimisticItem = { ...itemData, id: tempId };
    setItems((prev) => [...prev, optimisticItem]);

    try {
      const response = await inventoryService.createInventoryItem(itemData);

      if (response.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === tempId ? { ...item, ...response.data } : item
          )
        );
        toast.success('Inventory Item Created', {
          description: `${itemData.name} has been added to inventory.`,
        });
        return response.data;
      }
      throw new Error('Failed to create inventory item');
    } catch (error) {
      setItems((prev) => prev.filter((item) => item.id !== tempId));
      toast.error('Error Creating Item', {
        description: error.message,
      });
      throw error;
    }
  }, []);

  const updateInventoryItem = useCallback(async (itemId, updates) => {
    let previousItem = null;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          previousItem = item;
          return { ...item, ...updates };
        }
        return item;
      })
    );

    try {
      const response = await inventoryService.updateInventoryItem(
        itemId,
        updates
      );

      if (response.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, ...response.data } : item
          )
        );
        toast.success('Inventory Item Updated', {
          description: 'Inventory item has been updated successfully.',
        });
        return response.data;
      }
      throw new Error('Failed to update inventory item');
    } catch (error) {
      if (previousItem) {
        setItems((prev) =>
          prev.map((item) => (item.id === itemId ? previousItem : item))
        );
      }
      toast.error('Error Updating Item', {
        description: error.message,
      });
      throw error;
    }
  }, []);

  const deleteInventoryItem = useCallback(async (itemId) => {
    let removedItem = null;
    let removedIndex = -1;
    setItems((prev) => {
      const next = [...prev];
      removedIndex = next.findIndex((item) => item.id === itemId);
      if (removedIndex !== -1) {
        removedItem = next[removedIndex];
        next.splice(removedIndex, 1);
      }
      return next;
    });

    try {
      const response = await inventoryService.deleteInventoryItem(itemId);

      if (response.success) {
        toast.success('Inventory Item Deleted', {
          description: 'Inventory item has been removed.',
        });
        return true;
      }
      throw new Error('Failed to delete inventory item');
    } catch (error) {
      if (removedItem) {
        setItems((prev) => {
          const next = [...prev];
          const insertIndex =
            removedIndex >= 0 && removedIndex <= next.length
              ? removedIndex
              : next.length;
          next.splice(insertIndex, 0, removedItem);
          return next;
        });
      }
      toast.error('Error Deleting Item', {
        description: error.message,
      });
      throw error;
    }
  }, []);

  const updateStock = useCallback(
    async (itemId, quantity, operation = 'set') => {
      let previousItem = null;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === itemId) {
            previousItem = item;
            const currentQty = Number(item.quantity ?? 0);
            const delta = Number(quantity ?? 0);
            let nextQty = currentQty;
            switch (operation) {
              case 'add':
                nextQty = currentQty + delta;
                break;
              case 'subtract':
                nextQty = Math.max(0, currentQty - delta);
                break;
              default:
                nextQty = delta;
            }
            return {
              ...item,
              quantity: nextQty,
              updatedAt: new Date().toISOString(),
            };
          }
          return item;
        })
      );

      try {
        const response = await inventoryService.updateStock(
          itemId,
          quantity,
          operation
        );

        if (response.success) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, ...response.data } : item
            )
          );

          const operationText = {
            add: 'restocked',
            subtract: 'reduced',
            set: 'updated',
          }[operation];

          toast.success('Stock Updated', {
            description: `Stock has been ${operationText} successfully.`,
          });
          return response.data;
        }
        throw new Error('Failed to update stock');
      } catch (error) {
        if (previousItem) {
          setItems((prev) =>
            prev.map((item) => (item.id === itemId ? previousItem : item))
          );
        }
        toast.error('Error Updating Stock', {
          description: error.message,
        });
        throw error;
      }
    },
    []
  );

  const refetch = useCallback(
    () => fetchInventoryItems(),
    [fetchInventoryItems]
  );

  return {
    items,
    loading,
    error,
    pagination,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    updateStock,
    refetch,
  };
};

export const useLowStockItems = (threshold) => {
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLowStockItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await inventoryService.getLowStockItems(threshold);

      if (response.success) {
        setLowStockItems(response.data);
      } else {
        throw new Error('Failed to fetch low stock items');
      }
    } catch (error) {
      setError(error.message);
      toast.error('Error Loading Low Stock Items', {
        description: 'Failed to load low stock items. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    if (threshold !== undefined) {
      fetchLowStockItems();
    }
  }, [fetchLowStockItems, threshold]);

  const refetch = () => {
    fetchLowStockItems();
  };

  return {
    lowStockItems,
    loading,
    error,
    refetch,
  };
};

// Simple in-memory cache keyed by params
const _activityCache = new Map(); // key -> { ts: number, data: any[] }
const _stableStringify = (obj) => {
  try {
    const keys = Object.keys(obj || {}).sort();
    const sorted = {};
    keys.forEach((k) => (sorted[k] = obj[k]));
    return JSON.stringify(sorted);
  } catch {
    return JSON.stringify(obj || {});
  }
};

export const useInventoryActivities = (params = {}, options = {}) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { auto = false, debounceMs = 500, cacheTtlMs = 30000 } = options || {};
  const debounceRef = useRef(null);

  const key = useMemo(() => _stableStringify(params || {}), [params]);

  const doFetch = useCallback(
    async (force = false) => {
      setError(null);
      // Cache lookup
      const now = Date.now();
      const cached = _activityCache.get(key);
      if (!force && cached && now - cached.ts <= cacheTtlMs) {
        setActivities(cached.data);
        return;
      }
      setLoading(true);
      try {
        const response = await inventoryService.getInventoryActivities(params);
        if (response.success) {
          const list = response.data || [];
          _activityCache.set(key, { ts: now, data: list });
          setActivities(list);
        } else {
          throw new Error('Failed to fetch inventory activities');
        }
      } catch (err) {
        setError(err.message);
        toast.error('Error Loading Activities', {
          description: 'Failed to load inventory activities. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    },
    [params, key, cacheTtlMs]
  );

  // Debounced refetch
  const refetch = useCallback(
    ({ force = false } = {}) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doFetch(force), debounceMs);
    },
    [doFetch, debounceMs]
  );

  useEffect(() => {
    if (auto) refetch({ force: false });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [auto, refetch]);

  return {
    activities,
    loading,
    error,
    refetch,
  };
};

export default useInventoryManagement;
