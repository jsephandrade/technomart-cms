import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomBadge } from '@/components/ui/custom-badge';
import {
  ArrowDownUp,
  ArrowUpDown,
  Banknote,
  Calendar,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  MoreVertical,
  Receipt,
  Smartphone,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import PaymentsHeader from '@/components/payments/PaymentsHeader';
import PaymentsFilters from '@/components/payments/PaymentsFilters';
import { paymentsService } from '@/api/services/paymentsService';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { formatOrderNumber } from '@/lib/utils';

const Payments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateRange, setDateRange] = useState('7d');

  const [methodActive, setMethodActive] = useState({
    cash: true,
    card: true,
    mobile: true,
  });

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await paymentsService.list({
        timeRange: dateRange,
        status: selectedStatus === 'all' ? '' : selectedStatus,
      });
      const mapped = (list || []).map((p) => {
        const resolvedOrderNumber =
          p.orderNumber ||
          p.order_number ||
          p.orderReference ||
          p.order_reference ||
          '';
        const orderNumber = resolvedOrderNumber
          ? String(resolvedOrderNumber)
          : '';
        const orderReference =
          p.orderReference || p.order_reference || orderNumber;
        return {
          ...p,
          orderNumber,
          orderReference,
          date: p.date || p.timestamp || new Date().toISOString(),
        };
      });
      setPayments(mapped);
    } catch (e) {
      setError(e?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [dateRange, selectedStatus]);

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'cash':
        return <Banknote className="h-4 w-4" />;
      case 'card':
        return <CreditCard className="h-4 w-4" />;
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      default:
        return <CircleDollarSign className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'refunded':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getOrderLabel = useCallback((payment) => {
    const raw =
      payment?.orderNumber || payment?.orderReference || payment?.orderId || '';
    const formatted = formatOrderNumber(raw);
    if (formatted) {
      return formatted;
    }
    return raw ? String(raw) : '';
  }, []);

  const formatPaymentDate = (value) => {
    if (!value) {
      return '';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredPayments = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return payments.filter((payment) => {
      const orderLabel = getOrderLabel(payment).toLowerCase();
      const orderIdText = String(payment.orderId || '').toLowerCase();
      const customerText = (payment.customer || '').toLowerCase();
      const referenceText = (payment.reference || '').toLowerCase();
      const matchesSearch =
        orderLabel.includes(term) ||
        orderIdText.includes(term) ||
        customerText.includes(term) ||
        referenceText.includes(term);
      const matchesStatus =
        selectedStatus === 'all' || payment.status === selectedStatus;
      const methodIsActive = methodActive[payment.method] ?? true;
      return matchesSearch && matchesStatus && methodIsActive;
    });
  }, [payments, searchTerm, selectedStatus, methodActive, getOrderLabel]);

  const sortedPayments = useMemo(
    () =>
      [...filteredPayments].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [filteredPayments]
  );

  const MAX_VISIBLE_PAYMENTS = 10;
  const hasMorePayments = sortedPayments.length > MAX_VISIBLE_PAYMENTS;
  const displayedPayments =
    !hasMorePayments || isExpanded
      ? sortedPayments
      : sortedPayments.slice(0, MAX_VISIBLE_PAYMENTS);
  const displayedCount = displayedPayments.length;

  const totalForSelectedStatus = useMemo(
    () =>
      filteredPayments
        .filter((p) => p.status !== 'refunded')
        .reduce((acc, cur) => acc + cur.amount, 0)
        .toFixed(2),
    [filteredPayments]
  );

  const handleRefund = async (paymentId) => {
    try {
      const updated = await paymentsService.refund(paymentId);
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, ...updated } : p))
      );
    } catch (e) {
      // optionally show toast
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const cfg = await paymentsService.getConfig();
        setMethodActive({
          cash: Boolean(cfg.cash),
          card: Boolean(cfg.card),
          mobile: Boolean(cfg.mobile),
        });
      } catch {}
    })();
  }, []);

  const updateMethod = async (key, value) => {
    const next = { ...methodActive, [key]: value };
    setMethodActive(next);
    try {
      await paymentsService.updateConfig({
        cash: next.cash,
        card: next.card,
        mobile: next.mobile,
      });
    } catch {}
  };

  const handleDownloadInvoice = async (payment) => {
    try {
      const blob = await paymentsService.downloadInvoiceBlob(payment.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${payment.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      // optionally toast error
    }
  };

  return (
    <div className="grid w-full gap-4 max-w-[640px] sm:max-w-[720px] mx-auto md:mx-0 md:max-w-none md:grid-cols-3">
      <div className="md:col-span-2 space-y-4">
        <FeaturePanelCard
          title="Payment Management"
          titleStyle="accent"
          titleIcon={CreditCard}
          titleAccentClassName="px-3 py-1 text-xs md:text-sm"
          titleClassName="text-xs md:text-sm"
          description="Track and process payments"
          headerActions={<PaymentsHeader />}
          contentClassName="space-y-4"
        >
          {error ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <PaymentsFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />

          <div className="rounded-md border">
            <div
              className="relative w-full overflow-hidden transition-[max-height] duration-500 ease-in-out"
              style={{ maxHeight: isExpanded ? '80rem' : '36rem' }}
            >
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left font-medium">
                        <div className="flex items-center gap-1">
                          Order # <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </th>
                      <th className="h-10 px-4 text-left font-medium">
                        <div className="flex items-center gap-1">
                          Date <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </th>
                      <th className="h-10 px-4 text-left font-medium">
                        Method
                      </th>
                      <th className="h-10 px-4 text-left font-medium">
                        <div className="flex items-center gap-1">
                          Amount <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </th>
                      <th className="h-10 px-4 text-left font-medium">
                        Status
                      </th>
                      <th className="h-10 px-4 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="h-24 text-center">
                          Loading...
                        </td>
                      </tr>
                    ) : sortedPayments.length > 0 ? (
                      displayedPayments.map((payment) => {
                        const orderLabel = getOrderLabel(payment);
                        const orderDisplay = orderLabel
                          ? `#${orderLabel}`
                          : '#—';
                        return (
                          <tr
                            key={payment.id}
                            className="border-b transition-colors hover:bg-muted/50"
                          >
                            <td className="p-4 align-middle font-medium">
                              {orderDisplay}
                            </td>
                            <td className="p-4 align-middle whitespace-nowrap">
                              {formatPaymentDate(payment.date)}
                            </td>
                            <td className="p-4 align-middle">
                              <div className="flex items-center gap-2">
                                {getPaymentMethodIcon(payment.method)}
                                <span className="capitalize">
                                  {payment.method}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 align-middle">
                              {`\u20B1${payment.amount.toFixed(2)}`}
                            </td>
                            <td className="p-4 align-middle">
                              <CustomBadge
                                variant={getStatusBadgeVariant(payment.status)}
                                className="capitalize"
                              >
                                {payment.status}
                              </CustomBadge>
                            </td>
                            <td className="p-4 align-middle text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleDownloadInvoice(payment)
                                    }
                                  >
                                    <Download className="mr-2 h-4 w-4" />{' '}
                                    Download Invoice
                                  </DropdownMenuItem>
                                  {payment.status === 'completed' && (
                                    <DropdownMenuItem
                                      onClick={() => handleRefund(payment.id)}
                                    >
                                      <ArrowDownUp className="mr-2 h-4 w-4" />{' '}
                                      Process Refund
                                    </DropdownMenuItem>
                                  )}
                                  {payment.status === 'failed' && (
                                    <DropdownMenuItem>
                                      <ArrowDownUp className="mr-2 h-4 w-4" />{' '}
                                      Retry Payment
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="h-24 text-center">
                          No transactions match your search criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {hasMorePayments && !isExpanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/80 to-transparent" />
              )}
            </div>
          </div>

          {hasMorePayments && (
            <div className="flex justify-start md:justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="group flex items-center gap-1"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
                aria-label={
                  isExpanded
                    ? 'Collapse payment transactions'
                    : 'Expand payment transactions'
                }
              >
                <span className="text-sm font-medium">
                  {isExpanded ? 'Show Less' : 'Show All Payments'}
                </span>
                <span className="rounded-full border border-border bg-background p-1 transition-transform duration-300 ease-in-out group-hover:translate-y-0.5">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </span>
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {displayedCount} of {sortedPayments.length} matching
              transactions (out of {payments.length} total)
            </span>
            <span className="text-sm text-foreground">
              Total:{' '}
              <span className="font-semibold">
                {`\u20B1${totalForSelectedStatus}`}
              </span>
            </span>
          </div>
        </FeaturePanelCard>
      </div>

      <div className="space-y-4">
        <FeaturePanelCard
          title="Recent Transactions"
          titleStyle="accent"
          titleIcon={Receipt}
          titleAccentClassName="px-3 py-1 text-xs md:text-sm"
          titleClassName="text-xs md:text-sm"
          description="View latest payment activities"
          contentClassName="space-y-4"
        >
          {sortedPayments.length > 0 ? (
            <div className="space-y-4">
              {sortedPayments.slice(0, 5).map((payment) => {
                const orderLabel = getOrderLabel(payment);
                const orderDisplay = orderLabel ? `#${orderLabel}` : '#—';
                return (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-full p-1 ${
                          payment.status === 'completed'
                            ? 'bg-green-100'
                            : payment.status === 'failed'
                              ? 'bg-red-100'
                              : payment.status === 'refunded'
                                ? 'bg-amber-100'
                                : 'bg-gray-100'
                        }`}
                      >
                        {payment.status === 'completed' && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {payment.status === 'failed' && (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                        {payment.status === 'refunded' && (
                          <ArrowDownUp className="h-4 w-4 text-amber-600" />
                        )}
                        {payment.status === 'pending' && (
                          <Calendar className="h-4 w-4 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{orderDisplay}</span>
                          <CustomBadge
                            variant={getStatusBadgeVariant(payment.status)}
                            className="capitalize text-xs"
                          >
                            {payment.status}
                          </CustomBadge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {payment.customer
                            ? payment.customer
                            : 'Walk-in Customer'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {`\u20B1${payment.amount.toFixed(2)}`}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {payment.method}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Receipt className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No recent transactions to display
              </p>
            </div>
          )}
        </FeaturePanelCard>

        <FeaturePanelCard
          title="Payment Methods"
          description="Configure accepted payment types"
          contentClassName="space-y-4"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
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
                  onCheckedChange={(v) => updateMethod('cash', v)}
                  aria-label="Toggle cash method"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
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
                  onCheckedChange={(v) => updateMethod('card', v)}
                  aria-label="Toggle card method"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
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
                  onCheckedChange={(v) => updateMethod('mobile', v)}
                  aria-label="Toggle mobile method"
                />
              </div>
            </div>
          </div>
        </FeaturePanelCard>
      </div>
    </div>
  );
};

export default Payments;
