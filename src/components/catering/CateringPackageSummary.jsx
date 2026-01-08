import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ShoppingCart, CreditCard } from 'lucide-react';

const formatNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(2);
};

const formatQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
};

const CateringPackageSummary = ({
  event,
  selectedPackage,
  canProcessPayment = false,
  onProcessPayment,
  isSaving = false,
}) => {
  const guestCount = Number(event?.attendees ?? event?.guestCount ?? 0);
  const packageName = selectedPackage?.name || event?.packageName || 'Package';
  const packagePrice = Number(
    selectedPackage?.pricePerPax ?? event?.packagePricePerPax ?? 0
  );
  const storedTotal = Number(event?.estimatedTotal ?? event?.total ?? 0);
  const subtotal = storedTotal > 0 ? storedTotal : packagePrice * guestCount;
  const discountAmount = Number(event?.orderDiscount ?? 0);
  const total = Math.max(0, subtotal - discountAmount);

  const items = useMemo(() => {
    const eventItems = Array.isArray(event?.items) ? event.items : [];
    if (eventItems.length > 0) {
      return eventItems.map((item) => ({
        id: item.id || item.menuItemId || item.name,
        name: item.name,
        quantity: item.quantity,
        meta: 'total',
      }));
    }
    const packageItems = Array.isArray(selectedPackage?.items)
      ? selectedPackage.items
      : [];
    return packageItems.map((item) => ({
      id: item.id || item.menuItemId || item.name,
      name: item.name,
      quantity: item.quantityPerPax,
      meta: 'per pax',
    }));
  }, [event, selectedPackage]);

  if (!selectedPackage && !(event?.packageId || event?.package_id)) {
    return (
      <Card className="sticky top-4 flex flex-col gap-4 overflow-hidden border-2 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
              <ShoppingCart className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">
                Package Summary
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Select a package to see the breakdown.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="sticky top-4 flex flex-col gap-4 overflow-hidden border-2 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
            <ShoppingCart className="h-5 w-5 text-primary" strokeWidth={2} />
          </div>
          <div>
            <CardTitle className="text-lg font-bold">Package Summary</CardTitle>
            <p className="text-xs text-muted-foreground">
              {packageName} • {guestCount} attendees
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Price per pax</span>
            <span>PHP {formatNumber(packagePrice)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>PHP {formatNumber(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Discount</span>
              <span>-PHP {formatNumber(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-3 text-base font-semibold text-foreground">
            <span>Total</span>
            <span>PHP {formatNumber(total)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Package Items
          </p>
          {items.length > 0 ? (
            <ScrollArea className="h-[220px] pr-1">
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatQuantity(item.quantity)} {item.meta}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">
              Package items will appear after saving.
            </p>
          )}
        </div>

        <Button
          className="w-full"
          size="sm"
          variant="default"
          disabled={!canProcessPayment || isSaving}
          onClick={onProcessPayment}
        >
          <CreditCard className="mr-2 h-4 w-4" /> Process Payment
        </Button>
      </CardContent>
    </Card>
  );
};

export default CateringPackageSummary;
