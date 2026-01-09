import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import menuService from '@/api/services/menuService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const resolvePollIntervalMs = () => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
    const raw = env?.VITE_MENU_POLL_INTERVAL_MS;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    // Default to lightweight polling in dev so external DB changes (seeding) show up without manual refresh.
    return env?.DEV ? 5000 : 0;
  } catch {
    return 0;
  }
};

export const useMenuManagement = (params = {}) => {
  const queryClient = useQueryClient();
  const pollIntervalMs = resolvePollIntervalMs();
  const pendingImagesRef = useRef({});

  const setPendingImage = useCallback((id, url) => {
    if (!id || !url) return;
    pendingImagesRef.current[id] = url;
  }, []);

  const clearPendingImage = useCallback((id) => {
    if (!id) return;
    if (pendingImagesRef.current?.[id]) {
      delete pendingImagesRef.current[id];
    }
  }, []);

  const resolvePendingImage = useCallback((id) => {
    if (!id) return '';
    return pendingImagesRef.current?.[id] || '';
  }, []);

  const sanitizeUpdatePayload = useCallback((updates = {}) => {
    const safe = {};
    if (typeof updates.name === 'string') {
      const name = updates.name.trim();
      if (name) safe.name = name;
    }
    if ('description' in updates) {
      const desc =
        typeof updates.description === 'string'
          ? updates.description.trim()
          : '';
      safe.description = desc || '';
    }
    if (updates.category !== undefined && updates.category !== null) {
      const cat = String(updates.category || '').trim();
      if (cat) safe.category = cat;
    }
    if ('price' in updates) {
      const priceNum = Number(updates.price);
      if (!Number.isNaN(priceNum) && priceNum >= 0) {
        safe.price = Number(priceNum.toFixed(2));
      }
    }
    if ('available' in updates) {
      safe.available = Boolean(updates.available);
    }
    if (Array.isArray(updates.ingredients)) {
      safe.ingredients = updates.ingredients;
    }
    if ('preparationTime' in updates) {
      const prep = parseInt(updates.preparationTime, 10);
      if (!Number.isNaN(prep) && prep >= 0) {
        safe.preparationTime = prep;
      }
    }
    const parsePaxInput = (raw) => {
      if (raw === undefined || raw === null) return undefined;
      const cleaned = typeof raw === 'string' ? raw.trim() : raw;
      if (cleaned === '') return undefined;
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed) || parsed < 0) return undefined;
      return Math.floor(parsed);
    };
    const paxRaw =
      updates.estimatedPax ??
      updates.paxPerPreparation ??
      updates.pax_per_preparation ??
      updates.estimated ??
      undefined;
    const paxValue = parsePaxInput(paxRaw);
    if (paxValue !== undefined) {
      safe.paxPerPreparation = paxValue;
      safe.estimatedPax = paxValue;
    }
    return safe;
  }, []);

  const normalizeForState = useCallback(
    (item) => {
      if (!item) return null;
      const img =
        (typeof item.image === 'string' && item.image) ||
        (typeof item.imageUrl === 'string' && item.imageUrl) ||
        (typeof item.image_url === 'string' && item.image_url) ||
        (typeof item.photo === 'string' && item.photo) ||
        (typeof item.picture === 'string' && item.picture) ||
        '';
      const pendingImage = resolvePendingImage(item.id);
      const resolvedImage = img || pendingImage || '';
      const cat = item.category;
      const category =
        typeof cat === 'string'
          ? cat
          : typeof cat === 'object'
            ? cat?.name ||
              cat?.label ||
              cat?.title ||
              cat?.slug ||
              cat?.id ||
              ''
            : String(cat || '');
      return {
        ...item,
        category: category || item.category || '',
        image: resolvedImage || item.image || item.imageUrl || '',
        imageUrl: resolvedImage || item.imageUrl || item.image || '',
      };
    },
    [resolvePendingImage]
  );

  const updateMenuCaches = useCallback(
    (mutator) => {
      const queries = queryClient.getQueriesData({ queryKey: ['menuItems'] });
      queries.forEach(([key, data]) => {
        const next = mutator(data);
        if (next !== data) {
          queryClient.setQueryData(key, next);
        }
      });
    },
    [queryClient]
  );

  const upsertItem = useCallback(
    (incoming) => {
      const normalized = normalizeForState(incoming);
      if (!normalized) return;
      updateMenuCaches((response) => {
        const current = response?.data || [];
        if (!Array.isArray(current)) return response;
        const idx = current.findIndex((it) => it.id === normalized.id);
        const nextData =
          idx >= 0
            ? current.map((it, i) =>
                i === idx ? { ...it, ...normalized } : it
              )
            : [normalized, ...current];
        return { ...(response || {}), data: nextData };
      });
    },
    [normalizeForState, updateMenuCaches]
  );

  const removeItemFromCaches = useCallback(
    (id) => {
      if (!id) return;
      clearPendingImage(id);
      updateMenuCaches((response) => {
        const current = response?.data || [];
        if (!Array.isArray(current)) return response;
        const nextData = current.filter((it) => it.id !== id);
        if (nextData.length === current.length) return response;
        return { ...(response || {}), data: nextData };
      });
    },
    [clearPendingImage, updateMenuCaches]
  );

  const setLocalImage = useCallback(
    (id, imageUrl) => {
      if (!id || !imageUrl) return;
      updateMenuCaches((response) => {
        const current = response?.data || [];
        if (!Array.isArray(current)) return response;
        const nextData = current.map((it) =>
          it.id === id ? { ...it, image: imageUrl, imageUrl } : it
        );
        return { ...(response || {}), data: nextData };
      });
    },
    [updateMenuCaches]
  );

  // Create a stable key for params to avoid infinite refetch loops on new object identities
  const paramKey = JSON.stringify(
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
        return params || {};
      }
    })()
  );

  const itemsQuery = useQuery({
    queryKey: ['menuItems', paramKey],
    queryFn: async () => {
      const response = await menuService.getMenuItems(params);
      if (!response?.success) throw new Error('Failed to fetch menu items');
      const normalized =
        Array.isArray(response.data) && response.data.length > 0
          ? response.data.map((it) => normalizeForState(it))
          : response.data;
      return { ...response, data: normalized || [] };
    },
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    keepPreviousData: true,
    refetchOnWindowFocus: pollIntervalMs ? false : true,
    refetchInterval: pollIntervalMs || false,
    onError: () => {
      toast.error('Error Loading Menu', {
        description: 'Failed to load menu items. Please try again.',
      });
    },
  });

  const broadcastMenuEvent = (detail) => {
    try {
      window?.dispatchEvent?.(
        new CustomEvent('menu.items.updated', { detail: detail || null })
      );
    } catch {}
  };

  const invalidateMenu = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['menuItems'] }),
    [queryClient]
  );

  const createMenuItemMutation = useMutation({
    mutationFn: (itemData) => menuService.createMenuItem(itemData),
    onSuccess: (res, variables) => {
      upsertItem(res.data);
      broadcastMenuEvent({ type: 'create', item: res.data });
      toast.success('Menu Item Created', {
        description: `${variables.name || 'Item'} has been added to the menu.`,
      });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Creating Item', {
        description: error?.message || 'Failed to create menu item',
      });
    },
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: ({ itemId, updates }) =>
      menuService.updateMenuItem(itemId, sanitizeUpdatePayload(updates)),
    onSuccess: (res, variables) => {
      upsertItem({ id: variables.itemId, ...res.data });
      broadcastMenuEvent({
        type: 'update',
        id: variables.itemId,
        updates: res.data,
      });
      toast.success('Menu Item Updated', {
        description: 'Menu item has been updated successfully.',
      });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Updating Item', {
        description: error?.message || 'Failed to update menu item',
      });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: (itemId) => menuService.deleteMenuItem(itemId),
    onSuccess: (_, itemId) => {
      removeItemFromCaches(itemId);
      toast.success('Menu Item Archived', {
        description: 'The item has been moved to the archive.',
      });
      broadcastMenuEvent({ type: 'archive', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Archiving Item', {
        description: error?.message || 'Failed to archive menu item',
      });
    },
  });

  const restoreMenuItemMutation = useMutation({
    mutationFn: (itemId) => menuService.restoreMenuItem(itemId),
    onSuccess: (res, itemId) => {
      const restored = (res.data && res.data.data) || res.data || null;
      if (restored) upsertItem(restored);
      toast.success('Menu Item Restored', {
        description: 'The item has been moved back to the active menu.',
      });
      broadcastMenuEvent({ type: 'restore', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Restoring Item', {
        description: error?.message || 'Failed to restore menu item',
      });
    },
  });

  const hardDeleteMenuItemMutation = useMutation({
    mutationFn: (itemId) => menuService.hardDeleteMenuItem(itemId),
    onSuccess: (_, itemId) => {
      removeItemFromCaches(itemId);
      toast.success('Menu Item Deleted', {
        description: 'The item has been permanently deleted from the database.',
      });
      broadcastMenuEvent({ type: 'hard-delete', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Deleting Item', {
        description: error?.message || 'Failed to delete menu item',
      });
    },
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: ({ itemId, available }) =>
      menuService.updateItemAvailability(itemId, available),
    onSuccess: (_, variables) => {
      upsertItem({ id: variables.itemId, available: variables.available });
      toast.success('Availability Updated', {
        description: `Menu item is now ${
          variables.available ? 'available' : 'unavailable'
        }.`,
      });
      broadcastMenuEvent({
        type: 'availability',
        id: variables.itemId,
        available: variables.available,
      });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Updating Availability', {
        description: error?.message || 'Failed to update availability',
      });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: ({ itemId, imageFile }) =>
      menuService.uploadItemImage(itemId, imageFile),
    onSuccess: (res, variables) => {
      const uploadedUrl = res.data?.imageUrl || '';
      const looksLikeFallback =
        uploadedUrl &&
        variables.itemId &&
        uploadedUrl.includes(`/menu_items/${variables.itemId}-`);
      const nextUrl = looksLikeFallback ? '' : uploadedUrl;

      upsertItem({ id: variables.itemId, image: nextUrl, imageUrl: nextUrl });
      if (nextUrl) {
        clearPendingImage(variables.itemId);
      }
      broadcastMenuEvent({
        type: 'image',
        id: variables.itemId,
        imageUrl: nextUrl,
      });

      if (looksLikeFallback) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            'Menu item image upload returned a placeholder URL; check media storage configuration.'
          );
        }
      } else {
        toast.success('Image Uploaded', {
          description: 'Menu item image has been updated successfully.',
        });
      }
    },
    onError: (error) => {
      toast.error('Error Uploading Image', {
        description: error?.message || 'Failed to upload image',
      });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (itemId) => menuService.deleteItemImage(itemId),
    onSuccess: (_, itemId) => {
      clearPendingImage(itemId);
      upsertItem({ id: itemId, image: null, imageUrl: null });
      toast.success('Image Removed', {
        description: 'Menu item image has been deleted.',
      });
      broadcastMenuEvent({ type: 'image-delete', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast.error('Error Removing Image', {
        description: error?.message || 'Failed to delete image',
      });
    },
  });

  const createMenuItemOptimistic = useCallback(
    async (itemData, options = {}) => {
      const previewImageUrl = options.previewImageUrl || '';
      const tempId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const optimisticItem = {
        ...itemData,
        id: tempId,
        image: previewImageUrl || itemData?.image || itemData?.imageUrl || '',
        imageUrl:
          previewImageUrl || itemData?.imageUrl || itemData?.image || '',
      };

      upsertItem(optimisticItem);

      try {
        const res = await createMenuItemMutation.mutateAsync(itemData);
        const created = res?.data || res;
        if (created?.id && previewImageUrl) {
          setPendingImage(created.id, previewImageUrl);
          setLocalImage(created.id, previewImageUrl);
        }
        removeItemFromCaches(tempId);
        return created;
      } catch (error) {
        removeItemFromCaches(tempId);
        throw error;
      }
    },
    [
      createMenuItemMutation,
      removeItemFromCaches,
      setLocalImage,
      setPendingImage,
      upsertItem,
    ]
  );

  useEffect(() => {
    const handler = () => invalidateMenu();
    window?.addEventListener?.('menu.items.updated', handler);
    return () => {
      window?.removeEventListener?.('menu.items.updated', handler);
    };
  }, [invalidateMenu]);

  return {
    items: itemsQuery.data?.data || [],
    loading: itemsQuery.isLoading,
    fetching: itemsQuery.isFetching,
    error: itemsQuery.error?.message || null,
    pagination: itemsQuery.data?.pagination,
    createMenuItem: async (itemData) => {
      const res = await createMenuItemMutation.mutateAsync(itemData);
      return res?.data || res;
    },
    createMenuItemOptimistic,
    updateMenuItem: async (itemId, updates) => {
      const res = await updateMenuItemMutation.mutateAsync({
        itemId,
        updates,
      });
      return res?.data || res;
    },
    deleteMenuItem: async (itemId) => {
      await deleteMenuItemMutation.mutateAsync(itemId);
      return true;
    },
    restoreMenuItem: async (itemId) => {
      const res = await restoreMenuItemMutation.mutateAsync(itemId);
      return (res?.data && res.data.data) || res?.data || res;
    },
    hardDeleteMenuItem: async (itemId) => {
      await hardDeleteMenuItemMutation.mutateAsync(itemId);
      return true;
    },
    updateItemAvailability: async (itemId, available) => {
      const res = await updateAvailabilityMutation.mutateAsync({
        itemId,
        available,
      });
      return res?.data || res;
    },
    uploadItemImage: async (itemId, imageFile) => {
      const res = await uploadImageMutation.mutateAsync({ itemId, imageFile });
      return res?.data || res;
    },
    deleteItemImage: async (itemId) => {
      await deleteImageMutation.mutateAsync(itemId);
      return true;
    },
    setLocalImage,
    refetch: itemsQuery.refetch,
  };
};

export const useMenuCategories = () => {
  const queryClient = useQueryClient();
  const pollIntervalMs = resolvePollIntervalMs();

  const query = useQuery({
    queryKey: ['menuCategories'],
    queryFn: async () => {
      const response = await menuService.getCategories();
      if (!response?.success) throw new Error('Failed to fetch categories');
      return response.data || [];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: pollIntervalMs ? false : true,
    refetchInterval: pollIntervalMs || false,
    keepPreviousData: true,
    onError: () => {
      toast.error('Error Loading Categories', {
        description: 'Failed to load menu categories. Please try again.',
      });
    },
  });

  const refetch = useCallback(() => query.refetch(), [query.refetch]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
    };
    window?.addEventListener?.('menu.items.updated', handler);
    return () => {
      window?.removeEventListener?.('menu.items.updated', handler);
    };
  }, [queryClient]);

  return {
    categories: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch,
  };
};

export default useMenuManagement;
