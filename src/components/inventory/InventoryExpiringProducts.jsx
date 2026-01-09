import React, { useMemo, useState } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react';

const MAX_VISIBLE_ITEMS = 6;

const normalizeExpiryDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const getDaysToExpiry = (value) => {
  const expiry = normalizeExpiryDate(value);
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const buildBadge = (daysToExpiry) => {
  if (daysToExpiry < 0) {
    return { label: 'Expired', variant: 'destructive' };
  }
  if (daysToExpiry === 0) {
    return { label: 'Expires today', variant: 'destructive' };
  }
  const unit = daysToExpiry === 1 ? 'day' : 'days';
  return { label: `${daysToExpiry} ${unit} left`, variant: 'secondary' };
};

const InventoryExpiringProducts = ({
  items = [],
  loading = false,
  thresholdDays = 5,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const expiringItems = useMemo(() => {
    const mapped = (items || [])
      .map((item) => {
        const days =
          typeof item.daysToExpiry === 'number'
            ? item.daysToExpiry
            : getDaysToExpiry(item.expiryDate || item.expiry_date);
        if (days === null || days > thresholdDays) return null;
        return {
          ...item,
          daysToExpiry: days,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    return mapped;
  }, [items, thresholdDays]);

  const hasMoreItems = expiringItems.length > MAX_VISIBLE_ITEMS;
  const visibleItems =
    isExpanded || !hasMoreItems
      ? expiringItems
      : expiringItems.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <FeaturePanelCard
      title="Upcoming Expired Products"
      titleStyle="accent"
      titleIcon={CalendarClock}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description={`Items expiring within the next ${thresholdDays} days`}
      headerContent={
        loading ? (
          <div className="flex h-6 items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="text-xs">Updating...</span>
          </div>
        ) : null
      }
      contentClassName="space-y-4"
    >
      <div className="space-y-4">
        {visibleItems.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No items expiring soon.
          </p>
        )}
        {visibleItems.map((item) => {
          const badge = buildBadge(item.daysToExpiry);
          const rawQty = item.quantity ?? item.currentStock;
          const qty = Number(rawQty);
          const hasQty = Number.isFinite(qty);
          const unit = item.unit ? ` ${item.unit}` : '';
          return (
            <div
              key={item.id || item.name}
              className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0"
            >
              <div className="rounded-full bg-muted p-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{item.name}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires on {formatDate(item.expiryDate || item.expiry_date)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasQty ? `${qty}${unit} available` : 'Quantity not set'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <span>
          Showing {visibleItems.length} of {expiringItems.length} items
        </span>
        {hasMoreItems ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? 'Collapse expiring inventory list'
                : 'Expand expiring inventory list'
            }
          >
            {isExpanded ? 'Show Less' : 'Show All'}
          </Button>
        ) : null}
      </div>
    </FeaturePanelCard>
  );
};

export default InventoryExpiringProducts;
