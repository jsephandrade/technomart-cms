import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';

const PaymentMethodsCard = ({ methodActive, setMethodActive }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Methods</CardTitle>
        <CardDescription>Configure accepted payment types</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center border p-3 rounded-md">
            <div className="flex items-center gap-3">
              <Banknote className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Cash</p>
                <p className="text-xs text-muted-foreground">
                  Physical currency
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {methodActive.cash ? 'Active' : 'Inactive'}
              </span>
              <Switch
                checked={methodActive.cash}
                onCheckedChange={(v) =>
                  setMethodActive((prev) => ({ ...prev, cash: v }))
                }
                aria-label="Toggle cash method"
              />
            </div>
          </div>

          <div className="flex justify-between items-center border p-3 rounded-md">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Credit/Debit Cards</p>
                <p className="text-xs text-muted-foreground">
                  Visa, Mastercard, Amex
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {methodActive.card ? 'Active' : 'Inactive'}
              </span>
              <Switch
                checked={methodActive.card}
                onCheckedChange={(v) =>
                  setMethodActive((prev) => ({ ...prev, card: v }))
                }
                aria-label="Toggle card method"
              />
            </div>
          </div>

          <div className="flex justify-between items-center border p-3 rounded-md">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium">Mobile Payments</p>
                <p className="text-xs text-muted-foreground">
                  Apple Pay, Google Pay
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {methodActive.mobile ? 'Active' : 'Inactive'}
              </span>
              <Switch
                checked={methodActive.mobile}
                onCheckedChange={(v) =>
                  setMethodActive((prev) => ({ ...prev, mobile: v }))
                }
                aria-label="Toggle mobile method"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentMethodsCard;
