import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn, formatOrderNumber } from '@/lib/utils';

const LS_COMPLETED_ITEMS_KEY = 'pos_customer_display_completed_items';

const loadCompletedItems = () => {
  try {
    const raw = localStorage.getItem(LS_COMPLETED_ITEMS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => typeof value === 'string'));
  } catch {
    return new Set();
  }
};

const STATUS_CANONICAL_MAP = {
  pending: 'new',
  accepted: 'accepted',
  'in-queue': 'accepted',
  in_queue: 'accepted',
  in_progress: 'in_prep',
  'in-progress': 'in_prep',
  preparing: 'in_prep',
  ready: 'staged',
  staged: 'staged',
  handoff: 'handoff',
  serving: 'now_serving',
};

const normalizeStatus = (value) => {
  if (!value) return '';
  const normalized = String(value).toLowerCase().trim();
  return STATUS_CANONICAL_MAP[normalized] || normalized;
};

const resolveOrderStatus = (order) => {
  const candidates = [
    order?.canonicalStatus,
    order?.canonical_status,
    order?.status,
    order?.rawStatus,
    order?.raw_status,
  ];
  for (const value of candidates) {
    const result = normalizeStatus(value);
    if (result) return result;
  }
  return '';
};

const getOrderTimestamp = (order) => {
  const candidates = [
    order?.updatedAt,
    order?.updated_at,
    order?.phaseStartedAt,
    order?.phase_started_at,
    order?.createdAt,
    order?.created_at,
    order?.timeReceived,
    order?.time_received,
  ];
  for (const input of candidates) {
    if (!input) continue;
    const date = new Date(input);
    const time = date.getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
};

const getOrderDisplayNumber = (order) => {
  const candidates = [
    order?.orderNumber,
    order?.order_number,
    order?.displayNumber,
    order?.display_number,
    order?.externalOrderId,
    order?.external_order_id,
    order?.id,
  ];
  for (const value of candidates) {
    if (value === null || value === undefined) continue;
    const formatted = formatOrderNumber(value);
    if (formatted) return formatted;
  }
  if (order?.id) {
    const fallback = String(order.id).slice(-4).toUpperCase();
    return fallback.padStart(4, '0');
  }
  return '----';
};

const getOrderKey = (order) =>
  order?.id ||
  order?.orderNumber ||
  order?.order_number ||
  order?.displayNumber ||
  order?.display_number ||
  getOrderDisplayNumber(order);

const getItemLabel = (item) =>
  item?.name ||
  item?.title ||
  item?.itemName ||
  item?.productName ||
  item?.sku ||
  'Item';

const getItemQuantity = (item) => {
  const q = Number(item?.quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
};

const preparingStatuses = new Set(['in_prep', 'preparing', 'in_progress']);
const servingStatuses = new Set(['now_serving', 'staged', 'ready', 'handoff']);

const Section = ({
  title,
  accent,
  orders,
  emptyText,
  className,
  expandedIds,
  onToggle,
  completedItems,
  onToggleItem,
}) => {
  const hasTitle = Boolean(title);
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 shadow-sm',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center',
          hasTitle ? 'justify-between' : 'justify-end'
        )}
      >
        {hasTitle ? (
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {title}
          </p>
        ) : null}
        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-widest',
            accent
          )}
        >
          {orders.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {orders.length ? (
          orders.slice(0, 6).map((order) => {
            const orderKey = getOrderKey(order);
            const isExpanded = expandedIds.has(orderKey);
            const items = Array.isArray(order.items) ? order.items : [];

            const toggle = () => onToggle(orderKey);
            const handleKeyDown = (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
              }
            };

            return (
              <div
                key={orderKey}
                className="rounded-2xl border border-border/60 bg-background px-4 py-4 text-center shadow-sm transition-colors hover:border-primary/60"
              >
                <button
                  type="button"
                  className="flex w-full flex-col items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={toggle}
                  onKeyDown={handleKeyDown}
                >
                  <p className="text-3xl font-black tracking-[0.25em] text-foreground sm:text-4xl">
                    {getOrderDisplayNumber(order)}
                  </p>
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                    {isExpanded ? 'Hide items' : 'View items'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-2 border-t border-dashed border-border/60 pt-3 text-left">
                    {items.length ? (
                      items.map((item, idx) => {
                        const itemKey = `${orderKey}-item-${idx}`;
                        const checked = completedItems.has(itemKey);
                        return (
                          <label
                            key={itemKey}
                            className="flex items-start gap-3 text-sm text-foreground"
                          >
                            <span className="flex flex-1 items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                                checked={checked}
                                onChange={() => onToggleItem(itemKey)}
                              />
                              <span className="font-semibold">
                                {getItemQuantity(item)}x
                              </span>
                              <span className="text-muted-foreground">
                                {getItemLabel(item)}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No items available.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
};

const CustomerDisplay = ({ queue }) => {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [completedItems, setCompletedItems] = useState(loadCompletedItems);

  useEffect(() => {
    try {
      if (!completedItems.size) {
        localStorage.removeItem(LS_COMPLETED_ITEMS_KEY);
        return;
      }
      localStorage.setItem(
        LS_COMPLETED_ITEMS_KEY,
        JSON.stringify(Array.from(completedItems))
      );
    } catch {}
  }, [completedItems]);

  const orders = useMemo(() => {
    if (!queue) return [];
    if (Array.isArray(queue)) return queue;
    if (Array.isArray(queue.orders)) return queue.orders;
    if (Array.isArray(queue.data?.orders)) return queue.data.orders;
    return [];
  }, [queue]);

  const { preparingOrders, servingOrders } = useMemo(() => {
    const prep = [];
    const serving = [];

    orders.forEach((order) => {
      const status = resolveOrderStatus(order);
      if (preparingStatuses.has(status)) {
        prep.push(order);
      } else if (servingStatuses.has(status)) {
        serving.push(order);
      }
    });

    const sorter = (a, b) => getOrderTimestamp(a) - getOrderTimestamp(b);
    prep.sort(sorter);
    serving.sort(sorter);

    return { preparingOrders: prep, servingOrders: serving };
  }, [orders]);

  const handleToggle = useCallback((orderKey) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderKey)) {
        next.delete(orderKey);
      } else {
        next.add(orderKey);
      }
      return next;
    });
  }, []);

  const handleToggleItem = useCallback((itemKey) => {
    setCompletedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }, []);

  return (
    <Card className="h-full border border-border/60 bg-card/90 shadow-sm">
      <CardHeader className="hidden space-y-2 lg:block">
        <div className="flex w-full items-center gap-4 text-4xl font-semibold uppercase tracking-[0.4em] text-muted-foreground">
          <span className="flex-1 text-center text-foreground">Preparing</span>
          <span className="flex-1 text-center text-foreground">
            Now Serving
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-6 pb-8 pt-6 sm:px-8 lg:p-6 lg:pt-0">
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:gap-5">
          <div className="flex flex-col items-center gap-4 lg:items-stretch">
            <p className="text-3xl font-semibold uppercase tracking-[0.4em] text-foreground sm:text-4xl lg:hidden">
              Preparing
            </p>
            <Section
              title=""
              accent="text-amber-600 dark:text-amber-300"
              orders={preparingOrders}
              emptyText="No orders currently in preparation."
              className="w-full bg-blue-500/10 dark:bg-blue-500/20"
              expandedIds={expandedIds}
              onToggle={handleToggle}
              completedItems={completedItems}
              onToggleItem={handleToggleItem}
            />
          </div>
          <div className="flex flex-col items-center gap-4 lg:items-stretch">
            <p className="text-3xl font-semibold uppercase tracking-[0.4em] text-foreground sm:text-4xl lg:hidden">
              <span className="block">Now</span>
              <span className="block">Serving</span>
            </p>
            <Section
              title=""
              accent="text-emerald-600 dark:text-emerald-300"
              orders={servingOrders}
              emptyText="No orders ready for pickup."
              className="w-full bg-emerald-500/10 dark:bg-emerald-500/20 lg:border-l lg:border-border/60 lg:pl-6"
              expandedIds={expandedIds}
              onToggle={handleToggle}
              completedItems={completedItems}
              onToggleItem={handleToggleItem}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomerDisplay;
