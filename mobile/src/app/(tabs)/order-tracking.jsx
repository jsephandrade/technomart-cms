import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { fetchUserOrders } from '../../api/api';
import { resolveImageSource } from '../../utils/image';

const BACKEND = 'http://192.168.166.179:8000';
const STATUS_STEPS = [
  'pending',
  'in_prep',
  'in_progress',
  'ready',
  'completed',
];
const STATUS_LABELS = {
  pending: 'Pending',
  in_queue: 'Pending',
  in_prep: 'Preparing',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  refunded: 'Refunded',
  voided: 'Voided',
};
const STATUS_COLORS = {
  pending: '#F97316',
  in_queue: '#F97316',
  in_prep: '#FB923C',
  in_progress: '#38BDF8',
  ready: '#10B981',
  completed: '#10B981',
  cancelled: '#EF4444',
  canceled: '#EF4444',
  refunded: '#EF4444',
  voided: '#EF4444',
};
const STATUS_BG = {
  pending: '#FFE7C7',
  in_queue: '#FFE7C7',
  in_prep: '#FFE7C7',
  in_progress: '#DBEAFE',
  ready: '#DCFCE7',
  completed: '#DCFCE7',
  cancelled: '#FEE2E2',
  canceled: '#FEE2E2',
  refunded: '#FEE2E2',
  voided: '#FEE2E2',
};
const STATUS_MAPPING = {
  pending: 'pending',
  in_queue: 'pending',
  queued: 'pending',
  accepted: 'in_prep',
  in_prep: 'in_prep',
  preparing: 'in_prep',
  assembly: 'in_progress',
  assembling: 'in_progress',
  in_progress: 'in_progress',
  inprogress: 'in_progress',
  staged: 'ready',
  ready: 'ready',
  handoff: 'ready',
  completed: 'completed',
  delivered: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refunded: 'refunded',
  voided: 'voided',
};

const normalizeStatusKey = (value) => {
  if (!value) return 'pending';
  const raw = String(value).toLowerCase().trim();
  const cleaned = raw.replace(/[^a-z]/g, '_').replace(/_+/g, '_');
  return STATUS_MAPPING[cleaned] || STATUS_MAPPING[raw] || cleaned || 'pending';
};

const formatStatusLabel = (value) => {
  const key = normalizeStatusKey(value);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  if (typeof value === 'string' && value.trim()) {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }
  return STATUS_LABELS.pending;
};

const formatPeso = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '\u20b10.00';
  return `\u20b1${amount.toFixed(2)}`;
};

const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const resolveOrderItems = (order) => {
  if (!order || typeof order !== 'object') return [];
  const items =
    order.items ||
    order.order_items ||
    order.orderItems ||
    order.details ||
    order.order_lines ||
    order.orderLines;
  return Array.isArray(items) ? items : [];
};

const resolveOrderNumber = (order) =>
  order?.order_number ||
  order?.orderNumber ||
  order?.order_id ||
  order?.orderId ||
  order?.id ||
  '';

const formatOrderNumber = (value) => {
  if (!value) return 'Unknown';
  const text = String(value);
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
};

const resolveOrderDate = (order) =>
  order?.created_at ||
  order?.createdAt ||
  order?.created ||
  order?.order_date ||
  order?.orderDate ||
  order?.date ||
  order?.promised_time ||
  order?.promisedTime ||
  '';

const resolvePaymentMethod = (order) => {
  const method =
    order?.payment_method ||
    order?.paymentMethod ||
    order?.payment_method_display ||
    order?.payment ||
    order?.method;
  if (!method) return 'Pending';
  return String(method)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const resolveItemName = (item) =>
  item?.name ||
  item?.menu_item_name ||
  item?.menuItemName ||
  item?.menu_item?.name ||
  item?.menuItem?.name ||
  'Item';

const resolveItemQuantity = (item) => {
  const qty = Number(item?.quantity ?? item?.qty ?? item?.count ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) return 1;
  return qty;
};

const resolveItemPrice = (item) => {
  const price = Number(
    item?.price ?? item?.unit_price ?? item?.unitPrice ?? item?.total_price ?? 0
  );
  return Number.isFinite(price) ? price : 0;
};

const resolveItemSize = (item) =>
  item?.size || item?.variant || item?.menu_item_size || item?.menuItemSize;

const resolveItemImage = (item) =>
  item?.image ||
  item?.image_url ||
  item?.imageUrl ||
  item?.thumbnail ||
  item?.menu_item?.image ||
  item?.menu_item?.image_url ||
  item?.menuItem?.image ||
  item?.menuItem?.image_url ||
  null;

const resolveOrderTotal = (order, items) => {
  const candidates = [
    order?.total_amount,
    order?.totalAmount,
    order?.total,
    order?.grand_total,
    order?.grandTotal,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const amount = Number(candidate);
    if (Number.isFinite(amount)) return amount;
  }
  return items.reduce((sum, item) => {
    const lineTotal = resolveItemPrice(item) * resolveItemQuantity(item);
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);
};

const isPreviousStatus = (status) => {
  const key = normalizeStatusKey(status);
  return ['completed', 'cancelled', 'refunded', 'voided'].includes(key);
};

const isCancelableStatus = (status) =>
  ['pending', 'in_queue', 'in_prep', 'in_progress'].includes(
    normalizeStatusKey(status)
  );

export default function OrderTrackingScreen() {
  const [fontsLoaded] = useFonts({ Roboto_700Bold });
  const [currentOrders, setCurrentOrders] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8,
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140) {
          handleCloseModal();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const loadOrders = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchUserOrders();
      const orders = Array.isArray(data) ? data : [];
      const sorted = [...orders].sort((a, b) => {
        const dateA = new Date(resolveOrderDate(a)).getTime() || 0;
        const dateB = new Date(resolveOrderDate(b)).getTime() || 0;
        return dateB - dateA;
      });
      const current = [];
      const previous = [];
      sorted.forEach((order) => {
        if (isPreviousStatus(order?.status)) {
          previous.push(order);
        } else {
          current.push(order);
        }
      });
      setCurrentOrders(current);
      setPreviousOrders(previous);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders({ silent: true }).finally(() => setRefreshing(false));
  };

  const handleOpenModal = (order) => {
    setSelectedOrder(order);
    setModalVisible(true);
    translateY.setValue(320);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const handleCloseModal = () => {
    Animated.timing(translateY, {
      toValue: 320,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      setSelectedOrder(null);
      translateY.setValue(0);
    });
  };

  const handleCancelOrder = (order) => {
    const orderNumber = resolveOrderNumber(order);
    if (!orderNumber) {
      Alert.alert('Unable to cancel', 'Order number is missing.');
      return;
    }
    Alert.alert('Cancel order', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(
              `${BACKEND}/orders/orders/${orderNumber}/cancel/`,
              { method: 'POST' }
            );
            if (!res.ok) {
              const body = await res.text();
              throw new Error(body || 'Cancel request failed.');
            }
            Alert.alert('Order cancelled', 'Your order has been cancelled.');
            handleCloseModal();
            await loadOrders({ silent: true });
          } catch (err) {
            console.error('Cancel order failed:', err);
            Alert.alert('Cancel failed', err.message || 'Try again.');
          }
        },
      },
    ]);
  };

  const renderStatusBar = (statusKey) => {
    if (!statusKey || statusKey === 'cancelled') return null;
    const activeIndex = STATUS_STEPS.indexOf(statusKey);
    if (activeIndex === -1) return null;
    const activeColor = STATUS_COLORS[statusKey] || '#F97316';
    const inactiveColor = '#F3D6B7';
    const inactiveText = '#9CA3AF';
    return (
      <View style={styles.statusRow}>
        {STATUS_STEPS.map((step, index) => {
          const isActive = activeIndex >= index;
          const isLineActive = activeIndex > index;
          const isLinePartial =
            statusKey === 'in_progress' && activeIndex === index;
          return (
            <View key={step} style={styles.statusStep}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isActive ? activeColor : inactiveColor },
                ]}
              />
              <Text
                style={[
                  styles.statusLabel,
                  { color: isActive ? activeColor : inactiveText },
                ]}
              >
                {STATUS_LABELS[step]}
              </Text>
              {index < STATUS_STEPS.length - 1 && (
                <View style={styles.statusLineTrack}>
                  {(isLineActive || isLinePartial) && (
                    <View
                      style={[
                        styles.statusLineFill,
                        {
                          backgroundColor: activeColor,
                          width: isLinePartial ? '55%' : '100%',
                        },
                      ]}
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderOrderCard = (order, variant = 'current', index = 0) => {
    const items = resolveOrderItems(order);
    const statusKey = normalizeStatusKey(order?.status);
    const statusColor = STATUS_COLORS[statusKey] || '#F97316';
    const statusBg = STATUS_BG[statusKey] || '#FFE7C7';
    const orderNumber = resolveOrderNumber(order);
    const orderDate = resolveOrderDate(order);
    const total = resolveOrderTotal(order, items);
    const isPrevious = variant === 'previous';
    const previewItems = items.slice(0, 2);

    return (
      <View
        key={String(orderNumber || order?.id || index)}
        style={[styles.orderCard, isPrevious && styles.orderCardPrevious]}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderInfo}>
            <Text style={styles.orderId} numberOfLines={1}>
              Order #{formatOrderNumber(orderNumber)}
            </Text>
            <Text style={styles.orderDate}>{formatDate(orderDate)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {formatStatusLabel(order?.status)}
            </Text>
          </View>
        </View>

        {!isPrevious && renderStatusBar(statusKey)}

        <View style={styles.itemsPreview}>
          {previewItems.map((item, index) => {
            const name = resolveItemName(item);
            const qty = resolveItemQuantity(item);
            const size = resolveItemSize(item);
            const price = resolveItemPrice(item) * qty;
            return (
              <View
                key={`${name}-${index}`}
                style={[
                  styles.itemRow,
                  index < previewItems.length - 1 && styles.itemRowDivider,
                ]}
              >
                <Image
                  source={resolveImageSource(resolveItemImage(item))}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {size ? `Size: ${size}  ` : ''}
                    Qty: {qty}
                  </Text>
                </View>
                <View style={styles.itemPriceContainer}>
                  <Text style={styles.itemPrice}>{formatPeso(price)}</Text>
                </View>
              </View>
            );
          })}
          {items.length > previewItems.length && (
            <Text style={styles.moreItemsText}>
              +{items.length - previewItems.length} more items
            </Text>
          )}
        </View>

        <View style={styles.orderFooter}>
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={() => handleOpenModal(order)}
          >
            <Text style={styles.viewMoreText}>View Details</Text>
          </TouchableOpacity>
          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>Total</Text>
            <Text style={styles.totalAmount}>{formatPeso(total)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSection = ({
    title,
    subtitle,
    count,
    items,
    variant,
    emptyTitle,
    emptySubtitle,
  }) => (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{count}</Text>
        </View>
      </View>
      {items.length ? (
        items.map((order, index) => renderOrderCard(order, variant, index))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
        </View>
      )}
    </View>
  );

  const selectedItems = useMemo(
    () => resolveOrderItems(selectedOrder),
    [selectedOrder]
  );
  const selectedStatusKey = normalizeStatusKey(selectedOrder?.status);
  const selectedTotal = resolveOrderTotal(selectedOrder, selectedItems);
  const selectedOrderNumber = resolveOrderNumber(selectedOrder);
  const selectedOrderDate = resolveOrderDate(selectedOrder);

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#f97316']}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#FFE4C7', '#FFC37A', '#FF8A3D']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.heroCard}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="time-outline" size={22} color="#1F2937" />
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Orders</Text>
              <Text style={styles.heroSubtitle}>
                Track your current and past orders
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {currentOrders.length} active
              </Text>
            </View>
          </View>
        </LinearGradient>

        {renderSection({
          title: 'Current Orders',
          subtitle: 'In progress right now',
          count: `${currentOrders.length} active`,
          items: currentOrders,
          variant: 'current',
          emptyTitle: 'No current orders',
          emptySubtitle: 'New orders will appear here once placed.',
        })}

        {renderSection({
          title: 'Previous Orders',
          subtitle: 'Completed or cancelled',
          count: `${previousOrders.length} total`,
          items: previousOrders,
          variant: 'previous',
          emptyTitle: 'No previous orders',
          emptySubtitle: 'Past orders will appear here.',
        })}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleCloseModal}
          />
          <Animated.View
            style={[styles.modalCard, { transform: [{ translateY }] }]}
          >
            <View style={styles.modalHandle} {...panResponder.panHandlers} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Order #{formatOrderNumber(selectedOrderNumber)}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {formatStatusLabel(selectedOrder?.status)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={handleCloseModal}
              >
                <Ionicons name="close" size={18} color="#9A3412" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Items</Text>
                <View style={styles.modalItemsCard}>
                  {selectedItems.map((item, index) => {
                    const name = resolveItemName(item);
                    const qty = resolveItemQuantity(item);
                    const size = resolveItemSize(item);
                    const price = resolveItemPrice(item) * qty;
                    return (
                      <View
                        key={`${name}-${index}`}
                        style={[
                          styles.itemRow,
                          index < selectedItems.length - 1 &&
                            styles.itemRowDivider,
                        ]}
                      >
                        <Image
                          source={resolveImageSource(resolveItemImage(item))}
                          style={styles.itemImage}
                          resizeMode="cover"
                        />
                        <View style={styles.itemDetails}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.itemMeta} numberOfLines={1}>
                            {size ? `Size: ${size}  ` : ''}
                            Qty: {qty}
                          </Text>
                        </View>
                        <View style={styles.itemPriceContainer}>
                          <Text style={styles.itemPrice}>
                            {formatPeso(price)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Order Info</Text>
                <View style={styles.modalInfoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Placed</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(selectedOrderDate)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Payment</Text>
                    <Text style={styles.infoValue}>
                      {resolvePaymentMethod(selectedOrder)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Status</Text>
                    <Text style={styles.infoValue}>
                      {formatStatusLabel(selectedOrder?.status)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>Total</Text>
                <Text style={styles.modalTotalValue}>
                  {formatPeso(selectedTotal)}
                </Text>
              </View>

              {selectedOrder &&
                !isPreviousStatus(selectedOrder?.status) &&
                isCancelableStatus(selectedOrder?.status) && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelOrder(selectedOrder)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EE',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#FFE5C8',
    opacity: 0.7,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FFD6AE',
    opacity: 0.6,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  heroCard: {
    margin: 16,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  heroBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  sectionBlock: {
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  orderCardPrevious: {
    borderWidth: 1,
    borderColor: '#F3D6B7',
    backgroundColor: '#FFFCF7',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderHeaderInfo: {
    flex: 1,
    paddingRight: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  orderDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  statusStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
    marginRight: 6,
  },
  statusLineTrack: {
    width: 24,
    height: 2,
    backgroundColor: '#F3D6B7',
    borderRadius: 999,
    overflow: 'hidden',
    marginRight: 6,
  },
  statusLineFill: {
    height: 2,
  },
  itemsPreview: {
    marginTop: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3D6B7',
  },
  itemImage: {
    width: 46,
    height: 46,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: '#F7EDE2',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  itemPriceContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF7A18',
  },
  moreItemsText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  viewMoreButton: {
    backgroundColor: '#FFE7C7',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  viewMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  totalContainer: {
    alignItems: 'flex-end',
  },
  totalText: {
    fontSize: 11,
    color: '#6B7280',
  },
  totalAmount: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#FFF7EE',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 12,
    maxHeight: '85%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#F3D6B7',
    marginTop: 10,
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  modalSection: {
    marginTop: 8,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalItemsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modalInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF0E0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  modalTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  modalTotalValue: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
  },
  loadingText: {
    marginTop: 8,
    color: '#F97316',
    fontFamily: 'Roboto_700Bold',
  },
});
