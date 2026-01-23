import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowLeft, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import CateringPackageSelection from './CateringPackageSelection';
import CateringPackageSummary from './CateringPackageSummary';
import PaymentModal from './PaymentModal';
import useCateringPackages from '@/hooks/useCateringPackages';
import cateringService from '@/api/services/cateringService';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const CateringMenuPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { packages, isLoading, error, refetch } = useCateringPackages();

  const [event, setEvent] = useState(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isMobileOrderSheetOpen, setIsMobileOrderSheetOpen] = useState(false);
  const [isSyncingPayment, setIsSyncingPayment] = useState(false);
  const [hasSavedOrder, setHasSavedOrder] = useState(false);
  const initialSavedOrderRef = useRef(null);
  const selectedPackage = useMemo(() => {
    if (!selectedPackageId) return null;
    return (
      (packages || []).find(
        (pkg) => String(pkg.id) === String(selectedPackageId)
      ) || null
    );
  }, [packages, selectedPackageId]);

  const populateFromEvent = useCallback((eventData) => {
    const packageId =
      eventData?.packageId || eventData?.package_id || eventData?.package;
    if (packageId) {
      setSelectedPackageId(packageId);
    }
  }, []);

  const seedInitialSavedOrder = useCallback((eventData) => {
    if (initialSavedOrderRef.current !== null) return;
    const hasItems =
      Array.isArray(eventData?.items) && eventData.items.length > 0;
    initialSavedOrderRef.current = hasItems;
    setHasSavedOrder(hasItems);
  }, []);

  const fetchEventData = useCallback(
    async (options = { populate: true }) => {
      if (!eventId) return null;
      const res = await cateringService.getEvent(eventId, {
        includeItems: true,
      });
      if (!res?.success)
        throw new Error(res?.message || 'Failed to load event');
      setEvent(res.data);
      seedInitialSavedOrder(res.data);
      if (options.populate) {
        populateFromEvent(res.data);
      }
      return res.data;
    },
    [eventId, populateFromEvent, seedInitialSavedOrder]
  );

  // Fetch event data
  useEffect(() => {
    const run = async () => {
      if (!eventId) return;
      setIsLoadingEvent(true);
      try {
        await fetchEventData({ populate: true });
      } catch (err) {
        const message =
          err?.message ||
          err?.details?.message ||
          'Failed to load event details';
        toast.error(message);
        navigate('/catering');
      } finally {
        setIsLoadingEvent(false);
      }
    };
    run();
  }, [eventId, navigate, fetchEventData]);

  useEffect(() => {
    initialSavedOrderRef.current = null;
    setHasSavedOrder(false);
    setSelectedPackageId(null);
  }, [eventId]);

  const handleSelectPackage = useCallback(
    async (pkg) => {
      if (!eventId || !pkg) return;
      setSelectedPackageId(pkg.id);
      setIsSaving(true);
      try {
        const response = await cateringService.setEventPackage(eventId, {
          packageId: pkg.id,
          guestCount: event?.guestCount ?? event?.attendees ?? 0,
        });

        if (!response?.success) {
          throw new Error(response?.message || 'Failed to save package');
        }

        if (response?.data) {
          setEvent(response.data);
          seedInitialSavedOrder(response.data);
        }

        toast.success(`Package "${pkg.name}" selected`);
      } catch (err) {
        const message =
          err?.message ||
          err?.details?.message ||
          'Failed to save catering package';
        toast.error(message);
        try {
          await fetchEventData({ populate: true });
        } catch (refreshErr) {
          // Ignore refresh failures after showing the original error.
        }
      } finally {
        setIsSaving(false);
      }
    },
    [eventId, event, fetchEventData, seedInitialSavedOrder]
  );

  const handleOpenPayment = useCallback(async () => {
    setIsSyncingPayment(true);
    try {
      await fetchEventData({ populate: true });
      setShowPaymentModal(true);
    } catch (err) {
      const message =
        err?.message || err?.details?.message || 'Failed to sync order';
      toast.error(message);
    } finally {
      setIsSyncingPayment(false);
    }
  }, [fetchEventData]);

  const paymentTotals = useMemo(() => {
    const guestCount = Number(event?.attendees ?? event?.guestCount ?? 0);
    const packagePrice = Number(
      selectedPackage?.pricePerPax ?? event?.packagePricePerPax ?? 0
    );
    const storedTotal = Number(event?.estimatedTotal ?? event?.total ?? 0);
    const subtotal = storedTotal > 0 ? storedTotal : packagePrice * guestCount;
    const discountAmount = Number(event?.orderDiscount ?? 0);
    const total = Math.max(0, subtotal - discountAmount);
    return { subtotal, discountAmount, total };
  }, [event, selectedPackage]);

  const hasPackage = Boolean(
    selectedPackageId || event?.packageId || event?.package_id || event?.package
  );
  const packageCount = hasPackage ? 1 : 0;
  const paymentEnabled = paymentTotals.total > 0 && hasPackage;

  const handlePaymentSubmit = async (paymentData) => {
    try {
      const response = await cateringService.submitPayment(eventId, {
        paymentType: paymentData.paymentType,
        paymentMethod: paymentData.paymentMethod,
        amount: paymentData.amount,
      });

      if (!response?.success) {
        throw new Error(response?.message || 'Payment processing failed');
      }

      toast.success('Payment processed successfully!');
      setShowPaymentModal(false);

      // Refresh event data to show updated payment status
      const res = await cateringService.getEvent(eventId, {
        includeItems: true,
      });
      if (res?.success) {
        setEvent(res.data);
      }

      // Navigate back to catering page
      setTimeout(() => {
        navigate('/catering');
      }, 1000);
    } catch (err) {
      const message =
        err?.message || err?.details?.message || 'Failed to process payment';
      toast.error(message);
      throw err;
    }
  };

  if (isLoadingEvent || !event) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading event...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Header Card */}
      <FeaturePanelCard
        title={`Catering Package - ${event.name || event.clientName}`}
        description={`${event.client || event.clientName} • ${event.attendees || event.guestCount} attendees`}
        headerActions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/catering')}
              disabled={isSaving}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <button
              type="button"
              onClick={() => setIsMobileOrderSheetOpen(true)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:hidden"
              aria-label={
                packageCount > 0
                  ? `View package summary (${packageCount})`
                  : 'View package summary'
              }
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              {packageCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-h-[1.1rem] min-w-[1.1rem] rounded-full bg-destructive px-1 text-[11px] font-semibold leading-[1.1rem] text-destructive-foreground">
                  {packageCount > 99 ? '99+' : packageCount}
                </span>
              )}
            </button>
          </div>
        }
      >
        <div
          className={`grid grid-cols-1 gap-6 ${
            hasPackage ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
          }`}
        >
          {/* Left Panel: Package Selection */}
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading packages...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center max-w-md">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">{error}</p>
                  <Button onClick={refetch} variant="outline">
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <CateringPackageSelection
                packages={packages}
                selectedPackageId={selectedPackageId}
                onSelectPackage={handleSelectPackage}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                eventName={event.name || event.clientName}
                attendees={event.attendees || event.guestCount}
                isSaving={isSaving}
              />
            )}
          </div>

          {/* Right Panel: Package Summary */}
          {hasPackage ? (
            <div className="hidden lg:block">
              <CateringPackageSummary
                event={event}
                selectedPackage={selectedPackage}
                canProcessPayment={paymentEnabled}
                onProcessPayment={handleOpenPayment}
                isSaving={isSaving}
              />
            </div>
          ) : null}
        </div>
      </FeaturePanelCard>

      <Sheet
        open={isMobileOrderSheetOpen}
        onOpenChange={setIsMobileOrderSheetOpen}
      >
        <SheetContent
          side="bottom"
          className="flex h-[88vh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background/95 p-0 lg:hidden"
        >
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-base font-semibold text-foreground">
                Catering Package Summary
              </SheetTitle>
              <SheetDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {event.name || event.clientName} -{' '}
                {event.attendees || event.guestCount} attendees
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <CateringPackageSummary
              event={event}
              selectedPackage={selectedPackage}
              canProcessPayment={paymentEnabled}
              onProcessPayment={() => {
                setIsMobileOrderSheetOpen(false);
                handleOpenPayment();
              }}
              isSaving={isSaving}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment Modal */}
      <PaymentModal
        open={showPaymentModal}
        onOpenChange={setShowPaymentModal}
        event={event}
        totals={paymentTotals}
        isSyncing={isSyncingPayment}
        onPaymentSubmit={handlePaymentSubmit}
        disableDeposit={hasSavedOrder}
      />
    </div>
  );
};

export default CateringMenuPage;
