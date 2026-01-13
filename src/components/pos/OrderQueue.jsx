import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BadgeDollarSign,
  Package,
  Smartphone,
  Clock,
  Check,
  CreditCard,
  Eye,
  PauseCircle,
  PlayCircle,
  Loader2,
  ListOrdered,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { formatOrderNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { orderService } from '@/api/services/orderService';
import {
  buildOrderChecklistItemKeys,
  getOrderChecklist,
  isOrderChecklistItemChecked,
  subscribeOrderChecklist,
  toggleOrderChecklistItem,
} from '@/lib/orderChecklist';

const CHECKLIST_AUTO_PAUSE_REASON = 'checklist_incomplete';

const truthyValues = new Set([true, 'true', 1, '1']);
const falsyValues = new Set([false, 'false', 0, '0']);
const PAYMENT_CASH_ALIASES = new Set([
  'cash',
  'counter',
  'pay_at_counter',
  'pay-at-counter',
  'pay at counter',
  'cod',
]);
const PAYMENT_GCASH_ALIASES = new Set([
  'gcash',
  'g-cash',
  'g cash',
  'mobile',
  'e-wallet',
  'ewallet',
  'e_wallet',
]);

const normalizeStatus = (value) => {
  if (!value) return '';
  return String(value).toLowerCase().trim();
};

const STATUS_CANONICAL_MAP = {
  pending: 'new',
  accepted: 'accepted',
  in_queue: 'accepted',
  'in-queue': 'accepted',
  in_progress: 'in_prep',
  'in-progress': 'in_prep',
  in_prep: 'in_prep',
  preparing: 'in_prep',
  ready: 'staged',
  staged: 'staged',
  handoff: 'handoff',
  completed: 'completed',
  cancelled: 'cancelled',
  voided: 'voided',
  refunded: 'refunded',
};

const toCanonicalStatus = (status) => {
  const normalized = normalizeStatus(status);
  return STATUS_CANONICAL_MAP[normalized] || normalized;
};

const getOrderStatus = (order) => {
  const candidates = [
    order?.status,
    order?.canonicalStatus,
    order?.canonical_status,
    order?.rawStatus,
    order?.raw_status,
  ];
  for (const value of candidates) {
    const normalized = normalizeStatus(value);
    if (normalized) return normalized;
  }
  return '';
};

const getOrderChannel = (order) => {
  const candidates = [
    order?.type,
    order?.orderType,
    order?.order_type,
    order?.channel,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (
        ['walk-in', 'walkin', 'walk_in', 'walk in', 'counter'].includes(
          normalized
        )
      ) {
        return 'walk-in';
      }
      if (
        ['online', 'web', 'delivery', 'pickup', 'app', 'mobile'].includes(
          normalized
        )
      ) {
        return 'online';
      }
      return normalized;
    }
  }
  return 'walk-in';
};

const normalizePaymentMethod = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const parseDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const getPaymentMethod = (order) => {
  const candidates = [
    order?.paymentMethod,
    order?.payment_method,
    order?.payment?.method,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return normalizePaymentMethod(value);
    }
  }
  return '';
};

const getPaymentStatus = (order) => {
  const candidates = [
    order?.paymentStatus,
    order?.payment_status,
    order?.payment?.status,
    order?.payment?.paymentStatus,
  ];
  for (const value of candidates) {
    const normalized = normalizeStatus(value);
    if (normalized) return normalized;
  }
  return '';
};

const isCashMethod = (method) =>
  method ? PAYMENT_CASH_ALIASES.has(normalizePaymentMethod(method)) : false;
const isGcashMethod = (method) =>
  method ? PAYMENT_GCASH_ALIASES.has(normalizePaymentMethod(method)) : false;

const formatPaymentMethodLabel = (method) => {
  if (!method) return '—';
  const normalized = normalizePaymentMethod(method);
  if (isGcashMethod(normalized)) return 'GCash';
  if (isCashMethod(normalized)) return 'Cash';
  if (['card', 'debit', 'credit'].includes(normalized)) return 'Card';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const resolvePickupDate = (order) => {
  const directCandidates = [
    order?.promisedTime,
    order?.promised_time,
    order?.promisedAt,
    order?.promised_at,
    order?.pickupTime,
    order?.pickup_time,
  ];
  for (const value of directCandidates) {
    const parsed = parseDateValue(value);
    if (parsed) return parsed;
  }
  const received = parseDateValue(
    order?.timeReceived ?? order?.createdAt ?? order?.created_at
  );
  const quoteMinutes = Number(
    order?.quoteMinutes ?? order?.quotedMinutes ?? order?.quoted_minutes
  );
  if (received && Number.isFinite(quoteMinutes) && quoteMinutes > 0) {
    return new Date(received.getTime() + quoteMinutes * 60 * 1000);
  }
  return received;
};

const getPickupTimestamp = (order) => {
  const pickupDate = resolvePickupDate(order);
  return pickupDate ? pickupDate.getTime() : Number.POSITIVE_INFINITY;
};

const resolvePickupWindowMinutes = () => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
    const raw = env?.VITE_ORDER_PICKUP_WINDOW_MINUTES;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {}
  return 30;
};

const resolvePickupGraceMinutes = () => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
    const raw = env?.VITE_ORDER_PICKUP_GRACE_MINUTES;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {}
  return 15;
};

const formatPickupWindowRange = (order) => {
  const pickupDate = resolvePickupDate(order);
  if (!pickupDate) return 'Unknown';
  const windowMinutes = resolvePickupWindowMinutes();
  const endDate = new Date(pickupDate.getTime() + windowMinutes * 60 * 1000);
  const formatTime = (value) =>
    value.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  return `${formatTime(pickupDate)} - ${formatTime(endDate)}`;
};

const getGraceCountdownSeconds = (order, nowMs) => {
  const pickupDate = resolvePickupDate(order);
  if (!pickupDate) return null;
  const windowMinutes = resolvePickupWindowMinutes();
  const graceMinutes = resolvePickupGraceMinutes();
  if (!windowMinutes || !graceMinutes) return null;
  const windowEndMs = pickupDate.getTime() + windowMinutes * 60 * 1000;
  const graceEndMs = windowEndMs + graceMinutes * 60 * 1000;
  if (nowMs < windowEndMs || nowMs >= graceEndMs) return null;
  return Math.ceil((graceEndMs - nowMs) / 1000);
};

const isOrderPaid = (order) => {
  if (!order || typeof order !== 'object') return false;

  const booleanCandidates = [
    order.isPaid,
    order.paid,
    order.hasPaid,
    order.payment?.isPaid,
    order.payment?.paid,
    order.payment?.hasPaid,
  ];

  for (const value of booleanCandidates) {
    if (truthyValues.has(value)) return true;
    if (falsyValues.has(value)) return false;
  }

  const statusCandidates = [getPaymentStatus(order)].filter(Boolean);

  const paidStatuses = new Set([
    'paid',
    'settled',
    'complete',
    'completed',
    'success',
    'succeeded',
  ]);
  const unpaidStatuses = new Set([
    'unpaid',
    'pending',
    'due',
    'failed',
    'declined',
    'void',
    'voided',
  ]);

  for (const status of statusCandidates) {
    if (paidStatuses.has(status)) return true;
    if (unpaidStatuses.has(status)) return false;
  }

  const channel = getOrderChannel(order);
  const method = getPaymentMethod(order);
  if (channel !== 'walk-in' && isCashMethod(method)) {
    return false;
  }

  return true;
};

const getCancelReason = (order) => {
  if (!order) return '';
  const meta = order.meta || {};
  return (
    order.cancelReason ||
    order.cancel_reason ||
    meta.cancel_reason ||
    meta.cancelReason ||
    meta.no_show_reason ||
    meta.noShowReason ||
    ''
  );
};

const formatCancelReason = (reason) => {
  const normalized = String(reason || '').trim();
  if (!normalized) return '';
  const key = normalized.toLowerCase();
  const map = {
    pickup_window_expired: 'Pickup window expired',
    user_cancelled: 'Cancelled by customer',
    manual_cancelled: 'Cancelled manually',
    staff_cancelled: 'Cancelled by staff',
    no_show: 'No show',
  };
  if (map[key]) return map[key];
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const getCancelledTimestamp = (order) => {
  const candidates = [
    order?.cancelledAt,
    order?.cancelled_at,
    order?.meta?.cancelled_at,
    order?.meta?.cancelledAt,
    order?.updatedAt,
    order?.updated_at,
  ];
  for (const value of candidates) {
    if (value) return value;
  }
  return order?.timeReceived || order?.createdAt || order?.created_at || null;
};

const READY_STATUS_SET = new Set(['ready', 'staged', 'handoff']);

const shouldDisableReadyAutoAdvance = (order, statusOverride = null) => {
  if (!order) return false;
  const currentStatus = normalizeStatus(
    statusOverride || getOrderStatus(order)
  );
  if (!READY_STATUS_SET.has(currentStatus)) {
    return false;
  }
  const target = toCanonicalStatus(order?.autoAdvanceTarget);
  return target === 'completed';
};

const formatStatusLabel = (status) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return 'Unknown';
  const map = {
    pending: 'Pending',
    accepted: 'Accepted',
    in_queue: 'In Queue',
    in_progress: 'In Progress',
    'in-progress': 'In Progress',
    preparing: 'Preparing',
    in_prep: 'In Preparation',
    ready: 'Ready',
    staged: 'Ready',
    handoff: 'Handoff',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  if (map[normalized]) return map[normalized];
  return normalized
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatPaymentStatusLabel = (status) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return 'Pending';
  const map = {
    paid: 'Paid',
    settled: 'Paid',
    complete: 'Paid',
    completed: 'Paid',
    success: 'Paid',
    succeeded: 'Paid',
    pending: 'Pending',
    unpaid: 'Pending',
    due: 'Pending',
    failed: 'Failed',
    declined: 'Failed',
    void: 'Voided',
    voided: 'Voided',
    refunded: 'Refunded',
  };
  if (map[normalized]) return map[normalized];
  return normalized
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatCountdown = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const OrderQueue = ({
  orderQueue,
  cancelledOrders: cancelledOrdersProp,
  refreshQueue,
  updateOrderStatus,
  updateOrderAutoFlow,
}) => {
  const { can } = useAuth();
  const [statusUpdating, setStatusUpdating] = useState({});
  const [paymentUpdating, setPaymentUpdating] = useState({});
  const [checkedItems, setCheckedItems] = useState(() => getOrderChecklist());
  const [cancelledDetail, setCancelledDetail] = useState(null);
  const autoFlowInFlightRef = useRef(new Set());
  const queueOrders = useMemo(() => {
    if (!orderQueue) return [];
    if (Array.isArray(orderQueue)) return orderQueue;
    const nested = orderQueue?.orders || orderQueue?.data?.orders;
    return Array.isArray(nested) ? nested : [];
  }, [orderQueue]);

  useEffect(() => subscribeOrderChecklist(setCheckedItems), []);

  const getItemKeys = useCallback(
    (order, item, idx) => buildOrderChecklistItemKeys(order, item, idx),
    []
  );

  const isItemChecked = useCallback(
    (keys) => isOrderChecklistItemChecked(checkedItems, keys),
    [checkedItems]
  );

  const areAllItemsChecked = useCallback(
    (order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      if (items.length === 0) return true;
      return items.every((item, idx) =>
        isItemChecked(getItemKeys(order, item, idx))
      );
    },
    [getItemKeys, isItemChecked]
  );

  const toggleItemChecked = useCallback((keys) => {
    toggleOrderChecklistItem(keys);
  }, []);

  const visibleOrders = useMemo(() => {
    const filtered = queueOrders.filter((order) => {
      if (getOrderStatus(order) === 'completed') return false;
      if (isOrderPaid(order)) return true;
      const channel = getOrderChannel(order);
      const method = getPaymentMethod(order);
      return channel !== 'walk-in' && isCashMethod(method);
    });
    return [...filtered].sort(
      (a, b) => getPickupTimestamp(a) - getPickupTimestamp(b)
    );
  }, [queueOrders]);

  const cancelledOrders = useMemo(() => {
    if (Array.isArray(cancelledOrdersProp)) return cancelledOrdersProp;
    return queueOrders.filter((order) =>
      ['cancelled', 'canceled'].includes(normalizeStatus(getOrderStatus(order)))
    );
  }, [cancelledOrdersProp, queueOrders]);

  const walkInOrders = useMemo(
    () => visibleOrders.filter((order) => getOrderChannel(order) === 'walk-in'),
    [visibleOrders]
  );

  const onlineOrders = useMemo(
    () =>
      visibleOrders.filter((order) => {
        const channel = getOrderChannel(order);
        return channel !== 'walk-in';
      }),
    [visibleOrders]
  );

  useEffect(() => {
    if (!updateOrderAutoFlow) return;
    if (!can('order.status.update')) return;

    const runAutoFlowAction = async (orderId, action) => {
      if (!orderId) return;
      const lockKey = `${orderId}:${action}`;
      if (autoFlowInFlightRef.current.has(lockKey)) return;
      autoFlowInFlightRef.current.add(lockKey);
      try {
        const payload =
          action === 'pause'
            ? { action, reason: CHECKLIST_AUTO_PAUSE_REASON }
            : { action };
        await updateOrderAutoFlow(orderId, payload);
      } catch (error) {
        console.error(error);
      } finally {
        autoFlowInFlightRef.current.delete(lockKey);
      }
    };

    visibleOrders.forEach((order) => {
      if (getOrderChannel(order) === 'walk-in') return;
      const status = getOrderStatus(order);
      if (!READY_STATUS_SET.has(status)) return;

      const target = toCanonicalStatus(order?.autoAdvanceTarget);
      if (target !== 'completed') return;

      const allChecked = areAllItemsChecked(order);
      const pauseReason = normalizeStatus(order?.autoAdvancePauseReason);
      const pausedForChecklist = pauseReason === CHECKLIST_AUTO_PAUSE_REASON;

      if (!allChecked && !order.autoAdvancePaused) {
        runAutoFlowAction(order.id, 'pause');
        return;
      }

      if (allChecked && order.autoAdvancePaused && pausedForChecklist) {
        runAutoFlowAction(order.id, 'resume');
      }
    });
  }, [areAllItemsChecked, can, updateOrderAutoFlow, visibleOrders]);

  const runStatusUpdates = useCallback(
    async (orderId, statuses) => {
      const sequence = (Array.isArray(statuses) ? statuses : [statuses])
        .filter(Boolean)
        .map((status) => String(status));
      if (!orderId || sequence.length === 0) return false;
      setStatusUpdating((prev) => ({ ...prev, [orderId]: true }));
      try {
        for (const targetStatus of sequence) {
          await updateOrderStatus(orderId, targetStatus);
        }
        return true;
      } catch (err) {
        const message =
          err?.message ||
          err?.details?.message ||
          'Failed to update order status';
        toast.error(message);
        return false;
      } finally {
        setStatusUpdating((prev) => ({ ...prev, [orderId]: false }));
      }
    },
    [updateOrderStatus]
  );

  const handleStatusChange = useCallback(
    async (orderId, targetStatus) => {
      await runStatusUpdates(orderId, targetStatus);
    },
    [runStatusUpdates]
  );

  const handleMarkPaid = useCallback(
    async (order) => {
      if (!order?.id) return;
      const totalValue = Number(
        order.total ?? order.total_amount ?? order.totalAmount ?? 0
      );
      const amount = Number.isFinite(totalValue) ? totalValue : 0;
      if (!amount) {
        toast.error('Payment Failed', {
          description: 'Order total is missing.',
        });
        return;
      }
      setPaymentUpdating((prev) => ({ ...prev, [order.id]: true }));
      try {
        const response = await orderService.processPayment(order.id, {
          amount,
          method: 'cash',
          tenderedAmount: amount,
        });
        if (!response?.success) {
          throw new Error(response?.message || 'Failed to confirm payment');
        }
        const label =
          formatOrderNumber(order.orderNumber) || order.orderNumber || order.id;
        toast.success('Payment Confirmed', {
          description: `Order #${label} marked as paid.`,
        });
        if (typeof refreshQueue === 'function') {
          await refreshQueue();
        }
      } catch (err) {
        const message =
          err?.message || err?.details?.message || 'Failed to confirm payment';
        toast.error('Payment Failed', {
          description: message,
        });
      } finally {
        setPaymentUpdating((prev) => ({ ...prev, [order.id]: false }));
      }
    },
    [refreshQueue]
  );

  const handleStartPreparing = useCallback(
    async (order) => {
      if (!order?.id) return;
      const currentStatus = getOrderStatus(order);
      const canonical = toCanonicalStatus(currentStatus);
      const sequence = [];
      if (canonical === 'new') {
        sequence.push('accepted');
      }
      sequence.push('in_progress');
      await runStatusUpdates(order.id, sequence);
    },
    [runStatusUpdates]
  );

  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const id =
      typeof window !== 'undefined'
        ? window.setInterval(() => setNowTs(Date.now()), 1000)
        : null;
    return () => {
      if (id) {
        window.clearInterval(id);
      }
    };
  }, []);

  const computeCountdownSeconds = useCallback(
    (order) => {
      if (!order || order.autoAdvancePaused) {
        return null;
      }
      if (shouldDisableReadyAutoAdvance(order)) {
        return null;
      }
      const targetTimestamp = order.autoAdvanceAt
        ? new Date(order.autoAdvanceAt).getTime()
        : NaN;
      if (Number.isNaN(targetTimestamp)) {
        return null;
      }
      const diff = Math.ceil((targetTimestamp - nowTs) / 1000);
      return diff <= 0 ? 0 : diff;
    },
    [nowTs]
  );

  const handleToggleAutoFlow = useCallback(
    async (order) => {
      if (!updateOrderAutoFlow) return;
      const action = order?.autoAdvancePaused ? 'resume' : 'pause';
      const result = await updateOrderAutoFlow(order.id, { action });
      if (!result) {
        toast.error('Unable to update auto timer.');
      }
    },
    [updateOrderAutoFlow]
  );

  const renderAutoBadge = useCallback(
    (order) => {
      if (!order?.autoAdvanceTarget) return null;
      const channel = getOrderChannel(order);
      const status = getOrderStatus(order);
      const isPreparing = ['preparing', 'in_progress', 'in_prep'].includes(
        status
      );

      if (channel === 'walk-in' && !isPreparing) return null;
      if (shouldDisableReadyAutoAdvance(order, status)) return null;
      const countdown = computeCountdownSeconds(order);
      const paused = order.autoAdvancePaused;
      const displayCountdown =
        paused || countdown === null ? null : formatCountdown(countdown);
      const nextLabel = formatStatusLabel(order.autoAdvanceTarget);
      const badgeClasses = paused
        ? 'border bg-slate-200 text-slate-700 border-slate-300'
        : countdown !== null && countdown <= 5
          ? 'border bg-red-100 text-red-700 border-red-200'
          : 'border bg-slate-100 text-slate-700 border-slate-200';

      return (
        <div className="flex flex-col items-end gap-1 text-xs">
          <Badge variant="outline" className={badgeClasses}>
            {paused
              ? 'Auto Paused'
              : displayCountdown
                ? `Auto ${displayCountdown}`
                : 'Auto'}
          </Badge>
          <span className="text-muted-foreground">{`Next: ${nextLabel}`}</span>
        </div>
      );
    },
    [computeCountdownSeconds]
  );

  const formatTimeAgo = (input) => {
    if (!input) return 'Unknown';
    const d = input instanceof Date ? input : new Date(input);
    const ts = d.getTime();
    if (Number.isNaN(ts)) return 'Unknown';

    const nowTs = Date.now();
    const diffInMinutes = Math.floor((nowTs - ts) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes === 1) return '1 minute ago';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

    const hours = Math.floor(diffInMinutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  const formatDateTime = (input) => {
    if (!input) return '—';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'preparing':
      case 'in_progress':
      case 'in-progress':
      case 'in_prep':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ready':
      case 'staged':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_queue':
      case 'accepted':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
      {/* Walk-in Orders */}
      <Card>
        <CardHeader className="bg-amber-50 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Walk-in Orders
              </CardTitle>
              <CardDescription>Orders placed at counter</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-amber-100 text-amber-800 border-amber-200"
              >
                {walkInOrders.length} Orders
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {walkInOrders.length > 0 ? (
            <div className="divide-y max-h-[600px] overflow-y-auto scrollbar-hide">
              {walkInOrders.map((order) => {
                const status = getOrderStatus(order);
                const statusLabel = formatStatusLabel(status);
                const isPending = [
                  'pending',
                  'accepted',
                  'in_queue',
                  'new',
                ].includes(status);
                const isPreparing = [
                  'preparing',
                  'in_progress',
                  'in_prep',
                ].includes(status);
                const isReady = ['ready', 'staged', 'handoff'].includes(status);
                const allItemsChecked = areAllItemsChecked(order);
                const isPaid = isOrderPaid(order);
                const completeDisabled =
                  statusUpdating[order.id] || !allItemsChecked || !isPaid;
                const completeTitle = !allItemsChecked
                  ? 'Check all items before completing the order'
                  : !isPaid
                    ? 'Mark payment as paid before completing the order'
                    : undefined;
                const disableAutoAdvance = shouldDisableReadyAutoAdvance(
                  order,
                  status
                );
                const showAutoControls = Boolean(
                  updateOrderAutoFlow &&
                    order.autoAdvanceTarget &&
                    can('order.status.update') &&
                    !disableAutoAdvance &&
                    getOrderChannel(order) !== 'walk-in'
                );

                return (
                  <div key={order.id} className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h3 className="font-semibold text-lg">
                          #
                          {formatOrderNumber(order.orderNumber) ||
                            order.orderNumber ||
                            'N/A'}
                        </h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />{' '}
                          {formatTimeAgo(order.timeReceived)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            status
                          )}`}
                        >
                          {statusLabel}
                        </div>
                        {renderAutoBadge(order)}
                      </div>
                    </div>

                    <div className="bg-muted/50 p-3 rounded-md">
                      {(Array.isArray(order.items) ? order.items : []).map(
                        (item, idx) => {
                          const keys = getItemKeys(order, item, idx);
                          const checked = isItemChecked(keys);
                          return (
                            <label
                              key={keys.stable}
                              className="flex items-start justify-between gap-3 text-sm"
                            >
                              <span className="flex flex-1 items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                                  checked={checked}
                                  onChange={() => toggleItemChecked(keys)}
                                />
                                <span>
                                  {item.quantity}x {item.name}
                                </span>
                              </span>
                              <span>
                                ₱{(item.price * item.quantity).toFixed(2)}
                              </span>
                            </label>
                          );
                        }
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {isPending && can('order.status.update') && (
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={statusUpdating[order.id]}
                            onClick={() => handleStartPreparing(order)}
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              'Start Preparing'
                            )}
                          </Button>
                        )}

                        {isPreparing && can('order.status.update') && (
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={statusUpdating[order.id]}
                            onClick={() =>
                              handleStatusChange(order.id, 'ready')
                            }
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Coming right up...
                              </>
                            ) : (
                              'Mark Ready'
                            )}
                          </Button>
                        )}

                        {isReady && can('order.status.update') && (
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            disabled={completeDisabled}
                            title={completeTitle}
                            onClick={() => {
                              if (!allItemsChecked) {
                                toast.error(
                                  'Please check all items before completing the order.'
                                );
                                return;
                              }
                              if (!isPaid) {
                                toast.error(
                                  'Please mark payment as paid before completing the order.'
                                );
                                return;
                              }
                              handleStatusChange(order.id, 'completed');
                            }}
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Coming right up...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" /> Complete
                                Order
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {showAutoControls && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleToggleAutoFlow(order)}
                        >
                          {order.autoAdvancePaused ? (
                            <>
                              <PlayCircle className="h-4 w-4 mr-1" /> Resume
                              Timer
                            </>
                          ) : (
                            <>
                              <PauseCircle className="h-4 w-4 mr-1" /> Pause
                              Timer
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                No walk-in orders in queue
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Online Orders */}
      <Card>
        <CardHeader className="bg-blue-50 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Online Orders
              </CardTitle>
              <CardDescription>
                Orders placed through app or website
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-blue-100 text-blue-800 border-blue-200"
              >
                {onlineOrders.length} Orders
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {onlineOrders.length > 0 ? (
            <div className="divide-y max-h-[600px] overflow-y-auto scrollbar-hide">
              {onlineOrders.map((order) => {
                const status = getOrderStatus(order);
                const statusLabel = formatStatusLabel(status);
                const isPending = [
                  'pending',
                  'accepted',
                  'in_queue',
                  'new',
                ].includes(status);
                const isPreparing = [
                  'preparing',
                  'in_progress',
                  'in_prep',
                ].includes(status);
                const isReady = ['ready', 'staged', 'handoff'].includes(status);
                const allItemsChecked = areAllItemsChecked(order);
                const disableAutoAdvance = shouldDisableReadyAutoAdvance(
                  order,
                  status
                );
                const showAutoControls = Boolean(
                  updateOrderAutoFlow &&
                    order.autoAdvanceTarget &&
                    can('order.status.update') &&
                    !disableAutoAdvance
                );
                const channel = getOrderChannel(order);
                const paymentMethod = getPaymentMethod(order);
                const paymentStatus = getPaymentStatus(order);
                const isPaid = isOrderPaid(order);
                const isGcash = isGcashMethod(paymentMethod);
                const showPayment =
                  (channel !== 'walk-in' && isCashMethod(paymentMethod)) ||
                  isGcash;
                const showMarkPaid =
                  showPayment &&
                  !isPaid &&
                  can('payment.process') &&
                  isCashMethod(paymentMethod);
                const paymentLabel = isGcash
                  ? 'Paid'
                  : isPaid
                    ? 'Paid'
                    : formatPaymentStatusLabel(paymentStatus);
                const paymentBadgeClasses =
                  isGcash || isPaid
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                    : 'border-amber-200 bg-amber-100 text-amber-800';
                const paymentMethodLabel =
                  formatPaymentMethodLabel(paymentMethod) || 'Cash';
                const pickupTimeLabel = formatPickupWindowRange(order);
                const graceCountdown = getGraceCountdownSeconds(order, nowTs);
                const completeDisabled =
                  statusUpdating[order.id] || !allItemsChecked || !isPaid;
                const completeTitle = !allItemsChecked
                  ? 'Check all items before completing the order'
                  : !isPaid
                    ? 'Mark payment as paid before completing the order'
                    : undefined;

                return (
                  <div key={order.id} className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h3 className="font-semibold text-lg">
                          #
                          {formatOrderNumber(order.orderNumber) ||
                            order.orderNumber ||
                            'N/A'}
                        </h3>
                        <p className="text-sm font-medium">
                          {order.customerName}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />{' '}
                          {formatTimeAgo(order.timeReceived)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            status
                          )}`}
                        >
                          {statusLabel}
                        </div>
                        {renderAutoBadge(order)}
                      </div>
                    </div>

                    {showPayment && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">
                          Payment ({paymentMethodLabel})
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={paymentBadgeClasses}
                          >
                            {paymentLabel}
                          </Badge>
                          {showMarkPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={paymentUpdating[order.id]}
                              onClick={() => handleMarkPaid(order)}
                            >
                              {paymentUpdating[order.id] ? (
                                <>
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Updating
                                </>
                              ) : (
                                'Mark Paid'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Pickup Time:{' '}
                      <span className="font-medium text-slate-700">
                        {pickupTimeLabel}
                      </span>
                    </div>
                    {graceCountdown !== null && (
                      <div className="text-xs text-amber-600">
                        Grace period ends in {formatCountdown(graceCountdown)}
                      </div>
                    )}

                    <div className="bg-muted/50 p-3 rounded-md">
                      {(Array.isArray(order.items) ? order.items : []).map(
                        (item, idx) => {
                          const keys = getItemKeys(order, item, idx);
                          const checked = isItemChecked(keys);
                          return (
                            <label
                              key={keys.stable}
                              className="flex items-start justify-between gap-3 text-sm"
                            >
                              <span className="flex flex-1 items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                                  checked={checked}
                                  onChange={() => toggleItemChecked(keys)}
                                />
                                <span>
                                  {item.quantity}x {item.name}
                                </span>
                              </span>
                              <span>
                                ₱{(item.price * item.quantity).toFixed(2)}
                              </span>
                            </label>
                          );
                        }
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {isPending && can('order.status.update') && (
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={statusUpdating[order.id]}
                            onClick={() => handleStartPreparing(order)}
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              'Start Preparing'
                            )}
                          </Button>
                        )}

                        {isPreparing && can('order.status.update') && (
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={statusUpdating[order.id]}
                            onClick={() =>
                              handleStatusChange(order.id, 'ready')
                            }
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              'Ready for Pickup'
                            )}
                          </Button>
                        )}

                        {isReady && can('order.status.update') && (
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            disabled={completeDisabled}
                            title={completeTitle}
                            onClick={() => {
                              if (!allItemsChecked) {
                                toast.error(
                                  'Please check all items before completing the order.'
                                );
                                return;
                              }
                              if (!isPaid) {
                                toast.error(
                                  'Please mark payment as paid before completing the order.'
                                );
                                return;
                              }
                              handleStatusChange(order.id, 'completed');
                            }}
                          >
                            {statusUpdating[order.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" /> Complete
                                Order
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {showAutoControls && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleToggleAutoFlow(order)}
                        >
                          {order.autoAdvancePaused ? (
                            <>
                              <PlayCircle className="h-4 w-4 mr-1" /> Resume
                              Timer
                            </>
                          ) : (
                            <>
                              <PauseCircle className="h-4 w-4 mr-1" /> Pause
                              Timer
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No online orders in queue</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancelled Orders */}
      <Card className="md:col-span-2">
        <CardHeader className="bg-red-50 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                Cancelled Orders
              </CardTitle>
              <CardDescription>
                Synced cancellations from mobile and web
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200"
            >
              {cancelledOrders.length} Cancelled
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {cancelledOrders.length ? (
            <div className="divide-y max-h-[320px] overflow-y-auto scrollbar-hide">
              {cancelledOrders.map((order) => {
                const label =
                  formatOrderNumber(order.orderNumber) ||
                  order.orderNumber ||
                  order.id;
                const customer =
                  order.customerName ||
                  order.customer_name ||
                  order.customer ||
                  'Walk-in customer';
                const timestamp = getCancelledTimestamp(order);
                const reasonLabel = formatCancelReason(getCancelReason(order));
                return (
                  <div
                    key={order.id}
                    className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold">#{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-700 border-red-200"
                        >
                          Cancelled
                        </Badge>
                        {reasonLabel ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200"
                          >
                            {reasonLabel}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeAgo(timestamp)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2 self-start sm:self-auto"
                      onClick={() => setCancelledDetail(order)}
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <Package className="h-9 w-9 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No cancelled orders yet
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(cancelledDetail)}
        onOpenChange={(open) => {
          if (!open) setCancelledDetail(null);
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Cancelled Order #
              {formatOrderNumber(cancelledDetail?.orderNumber) ||
                cancelledDetail?.orderNumber ||
                cancelledDetail?.id ||
                '—'}
            </DialogTitle>
            <DialogDescription>
              {formatCancelReason(getCancelReason(cancelledDetail)) ||
                'Cancelled order details'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-slate-50/70 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Customer
                    </p>
                    <p className="font-medium">
                      {cancelledDetail?.customerName ||
                        cancelledDetail?.customer_name ||
                        cancelledDetail?.customer ||
                        'Walk-in customer'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Cancelled At
                    </p>
                    <p className="font-medium">
                      {formatDateTime(getCancelledTimestamp(cancelledDetail))}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CreditCard className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Payment
                    </p>
                    <p className="font-medium">
                      {formatPaymentMethodLabel(
                        getPaymentMethod(cancelledDetail)
                      ) || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BadgeDollarSign className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      Total
                    </p>
                    <p className="font-medium">
                      ₱
                      {Number(
                        cancelledDetail?.total ??
                          cancelledDetail?.total_amount ??
                          cancelledDetail?.totalAmount ??
                          0
                      ).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-3">
              <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <ListOrdered className="h-4 w-4" />
                Items
              </p>
              <div className="mt-2 space-y-2">
                {(cancelledDetail?.items || []).length ? (
                  cancelledDetail.items.map((item, idx) => (
                    <div
                      key={`${item.id || item.name}-${idx}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <span>
                        {item.quantity}x {item.name}
                      </span>
                      <span>₱{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No item details available.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setCancelledDetail(null)}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderQueue;
