import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Delete, Loader2 } from 'lucide-react';

const NUMBER_PAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['C', '0', '.'],
];

const CASH_DENOMINATIONS = [20, 50, 100, 200, 500, 1000];

const formatMoneyInput = (value) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  const fixed = numeric.toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const roundUp = (value, step) => {
  const numeric = Number(value);
  const size = Number(step);
  if (!Number.isFinite(numeric) || !Number.isFinite(size) || size <= 0) {
    return numeric;
  }
  return Math.ceil(numeric / size) * size;
};

const PaymentModal = ({
  isOpen,
  onClose,
  onProcessPayment,
  calculateTotal,
  currentOrder: _currentOrder,
  discount: _discount,
  calculateSubtotal: _calculateSubtotal,
  calculateDiscountAmount: _calculateDiscountAmount,
}) => {
  const { can } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const totalAmount = useMemo(
    () => calculateTotal(),
    [calculateTotal, _currentOrder, _discount]
  );
  const suggestedAmounts = useMemo(() => {
    const total = Number(totalAmount) || 0;
    if (total <= 0) return [];

    const candidates = [
      { label: 'Exact', value: total },
      { label: 'Next 10', value: roundUp(total, 10) },
      { label: 'Next 50', value: roundUp(total, 50) },
      { label: 'Next 100', value: roundUp(total, 100) },
      { label: 'Next 500', value: roundUp(total, 500) },
    ];

    const seen = new Set();
    const out = [];
    candidates.forEach((candidate) => {
      const valueRaw = Number.isFinite(candidate.value)
        ? candidate.value
        : total;
      const value = Math.round(valueRaw * 100) / 100;
      if (value < total) return;
      const key = String(value);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ...candidate, value });
    });
    return out;
  }, [totalAmount]);
  const paymentValue = useMemo(
    () => parseFloat(paymentAmount) || 0,
    [paymentAmount]
  );
  const change = useMemo(() => {
    const calculated = paymentValue - totalAmount;
    return calculated >= 0 ? calculated : 0;
  }, [paymentValue, totalAmount]);
  const paymentIsSufficient = useMemo(
    () => paymentValue >= totalAmount,
    [paymentValue, totalAmount]
  );

  const handlePaymentAmountChange = (e) => {
    const value = e.target.value;
    // Only allow numbers and decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setPaymentAmount(value);
    }
  };

  const setPaymentAmountFromNumber = useCallback((value) => {
    setPaymentAmount(formatMoneyInput(value));
  }, []);

  const handleAddDenomination = useCallback((amount) => {
    const delta = Number(amount || 0);
    setPaymentAmount((prev) => {
      const current = parseFloat(prev);
      const base = Number.isFinite(current) ? current : 0;
      return formatMoneyInput(base + delta);
    });
  }, []);

  const handleNumberClick = useCallback((number) => {
    setPaymentAmount((prev) => {
      if (number === '.' && prev.includes('.')) return prev;
      return prev + number;
    });
  }, []);

  const handleClear = useCallback(() => {
    setPaymentAmount('');
  }, []);

  const handleBackspace = useCallback(() => {
    setPaymentAmount((prev) => prev.slice(0, -1));
  }, []);

  const handleProcessPayment = useCallback(async () => {
    if (!paymentIsSufficient || isProcessing) return;

    setIsProcessing(true);

    if (typeof window !== 'undefined') {
      await new Promise((resolve) => {
        if ('requestAnimationFrame' in window) {
          window.requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 16);
        }
      });
    }

    try {
      const success = await onProcessPayment({
        tenderedAmount: paymentValue,
        change,
      });

      if (success) {
        setPaymentAmount('');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    paymentIsSufficient,
    isProcessing,
    onProcessPayment,
    paymentValue,
    change,
  ]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (isProcessing) return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.() || '';
      const isTypingField = tagName === 'input' || tagName === 'textarea';

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === 'Enter') {
        if (!paymentIsSufficient || !can('payment.process')) return;
        event.preventDefault();
        handleProcessPayment();
        return;
      }

      if (!isTypingField && event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
        return;
      }

      if (!isTypingField && event.key === 'Delete') {
        event.preventDefault();
        handleClear();
        return;
      }

      if (!isTypingField && /^[0-9.]$/.test(event.key)) {
        event.preventDefault();
        handleNumberClick(event.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    can,
    handleBackspace,
    handleClear,
    handleNumberClick,
    handleProcessPayment,
    isOpen,
    isProcessing,
    onClose,
    paymentIsSufficient,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Complete Payment</CardTitle>
            <CardDescription>Enter payment amount</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-3xl font-bold">₱{totalAmount.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Total amount due</p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="payment-amount"
                className="block text-sm font-medium mb-2"
              >
                Payment Amount
              </label>
              <Input
                id="payment-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={paymentAmount}
                onChange={handlePaymentAmountChange}
                className="text-lg text-center"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Quick cash
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {suggestedAmounts.map((suggestion) => (
                  <Button
                    key={suggestion.label}
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 text-sm font-semibold"
                    disabled={isProcessing}
                    onClick={() => setPaymentAmountFromNumber(suggestion.value)}
                    title={`${suggestion.label} (ƒ,ñ${formatMoneyInput(suggestion.value)})`}
                  >
                    {suggestion.label === 'Exact'
                      ? 'Exact'
                      : `ƒ,ñ${formatMoneyInput(suggestion.value)}`}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {CASH_DENOMINATIONS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 text-sm font-semibold"
                    disabled={isProcessing}
                    onClick={() => handleAddDenomination(value)}
                    title={`Add ƒ,ñ${formatMoneyInput(value)}`}
                  >
                    ƒ,ñ{formatMoneyInput(value)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Press <span className="font-medium">Enter</span> to process
                and <span className="font-medium">Esc</span> to close.
              </p>
            </div>

            {/* Number Keyboard */}
            <div className="grid grid-cols-3 gap-2">
              {NUMBER_PAD_LAYOUT.map((row, rowIndex) =>
                row.map((button) => (
                  <Button
                    key={`${rowIndex}-${button}`}
                    type="button"
                    variant="outline"
                    className="h-12 text-lg font-semibold"
                    onClick={() => {
                      if (button === 'C') {
                        handleClear();
                      } else {
                        handleNumberClick(button);
                      }
                    }}
                  >
                    {button}
                  </Button>
                ))
              )}
              <Button
                type="button"
                variant="outline"
                className="h-12 col-span-3"
                onClick={handleBackspace}
              >
                <Delete className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-center">
              <p className="text-2xl font-semibold text-green-600">
                ₱{change.toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">Change</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            className="flex-1"
            onClick={handleProcessPayment}
            disabled={
              !paymentIsSufficient || !can('payment.process') || isProcessing
            }
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Payment'
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default PaymentModal;
