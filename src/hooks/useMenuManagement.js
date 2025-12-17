import { useEffect, useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import menuService from '@/api/services/menuService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const useMenuManagement = (params = {}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    return safe;
  }, []);

  const normalizeForState = useCallback((item) => {
    if (!item) return null;
    const img =
      (typeof item.image === 'string' && item.image) ||
      (typeof item.imageUrl === 'string' && item.imageUrl) ||
      (typeof item.image_url === 'string' && item.image_url) ||
      (typeof item.photo === 'string' && item.photo) ||
      (typeof item.picture === 'string' && item.picture) ||
      '';
    const cat = item.category;
    const category =
      typeof cat === 'string'
        ? cat
        : typeof cat === 'object'
          ? cat?.name || cat?.label || cat?.title || cat?.slug || cat?.id || ''
          : String(cat || '');
    return {
      ...item,
      category: category || item.category || '',
      image: img || item.image || item.imageUrl || '',
      imageUrl: img || item.imageUrl || item.image || '',
    };
  }, []);

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
      updateMenuCaches((response) => {
        const current = response?.data || [];
        if (!Array.isArray(current)) return response;
        const nextData = current.filter((it) => it.id !== id);
        if (nextData.length === current.length) return response;
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
    refetchOnWindowFocus: false,
    onError: () => {
      toast({
        title: 'Error Loading Menu',
        description: 'Failed to load menu items. Please try again.',
        variant: 'destructive',
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
      toast({
        title: 'Menu Item Created',
        description: `${variables.name || 'Item'} has been added to the menu.`,
      });
      invalidateMenu();
    },
    onError: (error) => {
      toast({
        title: 'Error Creating Item',
        description: error?.message || 'Failed to create menu item',
        variant: 'destructive',
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
      toast({
        title: 'Menu Item Updated',
        description: 'Menu item has been updated successfully.',
      });
      invalidateMenu();
    },
    onError: (error) => {
      toast({
        title: 'Error Updating Item',
        description: error?.message || 'Failed to update menu item',
        variant: 'destructive',
      });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: (itemId) => menuService.deleteMenuItem(itemId),
    onSuccess: (_, itemId) => {
      removeItemFromCaches(itemId);
      toast({
        title: 'Menu Item Archived',
        description: 'The item has been moved to the archive.',
      });
      broadcastMenuEvent({ type: 'archive', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast({
        title: 'Error Archiving Item',
        description: error?.message || 'Failed to archive menu item',
        variant: 'destructive',
      });
    },
  });

  const restoreMenuItemMutation = useMutation({
    mutationFn: (itemId) => menuService.restoreMenuItem(itemId),
    onSuccess: (res, itemId) => {
      const restored = (res.data && res.data.data) || res.data || null;
      if (restored) upsertItem(restored);
      toast({
        title: 'Menu Item Restored',
        description: 'The item has been moved back to the active menu.',
      });
      broadcastMenuEvent({ type: 'restore', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast({
        title: 'Error Restoring Item',
        description: error?.message || 'Failed to restore menu item',
        variant: 'destructive',
      });
    },
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: ({ itemId, available }) =>
      menuService.updateItemAvailability(itemId, available),
    onSuccess: (_, variables) => {
      upsertItem({ id: variables.itemId, available: variables.available });
      toast({
        title: 'Availability Updated',
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
      toast({
        title: 'Error Updating Availability',
        description: error?.message || 'Failed to update availability',
        variant: 'destructive',
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
        toast({
          title: 'Image Uploaded',
          description: 'Menu item image has been updated successfully.',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error Uploading Image',
        description: error?.message || 'Failed to upload image',
        variant: 'destructive',
      });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (itemId) => menuService.deleteItemImage(itemId),
    onSuccess: (_, itemId) => {
      upsertItem({ id: itemId, image: null, imageUrl: null });
      toast({
        title: 'Image Removed',
        description: 'Menu item image has been deleted.',
      });
      broadcastMenuEvent({ type: 'image-delete', id: itemId });
      invalidateMenu();
    },
    onError: (error) => {
      toast({
        title: 'Error Removing Image',
        description: error?.message || 'Failed to delete image',
        variant: 'destructive',
      });
    },
  });

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
    refetch: itemsQuery.refetch,
  };
};

export const useMenuCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await menuService.getCategories();

      if (response.success) {
        setCategories(response.data);
      } else {
        throw new Error('Failed to fetch categories');
      }
    } catch (error) {
      setError(error.message);
      toast({
        title: 'Error Loading Categories',
        description: 'Failed to load menu categories. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const refetch = useCallback(() => fetchCategories(), [fetchCategories]);

  useEffect(() => {
    const handler = () => {
      fetchCategories();
    };
    window?.addEventListener?.('menu.items.updated', handler);
    return () => {
      window?.removeEventListener?.('menu.items.updated', handler);
    };
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    refetch,
  };
};

export default useMenuManagement;
