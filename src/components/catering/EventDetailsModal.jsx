import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomBadge } from '@/components/ui/custom-badge';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  CalendarDays,
  Users,
  MapPin,
  User,
  Phone,
  Banknote,
  Pencil,
  X,
  Wallet,
  CheckCircle2,
  CreditCard,
  Smartphone,
  AlertCircle,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import cateringService from '@/api/services/cateringService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const normalizeDateInput = (value) => {
  if (!value) return '';
  const stringValue = String(value);
  if (stringValue.includes('T')) {
    return stringValue.split('T')[0];
  }
  if (stringValue.includes(' ')) {
    return stringValue.split(' ')[0];
  }
  return stringValue;
};

const normalizeTimeInput = (value) => {
  if (!value) return '';
  const segments = String(value).split(':');
  if (segments.length < 2) {
    return String(value);
  }
  const hours = (segments[0] || '').padStart(2, '0');
  const minutes = (segments[1] || '').padStart(2, '0');
  return `${hours}:${minutes}`;
};

const getDaysUntilDate = (value) => {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;

  const eventDate = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(eventDate.getTime())) {
    return null;
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const eventStart = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate()
  );

  const diffMs = eventStart.getTime() - todayStart.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const EVENT_DETAILS_SCROLLBAR_STYLES = `
  .event-details-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .event-details-scroll::-webkit-scrollbar {
    display: none;
  }
`;

export const EventDetailsModal = ({
  open,
  onOpenChange,
  event,
  onUpdateEvent,
}) => {
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
  });
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [localEvent, setLocalEvent] = useState(null);

  // Payment form state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('deposit');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  useEffect(() => {
    if (!event) {
      setScheduleForm({
        date: '',
        startTime: '',
        endTime: '',
      });
      setIsEditingSchedule(false);
      setIsEditingPayment(false);
      setLocalEvent(null);
      return;
    }

    setScheduleForm({
      date: normalizeDateInput(event.date),
      startTime: normalizeTimeInput(event.startTime),
      endTime: normalizeTimeInput(event.endTime),
    });
    setIsEditingSchedule(false);
    setIsEditingPayment(false);
    setLocalEvent(event);
  }, [event]);

  const currentEvent = localEvent || event;
  const hasSavedOrder =
    Array.isArray(currentEvent?.items) && currentEvent.items.length > 0;
  const disableDeposit = hasSavedOrder;

  useEffect(() => {
    if (disableDeposit && paymentType === 'deposit') {
      setPaymentType('full');
    }
  }, [disableDeposit, paymentType]);

  if (!event) return null;

  const initialDate = normalizeDateInput(event.date);
  const initialStartTime = normalizeTimeInput(event.startTime);
  const initialEndTime = normalizeTimeInput(event.endTime);
  const hasScheduleChanges =
    scheduleForm.date !== initialDate ||
    scheduleForm.startTime !== initialStartTime ||
    scheduleForm.endTime !== initialEndTime;
  const canEditSchedule = typeof onUpdateEvent === 'function';
  const scheduleDateLabel = event.dateLabel || event.date || 'Not set';
  const scheduleStartTimeLabel = normalizeTimeInput(event.startTime);
  const scheduleEndTimeLabel = normalizeTimeInput(event.endTime);

  const daysUntilEvent = getDaysUntilDate(event?.date);
  const isRescheduleLocked =
    typeof daysUntilEvent === 'number' && daysUntilEvent <= 5;
  const rescheduleLockMessage =
    'Rescheduling is unavailable within 5 days of the event.';

  const contactPerson = event.contactPerson || { name: '', phone: '' };
  const attendeesCount = Number(event.attendees ?? 0);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (
      !event?.id ||
      !canEditSchedule ||
      !hasScheduleChanges ||
      isRescheduleLocked
    )
      return;

    const updates = {};
    if (scheduleForm.date !== initialDate) {
      updates.date = scheduleForm.date || null;
    }
    if (scheduleForm.startTime !== initialStartTime) {
      updates.startTime = scheduleForm.startTime || null;
    }
    if (scheduleForm.endTime !== initialEndTime) {
      updates.endTime = scheduleForm.endTime || null;
    }

    if (Object.keys(updates).length === 0) return;

    setIsSavingSchedule(true);
    try {
      await onUpdateEvent(event.id, updates);
      setIsEditingSchedule(false);
    } catch (error) {
      // Parent component should surface any errors.
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleScheduleReset = () => {
    if (!event) return;
    setScheduleForm({
      date: initialDate,
      startTime: initialStartTime,
      endTime: initialEndTime,
    });
  };

  const handleToggleScheduleEdit = () => {
    if (!canEditSchedule || isRescheduleLocked) return;
    if (isEditingSchedule) {
      handleScheduleReset();
    }
    setIsEditingSchedule((prev) => !prev);
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'scheduled':
        return 'outline';
      case 'in-progress':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getInitials = (name) => {
    if (!name) return '';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  // Payment calculations
  const total = Number(
    currentEvent?.estimatedTotal || currentEvent?.total || 0
  );

  let depositAmount = Number(
    currentEvent?.depositAmount || currentEvent?.deposit || 0
  );
  if (depositAmount <= 0) {
    depositAmount = total * 0.5;
  }

  const paymentStatus = String(
    currentEvent?.paymentStatus || currentEvent?.payment_status || ''
  )
    .trim()
    .toLowerCase();
  const depositPaid = Boolean(
    currentEvent?.depositPaid || currentEvent?.deposit_paid
  );
  const hasPartial = depositPaid || paymentStatus === 'partial';
  const isPaid = paymentStatus === 'paid';

  const paidAmount = (() => {
    const rawPaid = currentEvent?.totalPaid ?? currentEvent?.total_paid;
    if (rawPaid !== undefined && rawPaid !== null && rawPaid !== '') {
      return Number(rawPaid) || 0;
    }
    if (isPaid) return total;
    if (hasPartial) return depositAmount;
    return 0;
  })();
  const remainingDue = Math.max(0, total - paidAmount);
  const firstPaymentIssued =
    paymentStatus === 'paid' && !depositPaid
      ? total
      : hasPartial
        ? depositAmount
        : 0;

  const amountToPay = paymentType === 'deposit' ? depositAmount : remainingDue;
  const remainingBalance = paymentType === 'full' ? 0 : total - depositAmount;

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

  const handlePaymentSubmit = async () => {
    if (!event?.id) return;

    setIsProcessingPayment(true);
    try {
      const response = await cateringService.submitPayment(event.id, {
        paymentType,
        paymentMethod,
        amount: amountToPay,
      });

      if (!response?.success) {
        throw new Error(response?.message || 'Payment processing failed');
      }

      toast.success('Payment processed successfully!');
      setIsEditingPayment(false);

      // Refresh event data to show updated payment status
      const res = await cateringService.getEvent(event.id, {
        includeItems: true,
      });
      if (res?.success) {
        setLocalEvent(res.data);
        // Also call parent update if available
        if (typeof onUpdateEvent === 'function') {
          await onUpdateEvent(event.id, {});
        }
      }
    } catch (err) {
      const message =
        err?.message || err?.details?.message || 'Failed to process payment';
      toast.error(message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleTogglePaymentEdit = () => {
    setIsEditingPayment((prev) => !prev);
    // Reset to defaults when opening
    if (!isEditingPayment) {
      setPaymentType(disableDeposit ? 'full' : 'deposit');
      setPaymentMethod('cash');
    }
  };

  const getPaymentStatusBadge = () => {
    const currentEvent = localEvent || event;
    const paymentStatus =
      currentEvent?.paymentStatus || currentEvent?.payment_status || 'unpaid';
    const depositPaid = currentEvent?.depositPaid || currentEvent?.deposit_paid;

    if (paymentStatus === 'paid') {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Fully Paid
        </Badge>
      );
    }

    if (depositPaid || paymentStatus === 'partial') {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Wallet className="h-3 w-3 mr-1" />
          Deposit Paid
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="bg-amber-50 text-amber-700 border-amber-200"
      >
        Unpaid
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto event-details-scroll">
        <style>{EVENT_DETAILS_SCROLLBAR_STYLES}</style>
        {/* Enhanced Header with Gradient */}
        <div className="relative -mx-6 -mt-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <DialogHeader className="relative px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <div className="bg-primary/10 rounded-lg p-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                Event Details
              </span>
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1 ml-14">
              Manage event information, schedule, and payments
            </p>
          </DialogHeader>
        </div>

        <div className="space-y-4">
          {/* Main Event Card - Compact */}
          <Card className="relative overflow-hidden border shadow-md hover:shadow-lg transition-shadow duration-300">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl -z-0" />
            <CardHeader className="relative py-3 px-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-bold mb-1 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text truncate">
                    {event.name}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <p className="font-medium text-sm truncate">
                      {event.client}
                    </p>
                  </div>
                </div>
                <CustomBadge
                  variant={getStatusBadgeVariant(event.status)}
                  className="capitalize text-xs px-2.5 py-1 shadow-sm shrink-0"
                >
                  {event.status.replace('-', ' ')}
                </CustomBadge>
              </div>
            </CardHeader>
          </Card>

          {/* Compact Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Date & Time Card - Compact */}
            <Card className="border shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-card to-card/95">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
                    <div className="bg-primary/10 rounded p-1">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {isEditingSchedule ? 'Reschedule' : 'Date & Time'}
                  </CardTitle>
                  {canEditSchedule && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleToggleScheduleEdit}
                      disabled={isRescheduleLocked}
                      aria-disabled={isRescheduleLocked}
                      title={
                        isRescheduleLocked ? rescheduleLockMessage : undefined
                      }
                      aria-label={
                        isEditingSchedule
                          ? 'Close reschedule form'
                          : 'Edit schedule'
                      }
                    >
                      {isEditingSchedule ? (
                        <X className="h-3 w-3" />
                      ) : (
                        <Pencil className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {isEditingSchedule ? (
                  <form className="space-y-4" onSubmit={handleScheduleSubmit}>
                    {isRescheduleLocked && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        {rescheduleLockMessage}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      <span>Current schedule:</span>
                      <div className="font-medium text-foreground">
                        {scheduleDateLabel}
                        {event.time ? ` - ${event.time}` : ''}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <Label htmlFor="event-date" className="sm:w-40">
                          Event Date *
                        </Label>
                        <Input
                          id="event-date"
                          type="date"
                          value={scheduleForm.date}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              date: e.target.value,
                            }))
                          }
                          required
                          disabled={
                            !canEditSchedule ||
                            isSavingSchedule ||
                            isRescheduleLocked
                          }
                          className="w-full sm:flex-1"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <Label htmlFor="event-start-time" className="sm:w-40">
                          Start Time
                        </Label>
                        <Input
                          id="event-start-time"
                          type="time"
                          value={scheduleForm.startTime}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              startTime: e.target.value,
                            }))
                          }
                          disabled={
                            !canEditSchedule ||
                            isSavingSchedule ||
                            isRescheduleLocked
                          }
                          className="w-full sm:flex-1"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <Label htmlFor="event-end-time" className="sm:w-40">
                          End Time
                        </Label>
                        <Input
                          id="event-end-time"
                          type="time"
                          value={scheduleForm.endTime}
                          onChange={(e) =>
                            setScheduleForm((prev) => ({
                              ...prev,
                              endTime: e.target.value,
                            }))
                          }
                          disabled={
                            !canEditSchedule ||
                            isSavingSchedule ||
                            isRescheduleLocked
                          }
                          className="w-full sm:flex-1"
                        />
                      </div>
                    </div>
                    {canEditSchedule && (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleScheduleReset}
                          disabled={
                            !hasScheduleChanges ||
                            isSavingSchedule ||
                            isRescheduleLocked
                          }
                        >
                          Reset
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            !hasScheduleChanges ||
                            !scheduleForm.date ||
                            isSavingSchedule ||
                            isRescheduleLocked
                          }
                        >
                          {isSavingSchedule ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    )}
                  </form>
                ) : (
                  <div className="space-y-2">
                    {isRescheduleLocked && (
                      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        {rescheduleLockMessage}
                      </div>
                    )}
                    <div className="text-xs">
                      <p className="text-muted-foreground mb-0.5">Date</p>
                      <p className="font-semibold text-foreground text-sm">
                        {scheduleDateLabel}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          Start
                        </p>
                        <p className="font-semibold text-sm">
                          {scheduleStartTimeLabel || 'Not set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          End
                        </p>
                        <p className="font-semibold text-sm">
                          {scheduleEndTimeLabel || 'Not set'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attendees Card - Compact */}
            <Card className="border shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-card to-card/95">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
                  <div className="bg-primary/10 rounded p-1">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  Attendees
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-primary">
                    {attendeesCount}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    guests
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Location Card - Compact */}
            <Card className="border shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-card to-card/95">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
                  <div className="bg-primary/10 rounded p-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                  </div>
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="font-semibold text-foreground text-sm line-clamp-2">
                  {event.location || '—'}
                </p>
              </CardContent>
            </Card>

            {/* Financial Card - Compact */}
            <Card className="border shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-card to-card/95">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
                    <div className="bg-primary/10 rounded p-1">
                      <Banknote className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {isEditingPayment ? 'Process Payment' : 'Financial'}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {!isEditingPayment && getPaymentStatusBadge()}
                    {(localEvent || event)?.paymentStatus !== 'paid' &&
                      (localEvent || event)?.payment_status !== 'paid' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-primary/10"
                          onClick={handleTogglePaymentEdit}
                          aria-label={
                            isEditingPayment
                              ? 'Close payment form'
                              : 'Process payment'
                          }
                        >
                          {isEditingPayment ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <Wallet className="h-3 w-3 text-primary" />
                          )}
                        </Button>
                      )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3">
                {isEditingPayment ? (
                  <div className="space-y-4">
                    {/* Payment Type Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">
                        Payment Type
                      </Label>
                      <RadioGroup
                        value={paymentType}
                        onValueChange={(value) => {
                          if (value === 'deposit' && disableDeposit) return;
                          setPaymentType(value);
                        }}
                      >
                        {/* Deposit Option */}
                        <div
                          className={cn(
                            'relative rounded-lg border-2 p-3 transition-all',
                            paymentType === 'deposit'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-card',
                            disableDeposit
                              ? 'cursor-not-allowed opacity-60'
                              : 'cursor-pointer hover:border-primary/50'
                          )}
                          onClick={() => {
                            if (disableDeposit) return;
                            setPaymentType('deposit');
                          }}
                          aria-disabled={disableDeposit}
                          title={
                            disableDeposit
                              ? '50% deposit is disabled for this order.'
                              : undefined
                          }
                        >
                          <div className="flex items-start gap-3">
                            <RadioGroupItem
                              value="deposit"
                              id="deposit"
                              className="mt-0.5"
                              disabled={disableDeposit}
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Label
                                  htmlFor="deposit"
                                  className={cn(
                                    'text-sm font-semibold',
                                    disableDeposit
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
                              <p className="text-xs text-muted-foreground">
                                Secure your reservation
                              </p>
                              <div className="flex items-baseline gap-2 pt-1">
                                <span className="text-xl font-bold text-primary">
                                  ₱{depositAmount.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Remaining: ₱{remainingBalance.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {paymentType === 'deposit' && (
                            <div className="absolute -top-1 -right-1">
                              <div className="rounded-full bg-primary p-1">
                                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Full Payment Option */}
                        <div
                          className={cn(
                            'relative cursor-pointer rounded-lg border-2 p-3 transition-all',
                            paymentType === 'full'
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-card hover:border-primary/50'
                          )}
                          onClick={() => setPaymentType('full')}
                        >
                          <div className="flex items-start gap-3">
                            <RadioGroupItem
                              value="full"
                              id="full"
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <Label
                                htmlFor="full"
                                className="text-sm font-semibold cursor-pointer"
                              >
                                Full Payment
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Pay the full amount now
                              </p>
                              <div className="flex items-baseline gap-2 pt-1">
                                <span className="text-xl font-bold text-primary">
                                  ₱{total.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  First payment: ₱
                                  {firstPaymentIssued.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {paymentType === 'full' && (
                            <div className="absolute -top-1 -right-1">
                              <div className="rounded-full bg-primary p-1">
                                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Payment Method Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        Payment Method
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {paymentMethods.map((method) => {
                          const Icon = method.icon;
                          const isSelected = paymentMethod === method.id;
                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => setPaymentMethod(method.id)}
                              className={cn(
                                'flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all',
                                isSelected
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-border bg-card hover:border-primary/50'
                              )}
                            >
                              <Icon
                                className={cn(
                                  'h-6 w-6',
                                  isSelected
                                    ? 'text-primary'
                                    : 'text-muted-foreground'
                                )}
                              />
                              <span
                                className={cn(
                                  'text-xs font-medium',
                                  isSelected
                                    ? 'text-primary'
                                    : 'text-foreground'
                                )}
                              >
                                {method.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground px-1">
                        {
                          paymentMethods.find((m) => m.id === paymentMethod)
                            ?.description
                        }
                      </p>
                    </div>

                    {/* Payment Summary */}
                    <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Wallet className="h-3 w-3" />
                        Payment Summary
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-xs">
                            Remaining Balance
                          </span>
                          <span className="font-medium">
                            ₱{remainingDue.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t-2 border-primary/20">
                          <span className="font-semibold text-xs">
                            Amount to Pay
                          </span>
                          <span className="text-lg font-bold text-primary">
                            ₱{amountToPay.toFixed(2)}
                          </span>
                        </div>
                        {paymentType === 'deposit' && (
                          <div className="flex justify-between text-muted-foreground text-xs">
                            <span>Balance Due on Event</span>
                            <span className="font-medium">
                              ₱{remainingBalance.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Information Alert */}
                    <div className="flex gap-2 rounded-lg bg-blue-50 border border-blue-200 p-2.5">
                      <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs text-blue-900">
                        <p className="font-medium mb-0.5">
                          Payment Confirmation
                        </p>
                        <p className="text-blue-700">
                          {paymentMethod === 'cash'
                            ? 'Please prepare the exact amount. A receipt will be provided upon payment.'
                            : 'You will be redirected to complete the payment securely.'}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      {remainingDue <= 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Payment is complete. Add menu items to reopen payment.
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTogglePaymentEdit}
                        disabled={isProcessingPayment}
                        size="sm"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handlePaymentSubmit}
                        disabled={
                          isProcessingPayment ||
                          !total ||
                          remainingDue <= 0 ||
                          (disableDeposit && paymentType !== 'full')
                        }
                        size="sm"
                      >
                        {isProcessingPayment ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Wallet className="h-3 w-3 mr-2" />
                            Confirm ₱{amountToPay.toFixed(2)}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="h-3 w-3 text-primary" />
                        <span className="text-xs font-semibold text-primary">
                          Remaining Balance
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-primary">
                        ₱{remainingDue.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center py-1 border-b border-border/50">
                        <span className="text-xs text-muted-foreground font-medium">
                          Per person:
                        </span>
                        <span className="font-semibold text-sm">
                          {attendeesCount > 0
                            ? `₱${(remainingDue / attendeesCount).toFixed(2)}`
                            : '₱0.00'}
                        </span>
                      </div>
                      {((localEvent || event)?.depositAmount ||
                        (localEvent || event)?.deposit) && (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-xs text-muted-foreground font-medium">
                            Deposit (50%):
                          </span>
                          <span className="font-semibold text-sm">
                            ₱
                            {Number(
                              (localEvent || event)?.depositAmount ||
                                (localEvent || event)?.deposit ||
                                0
                            ).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Contact Information Card - Compact */}
          <Card className="border shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-card to-card/95">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
                <div className="bg-primary/10 rounded p-1">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-r from-muted/50 to-transparent border border-border/50">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm shrink-0">
                  <span className="font-bold text-primary text-sm">
                    {getInitials(contactPerson.name) || '—'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {contactPerson.name || '—'}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-2.5 w-2.5 text-primary shrink-0" />
                    <span className="font-medium truncate">
                      {contactPerson.phone || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
