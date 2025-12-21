import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { orderService } from '@/api/services/orderService';

const FALLBACK_PREFIX = 'W';
let lastGeneratedOrderToken = '';

const randomDigits = (length = 6) => {
  const upperBound = 10 ** length;
  const candidate = Math.floor(Math.random() * upperBound);
  return String(candidate).padStart(length, '0');
};

const createFallbackOrderIdentifiers = () => {
  let number = '';
  let safety = 0;
  do {
    const digits = randomDigits(6);
    number = `${FALLBACK_PREFIX}-${digits}`;
    safety += 1;
  } while (number === lastGeneratedOrderToken && safety < 3);

  lastGeneratedOrderToken = number;

  return {
    reference: number,
    number,
  };
};

const normalizeOrderReference = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim().replace(/^#/, '');
  const parts = trimmed.split('-').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`;
  }
  return trimmed;
};

export const usePOSLogic = () => {
  const isMountedRef = useRef(true);
  const [currentOrder, setCurrentOrder] = useState([]);
  const [discount, setDiscount] = useState({ type: 'percentage', value: 0 });
  const [orderIdentifiers, setOrderIdentifiers] = useState(() =>
    createFallbackOrderIdentifiers()
  );

  const obtainOrderIdentifiers = useCallback(async () => {
    try {
      const res = await orderService.generateOrderNumber({
        channel: 'walk-in',
      });
      const payload = res?.data ?? res;
      const number =
        payload?.orderNumber || payload?.order_number || payload?.number || '';
      if (number) {
        const reference =
          payload?.orderReference ||
          payload?.order_reference ||
          normalizeOrderReference(number);
        return { number, reference };
      }
    } catch (error) {
      console.error(error);
    }
    return createFallbackOrderIdentifiers();
  }, []);

  const refreshOrderIdentifiers = useCallback(async () => {
    const identifiers = await obtainOrderIdentifiers();
    if (isMountedRef.current) {
      setOrderIdentifiers(identifiers);
    }
    return identifiers;
  }, [obtainOrderIdentifiers]);

  useEffect(() => {
    isMountedRef.current = true;
    refreshOrderIdentifiers().catch((error) => console.error(error));
    return () => {
      isMountedRef.current = false;
    };
  }, [refreshOrderIdentifiers]);

  const extractOrderInfo = (data) => {
    if (!data || typeof data !== 'object') return null;
    const id = data.id || data.orderId || data.orderID || data.order_id || null;
    const orderNumber =
      data.orderNumber ||
      data.order_number ||
      data.number ||
      data.orderNo ||
      null;
    if (!id) return null;
    return { id, orderNumber: orderNumber || null };
  };

  const addToOrder = (menuItem) => {
    setCurrentOrder((prevOrder) => {
      const existingItemIndex = prevOrder.findIndex(
        (item) => item.menuItemId === menuItem.id
      );

      if (existingItemIndex !== -1) {
        const updatedOrder = [...prevOrder];
        const target = updatedOrder[existingItemIndex];
        updatedOrder[existingItemIndex] = {
          ...target,
          quantity: (target.quantity || 0) + 1,
        };
        return updatedOrder;
      } else {
        const imageSource =
          menuItem.image ||
          menuItem.imageUrl ||
          menuItem.thumbnail ||
          menuItem.photo ||
          null;
        return [
          ...prevOrder,
          {
            id: `order-item-${Date.now()}`,
            menuItemId: menuItem.id,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
            image: imageSource,
          },
        ];
      }
    });
  };

  const updateQuantity = (orderItemId, change) => {
    setCurrentOrder((prevOrder) => {
      const updatedOrder = prevOrder.map((item) => {
        if (item.id === orderItemId) {
          const newQuantity = item.quantity + change;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
        }
        return item;
      });
      return updatedOrder;
    });
  };

  const removeFromOrder = (orderItemId) => {
    setCurrentOrder((prevOrder) =>
      prevOrder.filter((item) => item.id !== orderItemId)
    );
  };

  const clearOrder = () => {
    setCurrentOrder([]);
    setDiscount({ type: 'percentage', value: 0 });
  };

  const calculateSubtotal = () => {
    return currentOrder.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  };

  const calculateDiscountAmount = () => {
    const subtotal = calculateSubtotal();
    if (discount.type === 'percentage') {
      return (subtotal * discount.value) / 100;
    } else {
      return Math.min(discount.value, subtotal);
    }
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - calculateDiscountAmount());
  };

  const applyDiscount = (discountInput, discountType) => {
    const value = parseFloat(discountInput);
    if (isNaN(value) || value < 0) {
      toast.error('Please enter a valid discount value');
      return false;
    }

    if (discountType === 'percentage' && value > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return false;
    }

    setDiscount({ type: discountType, value });
    return true;
  };

  const removeDiscount = () => {
    setDiscount({ type: 'percentage', value: 0 });
  };

  const processPayment = async (paymentDetails = {}) => {
    const paymentMethod = 'cash';
    const total = calculateTotal();
    if (!currentOrder.length) {
      toast.error('No items in order.');
      return null;
    }
    const identifiers =
      orderIdentifiers && orderIdentifiers.number
        ? orderIdentifiers
        : createFallbackOrderIdentifiers();
    const subtotal = calculateSubtotal();
    const discountAmount = calculateDiscountAmount();
    const tenderedAmount =
      typeof paymentDetails.tenderedAmount === 'number'
        ? paymentDetails.tenderedAmount
        : total;
    const change =
      typeof paymentDetails.change === 'number'
        ? paymentDetails.change
        : Math.max(0, tenderedAmount - total);
    try {
      const scheduleOrderIdentifierRefresh = () => {
        const trigger = () => {
          refreshOrderIdentifiers().catch((error) => console.error(error));
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(trigger);
        } else {
          setTimeout(trigger, 0);
        }
      };

      const payload = {
        items: currentOrder.map((it) => ({
          menuItemId: it.menuItemId,
          quantity: it.quantity,
        })),
        discount: discount?.type === 'fixed' ? discount.value : 0,
        discountType: discount.type,
        totals: {
          subtotal,
          discount: discountAmount,
          total,
        },
        type: 'walk-in',
        orderNumber: identifiers.number,
        orderReference: identifiers.reference,
        paymentMethod: paymentMethod,
        tenderedAmount,
        change,
      };
      const idempotencyKey = identifiers?.number
        ? `pos-${identifiers.number}`
        : '';
      const res = await orderService.checkoutOrder(payload, { idempotencyKey });
      const data = res?.data ?? res;
      const infoRaw = extractOrderInfo(data) || {
        id: data?.id || null,
        orderNumber: data?.orderNumber || data?.order_number || null,
      };
      if (!infoRaw || !infoRaw.id) {
        throw new Error('Order checkout failed');
      }
      const info = {
        ...infoRaw,
        orderNumber: infoRaw.orderNumber || identifiers.number,
      };
      clearOrder();

      if (isMountedRef.current) {
        setOrderIdentifiers(createFallbackOrderIdentifiers());
      }
      scheduleOrderIdentifierRefresh();
      return info;
    } catch (e) {
      console.error(e);
      const message =
        e?.message ||
        e?.details?.message ||
        'Failed to process payment. Please try again.';
      toast.error(message);
      return null;
    }
  };

  return {
    currentOrder,
    discount,
    addToOrder,
    updateQuantity,
    removeFromOrder,
    clearOrder,
    calculateSubtotal,
    calculateDiscountAmount,
    calculateTotal,
    applyDiscount,
    removeDiscount,
    processPayment,
    orderNumber: orderIdentifiers.number,
  };
};
