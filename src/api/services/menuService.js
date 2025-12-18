import apiClient from '../client';

const unwrap = (value) => value?.data ?? value;

const getBackendOrigin = () => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
    const mediaBase = env?.VITE_MEDIA_BASE_URL;
    if (typeof mediaBase === 'string' && /^https?:\/\//i.test(mediaBase)) {
      return new URL(mediaBase).origin;
    }
    const apiBase = env?.VITE_API_BASE_URL || apiClient?.baseURL;
    if (typeof apiBase === 'string' && /^https?:\/\//i.test(apiBase)) {
      return new URL(apiBase).origin;
    }
  } catch {}
  try {
    return typeof window !== 'undefined' ? window.location.origin : '';
  } catch {
    return '';
  }
};

const absoluteUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  if (/^(blob:|data:|https?:\/\/)/i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  const baseOrigin =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_MEDIA_BASE_URL) ||
    getBackendOrigin();
  try {
    return baseOrigin ? new URL(path, baseOrigin).toString() : path;
  } catch {
    return path;
  }
};

const pickUrl = (o) => {
  if (!o) return '';
  const keys = [
    'imageUrl',
    'image_url',
    'image',
    'photo',
    'picture',
    'thumbnail',
    'thumb',
    'image_path',
    'img',
    'url',
    'path',
    'location',
    'href',
  ];
  for (const k of keys) {
    const v = o?.[k];
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      const nested = pickUrl(v);
      if (nested) return nested;
    }
  }
  return '';
};

const normalizeMenuItem = (item) => {
  if (!item || typeof item !== 'object') return item;
  const normalizedImage = absoluteUrl(pickUrl(item));
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
    image: normalizedImage || item.image || item.imageUrl || '',
    imageUrl: normalizedImage || item.imageUrl || item.image || '',
  };
};

class MenuService {
  async getMenuItems(params = {}) {
    const cleanParams = { ...(params || {}) };
    const explicitPage =
      cleanParams.page !== undefined &&
      cleanParams.page !== null &&
      cleanParams.page !== '';

    const requestedLimit = (() => {
      const n = parseInt(cleanParams.limit, 10);
      if (!Number.isFinite(n) || n <= 0) return 200;
      return Math.min(n, 200);
    })();

    const maxPages = (() => {
      const n = parseInt(cleanParams.maxPages, 10);
      if (!Number.isFinite(n) || n <= 0) return 50;
      return Math.min(n, 200);
    })();

    delete cleanParams.maxPages;

    const fetchPage = async (page) => {
      const qs = new URLSearchParams();
      const pageParams = {
        ...cleanParams,
        limit: requestedLimit,
        ...(page ? { page } : {}),
      };
      Object.entries(pageParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
      });
      const res = await apiClient.get(`/menu/items?${qs.toString()}`, {
        retry: { retries: 1 },
      });
      const raw = res || {};
      const list = raw?.data || raw || [];
      const normalized = Array.isArray(list)
        ? list.map((it) => normalizeMenuItem(it))
        : [];
      const pagination = raw?.pagination || {
        page: page || 1,
        limit: Array.isArray(list) ? list.length : requestedLimit,
        total: Array.isArray(list) ? list.length : 0,
        totalPages: 1,
      };
      return { raw, data: normalized, pagination };
    };

    const first = await fetchPage(explicitPage ? cleanParams.page : 1);
    if (explicitPage) {
      return { success: true, data: first.data, pagination: first.pagination };
    }

    const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
    const targetPages = Math.min(totalPages, maxPages);
    if (targetPages <= 1) {
      return { success: true, data: first.data, pagination: first.pagination };
    }

    const all = [...first.data];
    for (let page = 2; page <= targetPages; page += 1) {
      const next = await fetchPage(page);
      all.push(...next.data);
    }

    return {
      success: true,
      data: all,
      pagination: {
        ...first.pagination,
        page: 1,
        limit: requestedLimit,
        totalPages,
      },
    };
  }

  async getMenuItemById(itemId) {
    const res = await apiClient.get(`/menu/items/${itemId}`, {
      retry: { retries: 1 },
    });
    const data = normalizeMenuItem(unwrap(res));
    return { success: true, data };
  }

  async createMenuItem(itemData) {
    const hasFile =
      typeof FormData !== 'undefined' &&
      itemData &&
      itemData.imageFile instanceof Blob;

    if (hasFile) {
      const formData = new FormData();
      const entries = {
        name: itemData.name,
        description: itemData.description,
        price: itemData.price,
        category: itemData.category,
        available: itemData.available,
        ingredients: itemData.ingredients,
        preparationTime: itemData.preparationTime,
      };
      Object.entries(entries).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === 'ingredients' && Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      });
      formData.append('image', itemData.imageFile);

      const res = await apiClient.post('/menu/items', null, {
        body: formData,
        retry: { retries: 1 },
      });
      return { success: true, data: normalizeMenuItem(unwrap(res)) };
    }

    const res = await apiClient.post('/menu/items', itemData, {
      retry: { retries: 1 },
    });
    return { success: true, data: normalizeMenuItem(unwrap(res)) };
  }

  async updateMenuItem(itemId, updates) {
    const res = await apiClient.put(`/menu/items/${itemId}`, updates, {
      retry: { retries: 1 },
    });
    return { success: true, data: normalizeMenuItem(unwrap(res)) };
  }

  async deleteMenuItem(itemId) {
    const res = await apiClient.post(
      `/menu/items/${encodeURIComponent(itemId)}/archive`,
      {},
      { retry: { retries: 1 } }
    );
    return { success: true, data: normalizeMenuItem(unwrap(res)) };
  }

  async restoreMenuItem(itemId) {
    const res = await apiClient.post(
      `/menu/items/${encodeURIComponent(itemId)}/restore`,
      {},
      { retry: { retries: 1 } }
    );
    return { success: true, data: normalizeMenuItem(unwrap(res)) };
  }

  async hardDeleteMenuItem(itemId) {
    const res = await apiClient.post(
      `/menu/items/${encodeURIComponent(itemId)}/hard-delete`,
      {},
      { retry: { retries: 1 } }
    );
    return { success: true, data: unwrap(res) };
  }

  async updateItemAvailability(itemId, available) {
    const res = await apiClient.patch(
      `/menu/items/${itemId}/availability`,
      { available },
      { retry: { retries: 1 } }
    );
    return { success: true, data: normalizeMenuItem(unwrap(res)) };
  }

  async getCategories() {
    const res = await apiClient.get('/menu/categories', {
      retry: { retries: 1 },
    });
    const raw = unwrap(res);
    return { success: true, data: raw?.data || raw };
  }

  async createCategory(categoryData) {
    const res = await apiClient.post('/menu/categories', categoryData, {
      retry: { retries: 1 },
    });
    return { success: true, data: unwrap(res) };
  }

  async updateCategory(categoryId, updates = {}) {
    if (!categoryId) throw new Error('Category id is required');
    const res = await apiClient.put(
      `/menu/categories/${encodeURIComponent(categoryId)}`,
      updates,
      {
        retry: { retries: 1 },
      }
    );
    return { success: true, data: unwrap(res) };
  }

  /**
   * Upload a menu item image with fast client-side compression (WebP)
   * for efficient transfers. Falls back to FormData if conversion fails.
   */
  async uploadItemImage(itemId, imageFile) {
    if (!itemId) throw new Error('Menu item id is required');
    if (!imageFile) throw new Error('Image file is required');

    const toDataUrl = (file) =>
      new Promise((resolve, reject) => {
        try {
          if (typeof FileReader === 'undefined') {
            reject(
              new Error('FileReader is not available in this environment')
            );
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(reader.error || new Error('Unable to read image file'));
          reader.readAsDataURL(file);
        } catch (error) {
          reject(error);
        }
      });

    const sendFormPayload = () => {
      const formData = new FormData();
      formData.append('image', imageFile);
      return apiClient.post(`/menu/items/${itemId}/image`, null, {
        body: formData,
        retry: { retries: 1 },
      });
    };

    const sendBase64Payload = async () => {
      const dataUrl = await toDataUrl(imageFile);
      const filename = imageFile?.name || imageFile?.filename || undefined;
      return apiClient.post(
        `/menu/items/${itemId}/image`,
        {
          imageData: dataUrl,
          filename,
        },
        { retry: { retries: 1 } }
      );
    };

    const canUseFormData =
      typeof FormData !== 'undefined' &&
      (typeof Blob === 'undefined' || imageFile instanceof Blob);

    let res;
    try {
      res = canUseFormData
        ? await sendFormPayload()
        : await sendBase64Payload();
    } catch (error) {
      const status = error?.status ?? error?.response?.status ?? null;
      if (canUseFormData && status && status >= 400 && status < 500) {
        res = await sendBase64Payload();
      } else {
        throw error;
      }
    }

    const raw = unwrap(res) || {};
    const imageUrlAbs = absoluteUrl(pickUrl(raw));
    const imageUrl = imageUrlAbs
      ? `${imageUrlAbs}${imageUrlAbs.includes('?') ? '&' : '?'}v=${Date.now()}`
      : '';
    return { success: true, data: { imageUrl } };
  }

  async deleteItemImage(itemId) {
    const res = await apiClient.delete(`/menu/items/${itemId}/image`, {
      retry: { retries: 1 },
    });
    const raw = unwrap(res);
    const imageUrl = absoluteUrl(pickUrl(raw));
    return { success: true, data: { imageUrl: imageUrl || null } };
  }
}

export const menuService = new MenuService();
export default menuService;
