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
import CateringMenuSelection from './CateringMenuSelection';
import CateringOrderSummary from './CateringOrderSummary';
import PaymentModal from './PaymentModal';
import useCateringMenu from '@/hooks/useCateringMenu';
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
  const { categorizedMenu, isLoading, error, refetch } = useCateringMenu();

  const [event, setEvent] = useState(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [discount, setDiscount] = useState('0');
  const [discountType, setDiscountType] = useState('fixed');
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isMobileOrderSheetOpen, setIsMobileOrderSheetOpen] = useState(false);
  const [isSyncingPayment, setIsSyncingPayment] = useState(false);
  const [hasSavedOrder, setHasSavedOrder] = useState(false);
  const initialSavedOrderRef = useRef(null);
  const autoSaveTimeout = useRef(null);
  const savePromiseRef = useRef(null);

  const itemsArray = useMemo(() => {
    return Object.values(selectedItems);
  }, [selectedItems]);

  const populateFromEvent = useCallback((eventData) => {
    if (eventData?.items) {
      const itemsMap = {};
      eventData.items.forEach((item) => {
        itemsMap[item.menuItemId || item.id] = {
          id: item.menuItemId || item.id,
          name: item.name,
          price: item.unitPrice || 0,
          quantity: item.quantity || 1,
          category: '',
        };
      });
      setSelectedItems(itemsMap);
    }

    if (eventData?.orderDiscount !== undefined) {
      setDiscount(String(eventData.orderDiscount));
      setDiscountType('fixed');
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
  }, [eventId]);

  const handleAddToOrder = useCallback((item) => {
    setSelectedItems((prev) => {
      const existing = prev[item.id];
      if (existing) {
        return {
          ...prev,
          [item.id]: {
            ...existing,
            quantity: existing.quantity + 1,
          },
        };
      }
      return {
        ...prev,
        [item.id]: {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          category: item.category || '',
        },
      };
    });
  }, []);

  const handleUpdateQuantity = useCallback((itemId, newQuantity) => {
    setSelectedItems((prev) => {
      const item = prev[itemId];
      if (!item) return prev;
      return {
        ...prev,
        [itemId]: {
          ...item,
          quantity: Math.max(1, newQuantity),
        },
      };
    });
  }, []);

  const handleRemoveItem = useCallback((itemId) => {
    setSelectedItems((prev) => {
      const newItems = { ...prev };
      delete newItems[itemId];
      return newItems;
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedItems({});
    setDiscount('0');
  }, []);

  const handleSaveOrder = useCallback(
    async ({ withToast = false } = {}) => {
      if (!eventId) {
        return;
      }

      if (savePromiseRef.current) {
        return savePromiseRef.current;
      }

      setIsSaving(true);
      savePromiseRef.current = (async () => {
        const items = itemsArray.map((item) => ({
          menuItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
        }));

        const response = await cateringService.setEventMenuItems(
          eventId,
          items
        );

        if (!response?.success) {
          throw new Error(response?.message || 'Failed to save menu items');
        }

        const discountValue = Number(discount) || 0;
        if (discountValue !== (event?.orderDiscount || 0)) {
          await cateringService.updateEvent(eventId, {
            orderDiscount: discountValue,
          });
        }

        if (withToast) toast.success('Catering order saved automatically');
      })()
        .catch((err) => {
          const message =
            err?.message ||
            err?.details?.message ||
            'Failed to save catering order';
          toast.error(message);
          throw err;
        })
        .finally(() => {
          setIsSaving(false);
          savePromiseRef.current = null;
        });

      return savePromiseRef.current;
    },
    [eventId, itemsArray, discount, event]
  );

  useEffect(() => {
    if (!eventId || isLoadingEvent) return undefined;

    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }

    autoSaveTimeout.current = setTimeout(() => {
      handleSaveOrder({ withToast: false });
    }, 800);

    return () => {
      if (autoSaveTimeout.current) {
        clearTimeout(autoSaveTimeout.current);
      }
    };
  }, [eventId, selectedItems, discount, isLoadingEvent, handleSaveOrder]);

  const handleOpenPayment = useCallback(async () => {
    setIsSyncingPayment(true);
    try {
      await handleSaveOrder({ withToast: false });
      await fetchEventData({ populate: true });
      setShowPaymentModal(true);
    } catch (err) {
      const message =
        err?.message || err?.details?.message || 'Failed to sync order';
      toast.error(message);
    } finally {
      setIsSyncingPayment(false);
    }
  }, [handleSaveOrder, fetchEventData]);

  const paymentTotals = useMemo(() => {
    const subtotal = itemsArray.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 0;
      return sum + price * quantity;
    }, 0);

    const discountValue = Number(discount) || 0;
    const discountAmount =
      discountType === 'percentage'
        ? (subtotal * discountValue) / 100
        : discountValue;

    const total = Math.max(0, subtotal - discountAmount);

    return { subtotal, discountAmount, total };
  }, [itemsArray, discount, discountType]);

  const itemCount = useMemo(() => {
    return Object.keys(selectedItems).length;
  }, [selectedItems]);
  const hasItems = itemCount > 0;
  const paymentEnabled = paymentTotals.total > 0 || itemsArray.length > 0;

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
        title={`Catering Menu - ${event.name || event.clientName}`}
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
                itemCount > 0
                  ? `View selected items (${itemCount})`
                  : 'View selected items'
              }
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-h-[1.1rem] min-w-[1.1rem] rounded-full bg-destructive px-1 text-[11px] font-semibold leading-[1.1rem] text-destructive-foreground">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </div>
        }
      >
        <div
          className={`grid grid-cols-1 gap-6 ${
            hasItems ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
          }`}
        >
          {/* Left Panel: Menu Selection */}
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading menu...</p>
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
              <CateringMenuSelection
                categories={categorizedMenu}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onAddToOrder={handleAddToOrder}
                eventName={event.name || event.clientName}
                attendees={event.attendees || event.guestCount}
              />
            )}
          </div>

          {/* Right Panel: Order Summary */}
          {hasItems ? (
            <div className="hidden lg:block">
              <CateringOrderSummary
                selectedItems={selectedItems}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onClearAll={handleClearAll}
                discount={discount}
                discountType={discountType}
                onDiscountChange={setDiscount}
                onDiscountTypeChange={setDiscountType}
                canProcessPayment={paymentEnabled}
                onProcessPayment={handleOpenPayment}
                itemCount={itemCount}
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
                Catering Order Summary
              </SheetTitle>
              <SheetDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {event.name || event.clientName} -{' '}
                {event.attendees || event.guestCount} attendees
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <CateringOrderSummary
              selectedItems={selectedItems}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onClearAll={handleClearAll}
              discount={discount}
              discountType={discountType}
              onDiscountChange={setDiscount}
              onDiscountTypeChange={setDiscountType}
              canProcessPayment={paymentEnabled}
              onProcessPayment={() => {
                setIsMobileOrderSheetOpen(false);
                handleOpenPayment();
              }}
              itemCount={itemCount}
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
