import { useEffect, useState, useCallback } from 'react';
import menuService from '@/api/services/menuService';
import { toast } from 'sonner';

const resolveMenuPollIntervalMs = () => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
    const raw = env?.VITE_MENU_POLL_INTERVAL_MS;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return env?.DEV ? 5000 : 0;
  } catch {
    return 0;
  }
};

const EMPTY_QUEUE = {
  orders: [],
  stations: [],
  summary: {
    totalOrders: 0,
    statusCounts: {},
    channelCounts: {},
    priorityCounts: {},
  },
  capacity: {
    stations: [],
    shouldThrottle: false,
    peakUtilization: 0,
    recommendedQuoteMinutes: 0,
    throttleReasons: [],
  },
  batches: [],
  handoff: { pending: [], lateOrders: [] },
  generatedAt: null,
  eventCursor: null,
};

export const EMPTY_QUEUE_STATE = EMPTY_QUEUE;

export const usePOSData = () => {
  const [orderHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orderQueue, setOrderQueue] = useState(EMPTY_QUEUE);

  const loadMenu = useCallback(async () => {
    try {
      const [catsRes, itemsRes] = await Promise.all([
        menuService.getCategories(),
        menuService.getMenuItems({ available: true, limit: 500 }),
      ]);
      // Normalize helpers
      const getCatName = (c) => {
        if (typeof c === 'string') return c;
        if (!c || typeof c !== 'object') return String(c || '');
        return c.name || c.label || c.title || c.slug || c.id || String(c);
      };
      const getCatSortOrder = (c) => {
        if (!c || typeof c !== 'object') return null;
        const raw = c.sortOrder ?? c.sort_order ?? c.sort ?? c.order ?? null;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
      };
      // Normalize items and ensure category is a string
      const toImage = (obj) => {
        const cands = [obj?.image, obj?.imageUrl, obj?.photo, obj?.picture];
        for (const c of cands) {
          if (typeof c === 'string' && c) return c;
        }
        return null;
      };
      const resolveIngredients = (obj) => {
        const raw =
          obj?.ingredients ?? obj?.ingredientIds ?? obj?.ingredient_ids;
        return Array.isArray(raw) ? raw : [];
      };
      const items = (itemsRes?.data || []).map((it) => {
        const catName = getCatName(it.category) || 'General';
        const image = toImage(it);
        return {
          ...it,
          id: it.id,
          name: it.name,
          description: it.description || '',
          price: Number(it.price || 0),
          category: String(catName),
          available: !!it.available,
          image: image || it.image || it.imageUrl || '',
          imageUrl: image || it.imageUrl || it.image || '',
          ingredients: resolveIngredients(it),
        };
      });

      const apiCatsRaw = Array.isArray(catsRes?.data) ? catsRes.data : [];
      const apiCats = apiCatsRaw
        .map((c) => {
          const name = String(getCatName(c) || '').trim();
          if (!name) return null;
          if (name.toLowerCase() === 'all') return null;
          return { name, sortOrder: getCatSortOrder(c) };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aOrder =
            a.sortOrder !== null ? a.sortOrder : Number.MAX_SAFE_INTEGER;
          const bOrder =
            b.sortOrder !== null ? b.sortOrder : Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.name.localeCompare(b.name);
        });

      const knownCatsLower = new Set(apiCats.map((c) => c.name.toLowerCase()));
      const itemCatNames = [];
      const itemCatSeen = new Set();
      (items || []).forEach((it) => {
        const name = String(it?.category || '').trim();
        if (!name) return;
        const lower = name.toLowerCase();
        if (lower === 'all' || itemCatSeen.has(lower)) return;
        itemCatSeen.add(lower);
        itemCatNames.push(name);
      });

      const extraCats = itemCatNames
        .filter((name) => !knownCatsLower.has(name.toLowerCase()))
        .sort((a, b) => a.localeCompare(b));

      const orderedCatNames = [];
      const orderedSeenLower = new Set();
      const addOrdered = (name) => {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        if (lower === 'all' || orderedSeenLower.has(lower)) return;
        orderedSeenLower.add(lower);
        orderedCatNames.push(trimmed);
      };
      apiCats.forEach((c) => addOrdered(c.name));
      extraCats.forEach((name) => addOrdered(name));

      const canonicalByLower = new Map(
        orderedCatNames.map((name) => [name.toLowerCase(), name])
      );

      const normalizedItems = (items || []).map((it) => {
        const rawName = String(it.category || 'General').trim() || 'General';
        const canonical =
          canonicalByLower.get(rawName.toLowerCase()) || rawName;
        return { ...it, category: canonical };
      });

      // Build category list with 'All' first, then by sort order.
      const byCat = new Map();
      byCat.set('All', { id: 'all', name: 'All', items: [...normalizedItems] });

      orderedCatNames.forEach((name) => {
        if (!name) return;
        if (name.toLowerCase() === 'all') return;
        if (byCat.has(name)) return;
        byCat.set(name, { id: name, name, items: [] });
      });

      normalizedItems.forEach((it) => {
        const canonical = String(it.category || 'General').trim() || 'General';
        if (!byCat.has(canonical)) {
          byCat.set(canonical, { id: canonical, name: canonical, items: [] });
        }
        byCat.get(canonical).items.push(it);
      });

      const grouped = Array.from(byCat.values());
      setCategories(grouped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load menu';
      toast.error(msg);
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // Poll menu periodically so external DB changes (like seed scripts) appear without a reload.
  useEffect(() => {
    const intervalMs = resolveMenuPollIntervalMs();
    if (!intervalMs) return;
    let timer = null;
    let cancelled = false;
    const tick = async () => {
      try {
        await loadMenu();
      } catch {
        // handled by loadMenu toast
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };
    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadMenu]);

  // Auto-refresh when menu items are created/updated/images uploaded elsewhere
  useEffect(() => {
    const handler = () => {
      loadMenu();
    };
    try {
      window?.addEventListener?.('menu.items.updated', handler);
    } catch {}
    return () => {
      try {
        window?.removeEventListener?.('menu.items.updated', handler);
      } catch {}
    };
  }, [loadMenu]);

  return {
    orderHistory,
    categories,
    orderQueue,
    setOrderQueue,
  };
};
