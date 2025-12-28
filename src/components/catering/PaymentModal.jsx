import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PaymentModal = ({
  open,
  onOpenChange,
  event,
  onPaymentSubmit,
  totals,
  isSyncing = false,
  disableDeposit = false,
  forceFullPayment = false,
}) => {
  const shouldForceFullPayment = forceFullPayment || disableDeposit;
  const [paymentType, setPaymentType] = useState(() =>
    shouldForceFullPayment ? 'full' : 'deposit'
  ); // 'deposit' or 'full'
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash', 'card', 'mobile'
  const [isProcessing, setIsProcessing] = useState(false);

  const total = useMemo(() => {
    if (totals?.total !== undefined) {
      return Number(totals.total) || 0;
    }
    return Number(event?.estimatedTotal || event?.total || 0);
  }, [event, totals]);

  const paymentStatus = String(
    event?.paymentStatus || event?.payment_status || ''
  )
    .trim()
    .toLowerCase();
  const depositPaid = Boolean(event?.depositPaid || event?.deposit_paid);
  const hasPartial = depositPaid || paymentStatus === 'partial';
  const isPaid = paymentStatus === 'paid';

  const depositAmount = useMemo(() => {
    const backendDeposit = Number(event?.depositAmount || event?.deposit || 0);
    // If backend doesn't provide deposit amount, calculate 50% of total
    if (backendDeposit > 0) {
      return backendDeposit;
    }
    return total * 0.5;
  }, [event, total]);

  const paidAmount = useMemo(() => {
    const rawPaid = event?.totalPaid ?? event?.total_paid;
    if (rawPaid !== undefined && rawPaid !== null && rawPaid !== '') {
      const numericPaid = Number(rawPaid) || 0;
      if (numericPaid > 0) {
        return numericPaid;
      }
    }
    if (isPaid) return total;
    if (hasPartial) return depositAmount;
    return 0;
  }, [event, isPaid, hasPartial, depositAmount, total]);

  const recentPayment = useMemo(() => {
    const rawRecent = event?.recentPayment ?? event?.recent_payment;
    if (rawRecent !== undefined && rawRecent !== null && rawRecent !== '') {
      const numericRecent = Number(rawRecent) || 0;
      if (numericRecent > 0) {
        return numericRecent;
      }
    }
    if (isPaid) return total;
    if (hasPartial) return depositAmount;
    return 0;
  }, [event, isPaid, hasPartial, depositAmount, total]);

  const remainingDue = useMemo(() => {
    return Math.max(0, total - paidAmount);
  }, [total, paidAmount]);

  const amountToPay = useMemo(() => {
    return paymentType === 'deposit' ? depositAmount : remainingDue;
  }, [paymentType, depositAmount, remainingDue]);

  const remainingBalance = useMemo(() => {
    if (paymentType === 'full') return 0;
    return total - depositAmount;
  }, [paymentType, total, depositAmount]);

  useEffect(() => {
    if (shouldForceFullPayment && paymentType === 'deposit') {
      setPaymentType('full');
    }
  }, [shouldForceFullPayment, paymentType]);

  const handlePayment = async () => {
    if (isSyncing) return;
    setIsProcessing(true);
    try {
      await onPaymentSubmit?.({
        eventId: event?.id,
        paymentType,
        paymentMethod,
        amount: amountToPay,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const paymentMethods = [
    {
      id: 'cash',
      name: 'Cash',
      icon: Banknote,
      description: 'Pay with cash on event day',
    },
    {
      id: 'card',
      name: 'Card',
      icon: CreditCard,
      description: 'Credit or debit card',
    },
    {
      id: 'mobile',
      name: 'Mobile Wallet',
      icon: Smartphone,
      description: 'GCash, PayMaya, etc.',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Process Payment
          </DialogTitle>
          <DialogDescription>
            {event?.name} • {event?.client || event?.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isSyncing ? (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Syncing latest amounts...
              </div>
            </div>
          ) : null}

          {/* Payment Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Payment Type</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(value) => {
                if (value === 'deposit' && shouldForceFullPayment) return;
                setPaymentType(value);
              }}
            >
              {/* Deposit Option */}
              <div
                className={cn(
                  'relative rounded-xl border-2 p-4 transition-all',
                  paymentType === 'deposit'
                    ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                    : 'border-border bg-card',
                  shouldForceFullPayment
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:border-primary/50 hover:bg-muted/50'
                )}
                onClick={() => {
                  if (shouldForceFullPayment) return;
                  setPaymentType('deposit');
                }}
                aria-disabled={shouldForceFullPayment}
                title={
                  shouldForceFullPayment
                    ? '50% deposit is disabled for this order.'
                    : undefined
                }
              >
                <div className="flex items-start gap-4">
                  <RadioGroupItem
                    value="deposit"
                    id="deposit"
                    className="mt-1"
                    disabled={disableDeposit}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="deposit"
                        className={cn(
                          'text-lg font-semibold',
                          shouldForceFullPayment
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer'
                        )}
                      >
                        50% Deposit
                      </Label>
                      <Badge variant="secondary" className="text-xs">
                        Recommended
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Half of catering order to secure your reservation
                    </p>
                    <div className="flex items-baseline gap-2 pt-2">
                      <span className="text-3xl font-bold text-primary">
                        ₱{depositAmount.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Remaining: ₱{remainingBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                {paymentType === 'deposit' && (
                  <div className="absolute -top-2 -right-2">
                    <div className="rounded-full bg-primary p-1">
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Full Payment Option */}
              <div
                className={cn(
                  'relative cursor-pointer rounded-xl border-2 p-4 transition-all',
                  paymentType === 'full'
                    ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                )}
                onClick={() => setPaymentType('full')}
              >
                <div className="flex items-start gap-4">
                  <RadioGroupItem value="full" id="full" className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label
                      htmlFor="full"
                      className="text-lg font-semibold cursor-pointer"
                    >
                      Full Payment
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Pay the full amount now
                    </p>
                    <div className="flex items-baseline gap-2 pt-2">
                      <span className="text-3xl font-bold text-primary">
                        ₱{total.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Recent payment: ₱{recentPayment.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                {paymentType === 'full' && (
                  <div className="absolute -top-2 -right-2">
                    <div className="rounded-full bg-primary p-1">
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </RadioGroup>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Payment Method</Label>
            <div className="grid grid-cols-3 gap-3">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-8 w-8',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {method.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground px-1">
              {paymentMethods.find((m) => m.id === paymentMethod)?.description}
            </p>
          </div>

          {/* Payment Summary */}
          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Wallet className="h-4 w-4" />
              Payment Summary
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining Balance</span>
                <span className="font-medium">₱{remainingDue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-primary/20">
                <span className="font-semibold">Amount to Pay</span>
                <span className="text-xl font-bold text-primary">
                  ₱{amountToPay.toFixed(2)}
                </span>
              </div>
              {paymentType === 'deposit' && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Balance Due on Event</span>
                  <span className="font-medium">
                    ₱{remainingBalance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Information Alert */}
          <div className="flex gap-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-blue-900">
              <p className="font-medium mb-1">Payment Confirmation</p>
              <p className="text-blue-700">
                {paymentMethod === 'cash'
                  ? 'Please prepare the exact amount. A receipt will be provided upon payment.'
                  : 'You will be redirected to complete the payment securely.'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {remainingDue <= 0 ? (
            <p className="text-xs text-muted-foreground">
              Payment is complete. Add menu items to reopen payment.
            </p>
          ) : null}
          <Button
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePayment}
            disabled={
              isProcessing ||
              isSyncing ||
              remainingDue <= 0 ||
              (shouldForceFullPayment && paymentType !== 'full')
            }
            size="lg"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Confirm Payment ₱{amountToPay.toFixed(2)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
