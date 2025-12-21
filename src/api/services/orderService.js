import apiClient from '../client';
import { mockOrders } from '../mockData';

const shouldUseMocks = () =>
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_ENABLE_MOCKS === 'true' ||
    import.meta.env.VITE_ENABLE_MOCKS === '1');

// Mock delay for realistic API simulation
const mockDelay = (ms = 800) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const toISO = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return date.toISOString();
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const capitalizeWords = (value) =>
  String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_CANONICAL_MAP = {
  pending: 'new',
  in_queue: 'accepted',
  in_progress: 'in_prep',
  ready: 'staged',
};

const AUTO_ADVANCE_DEFAULT_SECONDS = 60;

const normalizeStatus = (status) => {
  const s = String(status || '').toLowerCase();
  return STATUS_CANONICAL_MAP[s] || s || 'new';
};

const normalizeItemState = (state) => {
  const s = String(state || '').toLowerCase();
  return s || 'queued';
};

const normalizeItem = (item) => {
  if (!item || typeof item !== 'object') return item;
  const state = normalizeItemState(item.state || item.canonicalState);
  return {
    ...item,
    state,
    stateDisplay: item.stateDisplay || capitalizeWords(state),
    createdAt: toISO(item.createdAt),
    updatedAt: toISO(item.updatedAt),
    firedAt: toISO(item.firedAt),
    readyAt: toISO(item.readyAt),
    holdUntil: toISO(item.holdUntil),
    secondsInState: toNumber(item.secondsInState),
    ageSeconds: toNumber(item.ageSeconds),
    quantity: toNumber(item.quantity, 0),
    cookSecondsEstimate: toNumber(item.cookSecondsEstimate),
    cookSecondsActual: toNumber(item.cookSecondsActual),
    modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
    allergens: Array.isArray(item.allergens) ? item.allergens : [],
    notes: item.notes || '',
    priority: (item.priority || 'normal').toLowerCase(),
    channel: (item.channel || '').toLowerCase(),
    orderStatus: normalizeStatus(item.orderStatus || item.order_status),
  };
};

const normalizeOrder = (order) => {
  if (!order || typeof order !== 'object') return order;
  const canonical = normalizeStatus(
    order.canonicalStatus || order.status || order.rawStatus
  );
  const autoAdvanceRaw = order.autoAdvance || {};
  const phaseSequence = toNumber(
    order.phaseSequence ?? autoAdvanceRaw.phaseSequence ?? order.phase_sequence,
    0
  );
  const phaseStartedAt = toISO(
    order.phaseStartedAt ??
      autoAdvanceRaw.phaseStartedAt ??
      order.phase_started_at
  );
  const autoAdvanceAt = toISO(
    order.autoAdvanceAt ?? autoAdvanceRaw.autoAdvanceAt ?? order.auto_advance_at
  );
  const autoAdvanceTarget =
    order.autoAdvanceTarget ??
    autoAdvanceRaw.targetStatus ??
    order.auto_advance_target ??
    '';
  const autoAdvancePaused = Boolean(
    order.autoAdvancePaused ??
      autoAdvanceRaw.paused ??
      order.auto_advance_paused ??
      false
  );
  const autoAdvancePauseReason =
    order.autoAdvancePauseReason ??
    autoAdvanceRaw.pauseReason ??
    order.auto_advance_pause_reason ??
    '';
  const autoAdvanceDurationSeconds = toNumber(
    order.autoAdvanceDurationSeconds ??
      autoAdvanceRaw.durationSeconds ??
      order.auto_advance_duration_seconds,
    AUTO_ADVANCE_DEFAULT_SECONDS
  );

  const items = Array.isArray(order.items)
    ? order.items.map(normalizeItem)
    : [];
  const totalItems =
    toNumber(order.totalItems ?? order.total_items, items.length) ||
    items.length;
  const readyItems =
    toNumber(order.partialReadyItems ?? order.partial_ready_items) || 0;
  return {
    ...order,
    status: canonical,
    canonicalStatus: canonical,
    rawStatus: order.status || order.rawStatus || canonical,
    statusDisplay: order.statusDisplay || capitalizeWords(canonical),
    timeReceived:
      'timeReceived' in order
        ? toISO(order.timeReceived)
        : toISO(order.createdAt ?? order.created_at),
    timeCompleted:
      'timeCompleted' in order
        ? toISO(order.timeCompleted)
        : toISO(order.completedAt ?? order.completed_at),
    createdAt: toISO(order.createdAt ?? order.created_at),
    updatedAt: toISO(order.updatedAt ?? order.updated_at),
    promisedTime: toISO(order.promisedTime ?? order.promised_time),
    handoffVerifiedAt: toISO(
      order.handoffVerifiedAt ?? order.handoff_verified_at
    ),
    channel: (order.channel || order.type || 'walk-in').toLowerCase(),
    priority: (order.priority || 'normal').toLowerCase(),
    etaSeconds: toNumber(order.etaSeconds ?? order.eta_seconds),
    quoteMinutes: toNumber(
      order.quoteMinutes ?? order.quotedMinutes ?? order.quoted_minutes
    ),
    partialReadyItems: readyItems,
    totalItems,
    pendingItems:
      toNumber(order.pendingItems) || Math.max(0, totalItems - readyItems),
    lateBySeconds: toNumber(order.lateBySeconds ?? order.late_by_seconds),
    isThrottled: Boolean(order.isThrottled ?? order.is_throttled),
    throttleReason: order.throttleReason || order.throttle_reason || '',
    shelfSlot: order.shelfSlot || order.shelf_slot || '',
    handoffCode: order.handoffCode || order.handoff_code || '',
    phaseSequence,
    phaseStartedAt,
    autoAdvanceAt,
    autoAdvanceTarget,
    autoAdvancePaused,
    autoAdvancePauseReason,
    autoAdvanceDurationSeconds,
    autoAdvance: {
      phaseSequence,
      phaseStartedAt,
      autoAdvanceAt,
      targetStatus: autoAdvanceTarget,
      paused: autoAdvancePaused,
      pauseReason: autoAdvancePauseReason,
      durationSeconds: autoAdvanceDurationSeconds,
    },
    meta: order.meta || {},
    items,
  };
};

const normalizeStation = (station) => {
  if (!station || typeof station !== 'object') return station;
  const items = Array.isArray(station.items)
    ? station.items.map((item) => {
        const normalized = normalizeItem(item);
        return {
          ...normalized,
          orderId: item.orderId || item.order_id || normalized.orderId,
          orderNumber: item.orderNumber || item.order_number || '',
          customerName: item.customerName || normalized.customerName || '',
        };
      })
    : [];
  return {
    ...station,
    code: station.code,
    name: station.name,
    tags: Array.isArray(station.tags) ? station.tags : [],
    capacity: toNumber(station.capacity, 0),
    autoBatchWindowSeconds: toNumber(
      station.autoBatchWindowSeconds ?? station.auto_batch_window_seconds
    ),
    makeToStock: Array.isArray(station.makeToStock)
      ? station.makeToStock
      : Array.isArray(station.make_to_stock)
        ? station.make_to_stock
        : [],
    isExpo: Boolean(station.isExpo ?? station.is_expo),
    queueCount: toNumber(station.queueCount),
    activeQuantity: toNumber(station.activeQuantity),
    utilization: Number.isFinite(Number(station.utilization))
      ? Number(station.utilization)
      : 0,
    overCapacity: Boolean(station.overCapacity),
    averageSecondsInState: toNumber(station.averageSecondsInState),
    nextAvailabilitySeconds: toNumber(station.nextAvailabilitySeconds),
    lateCount: toNumber(station.lateCount),
    items,
  };
};

const normalizeQueuePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {
      orders: [],
      stations: [],
      summary: { totalOrders: 0 },
      capacity: {
        stations: [],
        shouldThrottle: false,
        peakUtilization: 0,
        recommendedQuoteMinutes: 0,
        throttleReasons: [],
      },
      batches: [],
      handoff: { pending: [], lateOrders: [] },
      generatedAt: toISO(new Date()),
      eventCursor: null,
    };
  }

  const orders = Array.isArray(payload.orders)
    ? payload.orders.map(normalizeOrder)
    : [];

  const stations = Array.isArray(payload.stations)
    ? payload.stations.map(normalizeStation)
    : [];

  const summary = payload.summary
    ? {
        ...payload.summary,
        totalOrders: toNumber(payload.summary.totalOrders, orders.length),
        statusCounts: payload.summary.statusCounts || {},
        channelCounts: payload.summary.channelCounts || {},
        priorityCounts: payload.summary.priorityCounts || {},
        readyForHandoff: toNumber(payload.summary.readyForHandoff),
        lateOrders: toNumber(payload.summary.lateOrders),
        averagePrepSeconds: toNumber(payload.summary.averagePrepSeconds),
        averageLatenessSeconds: toNumber(
          payload.summary.averageLatenessSeconds
        ),
        onTimePercent: toNumber(payload.summary.onTimePercent),
      }
    : { totalOrders: orders.length };

  const capacityStations = Array.isArray(payload.capacity?.stations)
    ? payload.capacity.stations.map(normalizeStation)
    : stations;

  const capacity = payload.capacity
    ? {
        ...payload.capacity,
        stations: capacityStations,
        shouldThrottle: Boolean(payload.capacity.shouldThrottle),
        peakUtilization: Number(payload.capacity.peakUtilization ?? 0),
        recommendedQuoteMinutes: toNumber(
          payload.capacity.recommendedQuoteMinutes,
          0
        ),
        throttleReasons: payload.capacity.throttleReasons || [],
      }
    : {
        stations: capacityStations,
        shouldThrottle: false,
        peakUtilization: 0,
        recommendedQuoteMinutes: 0,
        throttleReasons: [],
      };

  const batches = Array.isArray(payload.batches)
    ? payload.batches.map((batch) => ({
        ...batch,
        stationCode: batch.stationCode,
        stationName: batch.stationName,
        totalQuantity: toNumber(batch.totalQuantity),
        windowSeconds: toNumber(batch.windowSeconds),
        recommendedFireAt: toISO(batch.recommendedFireAt),
        orders: Array.isArray(batch.orders) ? batch.orders : [],
      }))
    : [];

  const handoff = payload.handoff
    ? {
        pending: Array.isArray(payload.handoff.pending)
          ? payload.handoff.pending.map((entry) => ({
              ...entry,
              lateBySeconds: toNumber(entry.lateBySeconds),
            }))
          : [],
        lateOrders: Array.isArray(payload.handoff.lateOrders)
          ? payload.handoff.lateOrders
          : [],
      }
    : { pending: [], lateOrders: [] };

  return {
    orders,
    stations,
    summary,
    capacity,
    batches,
    handoff,
    generatedAt: toISO(payload.generatedAt) || toISO(new Date()),
    eventCursor: toISO(payload.eventCursor),
  };
};

const normalizeApiResult = (res) => {
  if (!res || typeof res !== 'object') return res;
  if (Array.isArray(res)) return res.map(normalizeOrder);
  if ('data' in res) {
    const data = res.data;
    if (Array.isArray(data)) {
      return { ...res, data: data.map(normalizeOrder) };
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ...res, data: normalizeOrder(data) };
    }
    return { ...res, data };
  }
  return normalizeOrder(res);
};

class OrderService {
  async getOrders(params = {}) {
    if (shouldUseMocks()) {
      await mockDelay();
      return normalizeApiResult({
        success: true,
        data: mockOrders,
        pagination: {
          page: 1,
          limit: 50,
          total: mockOrders.length,
          totalPages: 1,
        },
      });
    }
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get(`/orders${query ? `?${query}` : ''}`);
    return normalizeApiResult(res);
  }

  async getOrderById(orderId) {
    if (shouldUseMocks()) {
      await mockDelay(600);
      const order = mockOrders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found');
      return normalizeApiResult({ success: true, data: order });
    }
    const res = await apiClient.get(`/orders/${encodeURIComponent(orderId)}`);
    return normalizeApiResult(res);
  }

  async generateOrderNumber(params = {}) {
    const resolvePrefix = () => {
      const channel = params?.channel || params?.type;
      if (channel) {
        const code = String(channel).trim();
        if (code) return code[0].toUpperCase();
      }
      const prefix = params?.prefix;
      if (prefix) {
        const code = String(prefix).trim();
        if (code) return code[0].toUpperCase();
      }
      return 'W';
    };

    if (shouldUseMocks()) {
      await mockDelay(120);
      const now = new Date();
      const year = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const datePart = `${year}${month}${day}`;
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      const randomPart = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');
      const prefix = resolvePrefix();
      const orderNumber = `${prefix}-${datePart}-${randomPart}`;
      return {
        success: true,
        data: {
          orderNumber,
          orderReference: `${prefix}-${datePart}`,
        },
      };
    }

    const query = new URLSearchParams(params).toString();
    const endpoint = `/orders/generate-number${query ? `?${query}` : ''}`;
    return apiClient.get(endpoint);
  }

  async createOrder(orderData) {
    if (shouldUseMocks()) {
      await mockDelay(1000);
      const now = new Date().toISOString();
      const newOrder = {
        id: Date.now().toString(),
        ...orderData,
        orderNumber:
          orderData?.orderNumber || `W-${String(Date.now()).slice(-6)}`,
        status: 'accepted',
        canonicalStatus: 'accepted',
        timeReceived: now,
        createdAt: now,
        timeCompleted: null,
      };
      return normalizeApiResult({ success: true, data: newOrder });
    }
    const res = await apiClient.post('/orders', orderData);
    return normalizeApiResult(res);
  }

  async checkoutOrder(orderData, options = {}) {
    if (shouldUseMocks()) {
      await mockDelay(800);
      const now = new Date().toISOString();
      const totalAmount =
        orderData?.totals?.total ??
        orderData?.totals?.amount ??
        orderData?.total ??
        0;
      const newOrder = {
        id: Date.now().toString(),
        ...orderData,
        orderNumber:
          orderData?.orderNumber || `W-${String(Date.now()).slice(-6)}`,
        status: 'accepted',
        canonicalStatus: 'accepted',
        timeReceived: now,
        createdAt: now,
        timeCompleted: null,
        payment: {
          id: `pay-${Date.now()}`,
          amount: totalAmount,
          method: 'cash',
          status: 'completed',
        },
      };
      return normalizeApiResult({ success: true, data: newOrder });
    }
    const headers = options?.idempotencyKey
      ? { 'Idempotency-Key': options.idempotencyKey }
      : undefined;
    const res = await apiClient.post('/orders/checkout', orderData, {
      headers,
    });
    return normalizeApiResult(res);
  }

  async updateOrderStatus(orderId, status, extra = {}) {
    if (shouldUseMocks()) {
      await mockDelay(600);
      const orderIndex = mockOrders.findIndex((o) => o.id === orderId);
      if (orderIndex === -1) throw new Error('Order not found');
      const now = new Date().toISOString();
      const updatedOrder = {
        ...mockOrders[orderIndex],
        status,
        canonicalStatus: normalizeStatus(status),
        timeCompleted: status === 'completed' ? now : null,
        updatedAt: now,
      };
      return normalizeApiResult({ success: true, data: updatedOrder });
    }
    const payload = { status, ...extra };
    const res = await apiClient.patch(
      `/orders/${encodeURIComponent(orderId)}/status`,
      payload
    );
    return normalizeApiResult(res);
  }

  async updateOrderAutoFlow(orderId, payload = {}) {
    if (shouldUseMocks()) {
      await mockDelay(400);
      const order = mockOrders.find((o) => o.id === orderId);
      const auto = {
        phaseSequence:
          typeof payload.phaseSequence === 'number'
            ? payload.phaseSequence
            : toNumber(order?.phaseSequence, 0) + 1,
        phaseStartedAt: new Date().toISOString(),
        autoAdvanceAt: null,
        targetStatus: order?.autoAdvanceTarget || 'in_progress',
        paused: payload.action === 'pause',
        pauseReason: payload.reason || '',
        durationSeconds: toNumber(
          payload.durationSeconds,
          AUTO_ADVANCE_DEFAULT_SECONDS
        ),
      };
      return normalizeApiResult({
        success: true,
        data: normalizeOrder({
          ...(order || {}),
          autoAdvance: auto,
          autoAdvancePaused: auto.paused,
          autoAdvancePauseReason: auto.pauseReason,
          autoAdvanceAt: auto.autoAdvanceAt,
          phaseSequence: auto.phaseSequence,
          phaseStartedAt: auto.phaseStartedAt,
          autoAdvanceTarget: auto.targetStatus,
          autoAdvanceDurationSeconds: auto.durationSeconds,
        }),
      });
    }
    const res = await apiClient.patch(
      `/orders/${encodeURIComponent(orderId)}/auto-flow`,
      payload
    );
    if (res && typeof res === 'object' && 'data' in res) {
      return { ...res, data: normalizeOrder(res.data) };
    }
    return normalizeApiResult(res);
  }

  async cancelOrder(orderId, reason) {
    return this.updateOrderStatus(orderId, 'cancelled', { reason });
  }

  async updateOrderItemState(orderId, itemId, payload = {}) {
    if (shouldUseMocks()) {
      await mockDelay(400);
      return {
        success: true,
        data: {
          order: null,
          item: null,
        },
      };
    }
    const res = await apiClient.patch(
      `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/state`,
      payload
    );
    if (res && typeof res === 'object' && 'data' in res) {
      const order = res.data?.order ? normalizeOrder(res.data.order) : null;
      const item = res.data?.item ? normalizeItem(res.data.item) : null;
      return { ...res, data: { order, item } };
    }
    return res;
  }

  async getOrderQueue(params = {}) {
    if (shouldUseMocks()) {
      await mockDelay(600);
      const queueOrders = mockOrders
        .filter((o) =>
          ['pending', 'preparing', 'ready', 'accepted', 'in_prep'].includes(
            String(o.status).toLowerCase()
          )
        )
        .map((o) => ({
          ...o,
          canonicalStatus: normalizeStatus(o.status),
          statusDisplay: capitalizeWords(o.status || o.canonicalStatus),
          items: (o.items || []).map((item, idx) => ({
            id: item.id || `mock-item-${idx}`,
            menuItemId: item.menuItemId || item.id || null,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            state: 'queued',
            stateDisplay: 'Queued',
            stationCode: 'expo',
            stationName: 'Expo',
            secondsInState: 0,
            ageSeconds: 0,
            createdAt: toISO(o.timeReceived) || toISO(new Date()),
            updatedAt: toISO(o.timeReceived) || toISO(new Date()),
            modifiers: [],
            allergens: [],
            notes: '',
            priority: 'normal',
          })),
        }));
      const payload = {
        orders: queueOrders,
        stations: [],
        summary: {
          totalOrders: queueOrders.length,
          statusCounts: queueOrders.reduce((acc, ord) => {
            const key = ord.canonicalStatus || ord.status;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          channelCounts: {},
          priorityCounts: {},
          readyForHandoff: 0,
          lateOrders: 0,
          averagePrepSeconds: 0,
          averageLatenessSeconds: 0,
          onTimePercent: 100,
        },
        capacity: {
          shouldThrottle: false,
          peakUtilization: 0,
          recommendedQuoteMinutes: 12,
          throttleReasons: [],
          stations: [],
        },
        batches: [],
        handoff: { pending: [], lateOrders: [] },
        generatedAt: new Date().toISOString(),
        eventCursor: null,
      };
      return {
        success: true,
        data: normalizeQueuePayload(payload),
      };
    }
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get(`/orders/queue${query ? `?${query}` : ''}`);
    if (res && typeof res === 'object' && 'data' in res) {
      return { ...res, data: normalizeQueuePayload(res.data) };
    }
    return { success: true, data: normalizeQueuePayload(res) };
  }

  async getOrderHistory(params = {}) {
    if (shouldUseMocks()) {
      await mockDelay(800);
      const historyOrders = mockOrders.filter((o) =>
        ['completed', 'cancelled'].includes(String(o.status).toLowerCase())
      );
      return normalizeApiResult({
        success: true,
        data: historyOrders,
        pagination: {
          page: 1,
          limit: 20,
          total: historyOrders.length,
          totalPages: 1,
        },
      });
    }
    const query = new URLSearchParams(params).toString();
    const res = await apiClient.get(
      `/orders/history${query ? `?${query}` : ''}`
    );
    return normalizeApiResult(res);
  }

  async processPayment(orderId, paymentData) {
    return apiClient.post(
      `/orders/${encodeURIComponent(orderId)}/payment`,
      paymentData
    );
  }
}

export const orderService = new OrderService();
export default orderService;
