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
  const baseOrigin = getBackendOrigin();
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
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const res = await apiClient.get(`/menu/items?${qs.toString()}`, {
      retry: { retries: 1 },
    });
    const raw = unwrap(res);
    const list = raw?.data || raw || [];
    const normalized = Array.isArray(list)
      ? list.map((it) => normalizeMenuItem(it))
      : [];
    return {
      success: true,
      data: normalized,
      pagination: raw?.pagination || {
        page: 1,
        limit: Array.isArray(list) ? list.length : 0,
        total: Array.isArray(list) ? list.length : 0,
        totalPages: 1,
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

    const toWebpDataUrl = async (file) => {
      try {
        const dataUrl = await toDataUrl(file);
        if (typeof document === 'undefined') return dataUrl;
        const img = document.createElement('img');
        const loaded = await new Promise((resolve, reject) => {
          img.onload = () => resolve(true);
          img.onerror = reject;
          img.src = dataUrl;
        });
        if (!loaded) return dataUrl;
        const canvas = document.createElement('canvas');
        const maxDim = 1024;
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const webp = canvas.toDataURL('image/webp', 0.8);
        return webp || dataUrl;
      } catch {
        return toDataUrl(file);
      }
    };

    const sendFormPayload = () => {
      const formData = new FormData();
      formData.append('image', imageFile);
      return apiClient.post(`/menu/items/${itemId}/image`, null, {
        body: formData,
        retry: { retries: 1 },
      });
    };

    const sendBase64Payload = async () => {
      const dataUrl = await toWebpDataUrl(imageFile);
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
}

export const menuService = new MenuService();
export default menuService;
