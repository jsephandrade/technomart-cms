import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/AuthContext';
import orderService from '@/api/services/orderService';

/**
 * Global background service for auto-advancing orders
 * Runs independently of the current page/component
 */
const POLL_INTERVAL_MS = 2000; // Check every 2 seconds
const ADVANCE_LOCK_TIMEOUT_MS = 10000; // Clear stuck locks after 10 seconds

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

const READY_STATUS_SET = new Set(['ready', 'staged', 'handoff']);

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

const WALK_IN_ALIASES = new Set([
  'walk-in',
  'walkin',
  'walk_in',
  'walk in',
  'counter',
]);
const ONLINE_ALIASES = new Set([
  'online',
  'web',
  'delivery',
  'pickup',
  'app',
  'mobile',
]);

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
      if (WALK_IN_ALIASES.has(normalized)) {
        return 'walk-in';
      }
      if (ONLINE_ALIASES.has(normalized)) {
        return 'online';
      }
      return normalized;
    }
  }
  return 'walk-in';
};

const isWalkInOrder = (order) => getOrderChannel(order) === 'walk-in';

const resolveAutoAdvanceTarget = (order) => {
  if (!order) return null;
  const direct = normalizeStatus(order.autoAdvanceTarget);
  if (direct) return direct;
  const canonicalStatus = toCanonicalStatus(getOrderStatus(order));
  if (canonicalStatus === 'in_prep') {
    return 'ready';
  }
  if (canonicalStatus === 'staged') {
    return 'completed';
  }
  return null;
};

export const useOrderAutoAdvance = () => {
  const { user, can } = useAuth();
  const autoAdvanceLocksRef = useRef(new Map());
  const intervalRef = useRef(null);
  const isProcessingRef = useRef(false);
  const haltedRef = useRef(false);

  const processOrders = useCallback(async () => {
    // Skip if not authenticated or no permission
    if (!user || !can('order.status.update') || haltedRef.current) {
      return;
    }

    // Skip if already processing
    if (isProcessingRef.current) {
      return;
    }

    try {
      isProcessingRef.current = true;

      // Fetch current order queue
      const result = await orderService.getOrderQueue();
      if (!result?.success || !result?.data?.orders) {
        return;
      }

      const orders = result.data.orders;
      const nowTs = Date.now();
      const activeKeys = new Set();

      for (const order of orders) {
        if (isWalkInOrder(order)) {
          if (order?.id) {
            for (const key of Array.from(autoAdvanceLocksRef.current.keys())) {
              if (key.startsWith(`${order.id}:`)) {
                autoAdvanceLocksRef.current.delete(key);
              }
            }
          }
          continue;
        }
        const targetResolved = resolveAutoAdvanceTarget(order);
        if (!targetResolved) {
          continue;
        }

        const target = normalizeStatus(targetResolved);
        const canonicalTarget = toCanonicalStatus(target);
        const canonicalStatus = toCanonicalStatus(getOrderStatus(order));
        const key = `${order.id}:${target}`;
        activeKeys.add(key);

        if (
          canonicalTarget === 'completed' &&
          READY_STATUS_SET.has(canonicalStatus)
        ) {
          autoAdvanceLocksRef.current.delete(key);
          continue;
        }

        // Skip if paused
        if (order.autoAdvancePaused) {
          autoAdvanceLocksRef.current.delete(key);
          continue;
        }

        // Skip if already at target status
        if (canonicalStatus === canonicalTarget) {
          autoAdvanceLocksRef.current.delete(key);
          continue;
        }

        // Check if countdown has expired
        const targetTimestamp = order.autoAdvanceAt
          ? new Date(order.autoAdvanceAt).getTime()
          : NaN;

        if (Number.isNaN(targetTimestamp)) {
          autoAdvanceLocksRef.current.delete(key);
          continue;
        }

        const diff = Math.ceil((targetTimestamp - nowTs) / 1000);
        const countdown = diff <= 0 ? 0 : diff;

        if (countdown === 0) {
          const lockEntry = autoAdvanceLocksRef.current.get(key);
          const isLocked =
            lockEntry && nowTs - lockEntry < ADVANCE_LOCK_TIMEOUT_MS;

          if (!isLocked) {
            // Set lock with current timestamp
            autoAdvanceLocksRef.current.set(key, nowTs);

            try {
              await orderService.updateOrderStatus(order.id, target);
              console.log(
                `[Auto-Advance] Advanced order ${order.orderNumber} to ${target}`
              );
            } catch (error) {
              console.error(
                `[Auto-Advance] Failed to advance order ${order.orderNumber}:`,
                error
              );
              // Clear lock on failure so it can retry
              autoAdvanceLocksRef.current.delete(key);
            }
          }
        } else {
          // Countdown not yet expired, clear any lock
          autoAdvanceLocksRef.current.delete(key);
        }
      }

      // Clean up stale locks
      for (const key of Array.from(autoAdvanceLocksRef.current.keys())) {
        if (!activeKeys.has(key)) {
          autoAdvanceLocksRef.current.delete(key);
        }
      }
    } catch (error) {
      const status =
        error?.status ??
        error?.response?.status ??
        error?.details?.status ??
        null;
      if (status === 401) {
        haltedRef.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        console.warn(
          '[Auto-Advance] Stopped polling: unauthorized (401). Will resume after re-auth.'
        );
      } else {
        console.error('[Auto-Advance] Error processing orders:', error);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [user, can]);

  useEffect(() => {
    // Only run if user is authenticated and has permission
    if (!user || !can('order.status.update')) {
      return;
    }

    haltedRef.current = false;
    console.log('[Auto-Advance] Background service started');

    // Start polling
    intervalRef.current = setInterval(processOrders, POLL_INTERVAL_MS);

    // Initial run
    processOrders();

    return () => {
      console.log('[Auto-Advance] Background service stopped');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear all locks on unmount
      autoAdvanceLocksRef.current.clear();
      isProcessingRef.current = false;
    };
  }, [user, can, processOrders]);
};
