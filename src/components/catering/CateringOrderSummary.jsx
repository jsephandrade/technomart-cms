import React, { useMemo } from 'react';
import { Trash2, Plus, Minus, ShoppingCart, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CateringOrderSummary = ({
  selectedItems = {},
  onUpdateQuantity,
  onRemoveItem,
  onClearAll,
  discount = 0,
  discountType = 'fixed', // 'fixed' or 'percentage'
  onDiscountChange,
  onDiscountTypeChange,
  canProcessPayment = false,
  onProcessPayment,
  itemCount = 0,
  disableEdits = false,
  disablePayment = false,
}) => {
  const itemsArray = useMemo(() => {
    return Object.values(selectedItems).filter(Boolean);
  }, [selectedItems]);

  const subtotal = useMemo(() => {
    return itemsArray.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 0;
      return sum + price * quantity;
    }, 0);
  }, [itemsArray]);

  const discountAmount = useMemo(() => {
    const discountValue = Number(discount) || 0;
    if (discountType === 'percentage') {
      return (subtotal * discountValue) / 100;
    }
    return discountValue;
  }, [discount, discountType, subtotal]);

  const total = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const handleQuantityChange = (item, delta) => {
    if (disableEdits) return;
    const newQuantity = Math.max(1, (item.quantity || 1) + delta);
    onUpdateQuantity?.(item.id, newQuantity);
  };

  if (itemsArray.length === 0) {
    return null;
  }

  return (
    <Card className="sticky top-4 flex flex-col gap-4 overflow-hidden border-2 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
              <ShoppingCart className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Order Summary</CardTitle>
              <p className="text-xs text-muted-foreground">
                {itemsArray.length} {itemsArray.length === 1 ? 'item' : 'items'}{' '}
                in cart
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="icon"
            className="h-9 w-9"
            onClick={onClearAll}
            disabled={disableEdits}
            aria-label="Clear order"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-col gap-4">
          <ScrollArea className="h-[360px] pr-1">
            <div className="space-y-3">
              {itemsArray.map((item) => {
                const unitPrice = Number(item.price) || 0;
                const quantity = Number(item.quantity) || 1;
                const itemTotal = unitPrice * quantity;
                return (
                  <div
                    key={item.id}
                    className="group relative flex items-center gap-3 overflow-hidden rounded-md border border-border/60 bg-background/80 p-2 shadow-sm"
                  >
                    <div className="relative z-10 flex flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium leading-tight text-foreground line-clamp-1">
                          {item.name}
                        </p>
                        <span className="text-xs font-semibold text-foreground">
                          ₱{itemTotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleQuantityChange(item, -1)}
                            disabled={disableEdits || quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs font-medium leading-none text-foreground min-w-[32px] text-center">
                            {quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleQuantityChange(item, 1)}
                            disabled={disableEdits}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>₱{unitPrice.toFixed(2)} each</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => onRemoveItem?.(item.id)}
                            disabled={disableEdits}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-start justify-between text-sm text-emerald-600">
                <span>
                  Discount (
                  {discountType === 'percentage'
                    ? `${discount}%`
                    : `₱${discount}`}
                  )
                </span>
                <span>-₱{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold text-foreground">
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              size="sm"
              variant="default"
              disabled={!canProcessPayment || disablePayment}
              onClick={onProcessPayment}
            >
              <CreditCard className="mr-2 h-4 w-4" /> Process Payment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CateringOrderSummary;
