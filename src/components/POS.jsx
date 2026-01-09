import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import MenuSelection from '@/components/pos/MenuSelection';
import CurrentOrder from '@/components/pos/CurrentOrder';
import OrderQueue from '@/components/pos/OrderQueue';
import CustomerDisplay from '@/components/pos/CustomerDisplay';
import PaymentModal from '@/components/pos/PaymentModal';
import DiscountModal from '@/components/pos/DiscountModal';
import OrderHistoryModal from '@/components/pos/OrderHistoryModal';
import { usePOSData, EMPTY_QUEUE_STATE } from '@/hooks/usePOSData';
import { usePOSLogic } from '@/hooks/usePOSLogic';
import { useOrderHistory } from '@/hooks/useOrderManagement';
import { orderService } from '@/api/services/orderService';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatOrderNumber } from '@/lib/utils';
import {
  ListOrdered,
  Maximize2,
  Minimize2,
  Monitor,
  ShoppingCart,
} from 'lucide-react';

const POS = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isOrderHistoryModalOpen, setIsOrderHistoryModalOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [activeCategory, setActiveCategory] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pos');
  const [isMobileOrderSheetOpen, setIsMobileOrderSheetOpen] = useState(false);
  const [isDisplayFullscreen, setIsDisplayFullscreen] = useState(false);
  const displayContainerRef = useRef(null);

  // Get data and business logic from custom hooks
  const {
    categories,
    orderQueue,
    setOrderQueue,
    getPaxInfoForItem,
    deductEstimatedPax,
  } = usePOSData();
  const {
    orderHistory,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useOrderHistory({}, { auto: false });
  useEffect(() => {
    if (!activeCategory && categories && categories.length > 0) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);
  const {
    currentOrder,
    discount,
    orderNumber,
    addToOrder,
    updateQuantity,
    removeFromOrder,
    clearOrder,
    calculateSubtotal,
    calculateDiscountAmount,
    calculateTotal,
    applyDiscount,
    removeDiscount,
    processPaymentInBackground,
  } = usePOSLogic();

  const hasOrderItems = Array.isArray(currentOrder) && currentOrder.length > 0;
  const isSelectedPaymentEnabled = true;
  const paymentDisabledMessage = null;
  const orderCount = Array.isArray(currentOrder) ? currentOrder.length : 0;
  const orderLabel = orderNumber
    ? formatOrderNumber(orderNumber)
    : 'Pending Payment';
  const orderDescription = orderNumber
    ? `Order #${orderLabel}`
    : orderLabel || 'Pending Payment';
  const itemSummary = `${orderCount} item${orderCount === 1 ? '' : 's'} in cart`;

  const handleApplyDiscount = () => {
    const success = applyDiscount(discountInput, discountType);
    if (success) {
      setIsDiscountModalOpen(false);
      setDiscountInput('');
    }
  };

  const refreshQueue = useCallback(async () => {
    try {
      const res = await orderService.getOrderQueue();
      if (res?.data) {
        setOrderQueue(res.data);
        return res.data;
      }
    } catch (e) {
      console.error(e);
    }
    setOrderQueue(EMPTY_QUEUE_STATE);
    return EMPTY_QUEUE_STATE;
  }, [setOrderQueue]);

  const handleProcessPayment = (paymentDetails) => {
    const orderSnapshot = (currentOrder || []).map((item) => ({
      menuItemId: item.menuItemId || item.id,
      quantity: item.quantity || 0,
    }));
    const { accepted, promise } = processPaymentInBackground(paymentDetails);
    if (!accepted) {
      return false;
    }

    setIsPaymentModalOpen(false);
    setActiveTab('queue');

    const triggerQueueRefresh = () => {
      refreshQueue().catch((e) => console.error(e));
    };

    if (promise && typeof promise.then === 'function') {
      promise.then((info) => {
        if (!info?.id) return;
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(triggerQueueRefresh);
        } else {
          setTimeout(triggerQueueRefresh, 0);
        }
      });
    }

    deductEstimatedPax(orderSnapshot);
    return true;
  };

  const handleOpenPaymentModal = () => {
    if (!hasOrderItems || !isSelectedPaymentEnabled) return;
    setIsPaymentModalOpen(true);
  };
  // Fetch order history only when modal opens
  useEffect(() => {
    if (isOrderHistoryModalOpen) refetchHistory();
  }, [isOrderHistoryModalOpen, refetchHistory]);

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await orderService.updateOrderStatus(orderId, newStatus);
      await refreshQueue();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const updateOrderItemState = async (orderId, itemId, payload) => {
    try {
      const res = await orderService.updateOrderItemState(
        orderId,
        itemId,
        payload
      );
      await refreshQueue();
      return res?.data ?? null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const updateOrderAutoFlow = async (orderId, payload) => {
    try {
      const res = await orderService.updateOrderAutoFlow(orderId, payload);
      await refreshQueue();
      return res?.data ?? null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // Poll queue periodically for real-time-ish updates
  useEffect(() => {
    let timer = null;
    let cancelled = false;
    const tick = async () => {
      try {
        await refreshQueue();
      } catch {
      } finally {
        if (!cancelled) timer = setTimeout(tick, 5000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshQueue]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsDisplayFullscreen(
        document.fullscreenElement === displayContainerRef.current
      );
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleDisplayFullscreen = useCallback(async () => {
    const container = displayContainerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error('Unable to toggle fullscreen mode.', error);
    }
  }, []);

  const hideTabsList = isDisplayFullscreen && activeTab === 'display';

  return (
    <div className="space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value)}
        className="w-full"
      >
        {!hideTabsList && (
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="pos" className="gap-2">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Point of Sale</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Order Queue</span>
            </TabsTrigger>
            <TabsTrigger value="display" className="gap-2">
              <Monitor className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Claim Monitor</span>
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="pos">
          <div
            className={`grid gap-4 grid-cols-1 ${hasOrderItems ? 'md:grid-cols-3' : 'md:grid-cols-1'}`}
          >
            <MenuSelection
              categories={categories}
              occupyFullWidth={!hasOrderItems}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddToOrder={addToOrder}
              getPaxInfo={getPaxInfoForItem}
              mobileOrderCount={orderCount}
              onOpenMobileOrder={() => setIsMobileOrderSheetOpen(true)}
            />

            <CurrentOrder
              currentOrder={currentOrder}
              discount={discount}
              orderNumber={orderNumber}
              onUpdateQuantity={updateQuantity}
              onRemoveFromOrder={removeFromOrder}
              onClearOrder={clearOrder}
              onRemoveDiscount={removeDiscount}
              calculateSubtotal={calculateSubtotal}
              calculateDiscountAmount={calculateDiscountAmount}
              calculateTotal={calculateTotal}
              onOpenPaymentModal={handleOpenPaymentModal}
              onOpenDiscountModal={() => setIsDiscountModalOpen(true)}
              onOpenHistoryModal={() => setIsOrderHistoryModalOpen(true)}
              isPaymentMethodEnabled={isSelectedPaymentEnabled}
              paymentDisabledMessage={paymentDisabledMessage}
            />
          </div>
        </TabsContent>

        <TabsContent value="queue">
          <OrderQueue
            orderQueue={orderQueue}
            refreshQueue={refreshQueue}
            updateOrderStatus={updateOrderStatus}
            updateOrderItemState={updateOrderItemState}
            updateOrderAutoFlow={updateOrderAutoFlow}
          />
        </TabsContent>

        <TabsContent value="display">
          <div
            ref={displayContainerRef}
            className={`relative flex flex-col gap-3 ${
              isDisplayFullscreen ? 'min-h-[100dvh] bg-background p-4' : ''
            }`}
          >
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full border border-border/60 bg-background/80"
                onClick={handleToggleDisplayFullscreen}
                aria-label={
                  isDisplayFullscreen
                    ? 'Exit claim monitor fullscreen'
                    : 'Enter claim monitor fullscreen'
                }
              >
                {isDisplayFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex-1">
              <CustomerDisplay queue={orderQueue} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet
        open={isMobileOrderSheetOpen}
        onOpenChange={setIsMobileOrderSheetOpen}
      >
        <SheetContent
          side="bottom"
          className="flex h-[88vh] flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background/95 p-0 md:hidden"
        >
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-base font-semibold text-foreground">
                {orderDescription}
              </SheetTitle>
              <SheetDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {itemSummary}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <CurrentOrder
              variant="sheet"
              currentOrder={currentOrder}
              discount={discount}
              orderNumber={orderNumber}
              onUpdateQuantity={updateQuantity}
              onRemoveFromOrder={removeFromOrder}
              onClearOrder={clearOrder}
              onRemoveDiscount={removeDiscount}
              calculateSubtotal={calculateSubtotal}
              calculateDiscountAmount={calculateDiscountAmount}
              calculateTotal={calculateTotal}
              onOpenPaymentModal={() => {
                setIsMobileOrderSheetOpen(false);
                handleOpenPaymentModal();
              }}
              onOpenDiscountModal={() => {
                setIsMobileOrderSheetOpen(false);
                setIsDiscountModalOpen(true);
              }}
              onOpenHistoryModal={() => {
                setIsMobileOrderSheetOpen(false);
                setIsOrderHistoryModalOpen(true);
              }}
              isPaymentMethodEnabled={isSelectedPaymentEnabled}
              paymentDisabledMessage={paymentDisabledMessage}
            />
          </div>
        </SheetContent>
      </Sheet>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        currentOrder={currentOrder}
        discount={discount}
        onProcessPayment={handleProcessPayment}
        calculateSubtotal={calculateSubtotal}
        calculateDiscountAmount={calculateDiscountAmount}
        calculateTotal={calculateTotal}
      />

      <DiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        discountType={discountType}
        setDiscountType={setDiscountType}
        onApplyDiscount={handleApplyDiscount}
        calculateSubtotal={calculateSubtotal}
      />

      <OrderHistoryModal
        isOpen={isOrderHistoryModalOpen}
        onClose={() => setIsOrderHistoryModalOpen(false)}
        orderHistory={orderHistory}
        loading={historyLoading}
        error={historyError}
        onRefresh={refetchHistory}
      />
    </div>
  );
};

export default POS;
