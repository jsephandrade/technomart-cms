import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import menuService from '@/api/services/menuService';

export const useMenuManagement = (params = {}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const { toast } = useToast();

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

  const upsertItem = useCallback(
    (incoming) => {
      const normalized = normalizeForState(incoming);
      if (!normalized) return;
      setItems((prev) => {
        const idx =
          normalized.id !== undefined && normalized.id !== null
            ? prev.findIndex((it) => it.id === normalized.id)
            : -1;
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...normalized };
          return next;
        }
        return [normalized, ...prev];
      });
    },
    [normalizeForState]
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

  const isArchivedView = (() => {
    const flag = params?.archived;
    if (flag === undefined || flag === null || flag === '') return false;
    if (typeof flag === 'boolean') return flag;
    return String(flag).toLowerCase() === 'true';
  })();

  const fetchMenuItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await menuService.getMenuItems(params);

      if (response.success) {
        const normalized =
          Array.isArray(response.data) && response.data.length > 0
            ? response.data.map((it) => normalizeForState(it))
            : response.data;
        setItems(normalized || []);
        setPagination(response.pagination);
      } else {
        throw new Error('Failed to fetch menu items');
      }
    } catch (error) {
      setError(error.message);
      toast({
        title: 'Error Loading Menu',
        description: 'Failed to load menu items. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [paramKey, toast, normalizeForState]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  const createMenuItem = async (itemData) => {
    try {
      const response = await menuService.createMenuItem(itemData);

      if (response.success) {
        upsertItem(response.data);
        try {
          window?.dispatchEvent?.(
            new CustomEvent('menu.items.updated', {
              detail: { type: 'create', item: response.data },
            })
          );
        } catch {}
        toast({
          title: 'Menu Item Created',
          description: `${itemData.name} has been added to the menu.`,
        });
        return response.data;
      } else {
        throw new Error('Failed to create menu item');
      }
    } catch (error) {
      toast({
        title: 'Error Creating Item',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateMenuItem = async (itemId, updates) => {
    try {
      const payload = sanitizeUpdatePayload(updates);
      const response = await menuService.updateMenuItem(itemId, payload);

      if (response.success) {
        upsertItem({ id: itemId, ...response.data });
        try {
          window?.dispatchEvent?.(
            new CustomEvent('menu.items.updated', {
              detail: { type: 'update', id: itemId, updates: response.data },
            })
          );
        } catch {}
        toast({
          title: 'Menu Item Updated',
          description: 'Menu item has been updated successfully.',
        });
        return response.data;
      } else {
        throw new Error('Failed to update menu item');
      }
    } catch (error) {
      const message = error?.message || 'Failed to update menu item';
      toast({
        title: 'Error Updating Item',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteMenuItem = async (itemId) => {
    try {
      const response = await menuService.deleteMenuItem(itemId);

      if (response.success) {
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        toast({
          title: 'Menu Item Archived',
          description: 'The item has been moved to the archive.',
        });
        try {
          window?.dispatchEvent?.(
            new CustomEvent('menu.items.updated', {
              detail: { type: 'archive', id: itemId },
            })
          );
        } catch {}
        return true;
      } else {
        throw new Error('Failed to archive menu item');
      }
    } catch (error) {
      toast({
        title: 'Error Archiving Item',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const restoreMenuItem = async (itemId) => {
    try {
      const response = await menuService.restoreMenuItem(itemId);

      if (response.success) {
        const restored =
          (response.data && response.data.data) || response.data || null;
        if (isArchivedView) {
          setItems((prev) => prev.filter((item) => item.id !== itemId));
        } else if (restored) {
          upsertItem(restored);
        }
        toast({
          title: 'Menu Item Restored',
          description: 'The item has been moved back to the active menu.',
        });
        try {
          window?.dispatchEvent?.(
            new CustomEvent('menu.items.updated', {
              detail: { type: 'restore', id: itemId },
            })
          );
        } catch {}
        return restored;
      }
      throw new Error('Failed to restore menu item');
    } catch (error) {
      toast({
        title: 'Error Restoring Item',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateItemAvailability = async (itemId, available) => {
    try {
      const response = await menuService.updateItemAvailability(
        itemId,
        available
      );

      if (response.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, available } : item
          )
        );
        toast({
          title: 'Availability Updated',
          description: `Menu item is now ${available ? 'available' : 'unavailable'}.`,
        });
        return response.data;
      } else {
        throw new Error('Failed to update availability');
      }
    } catch (error) {
      toast({
        title: 'Error Updating Availability',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const uploadItemImage = async (itemId, imageFile) => {
    try {
      const response = await menuService.uploadItemImage(itemId, imageFile);

      if (response.success) {
        const uploadedUrl = response.data?.imageUrl || '';
        const looksLikeFallback =
          uploadedUrl &&
          itemId &&
          uploadedUrl.includes(`/menu_items/${itemId}-`);
        const nextUrl = looksLikeFallback ? '' : uploadedUrl;

        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  image: nextUrl,
                  imageUrl: nextUrl,
                }
              : item
          )
        );
        try {
          window?.dispatchEvent?.(
            new CustomEvent('menu.items.updated', {
              detail: {
                type: 'image',
                id: itemId,
                imageUrl: nextUrl,
              },
            })
          );
        } catch {}

        if (looksLikeFallback) {
          toast({
            title: 'Image upload returned a placeholder',
            description:
              'The server did not provide a saved image URL. Check media storage or permissions.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Image Uploaded',
            description: 'Menu item image has been updated successfully.',
          });
        }
        return {
          ...response.data,
          imageUrl: nextUrl,
          fallback: looksLikeFallback,
        };
      } else {
        throw new Error('Failed to upload image');
      }
    } catch (error) {
      toast({
        title: 'Error Uploading Image',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteItemImage = async (itemId) => {
    try {
      const response = await menuService.deleteItemImage(itemId);
      if (response.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, image: null, imageUrl: null } : item
          )
        );
        toast({
          title: 'Image Removed',
          description: 'Menu item image has been deleted.',
        });
        return true;
      }
      throw new Error('Failed to delete image');
    } catch (error) {
      toast({
        title: 'Error Removing Image',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const refetch = useCallback(() => fetchMenuItems(), [fetchMenuItems]);

  useEffect(() => {
    const handler = () => {
      fetchMenuItems();
    };
    window?.addEventListener?.('menu.items.updated', handler);
    return () => {
      window?.removeEventListener?.('menu.items.updated', handler);
    };
  }, [fetchMenuItems]);

  return {
    items,
    loading,
    error,
    pagination,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    restoreMenuItem,
    updateItemAvailability,
    uploadItemImage,
    deleteItemImage,
    refetch,
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
