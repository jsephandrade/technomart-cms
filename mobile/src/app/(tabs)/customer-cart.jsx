import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { useRouter } from 'expo-router';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { LinearGradient } from 'expo-linear-gradient';
import api, { getValidToken, createOrder } from '../../api/api';
import { resolveImageSource } from '../../utils/image';

const PICKUP_RANGE_MINUTES = 30;
const PICKUP_START_HOUR = 8;
const PICKUP_END_HOUR = 16;

const formatPickupTime = (date) => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return { time: `${hours}:${minutes}`, period };
};

const formatPickupRange = (start, end) => {
  const startInfo = formatPickupTime(start);
  const endInfo = formatPickupTime(end);
  const startLabel =
    startInfo.period === endInfo.period
      ? startInfo.time
      : `${startInfo.time} ${startInfo.period}`;
  return `${startLabel} - ${endInfo.time} ${endInfo.period}`;
};

const buildPickupRanges = () => {
  const ranges = [];
  const start = new Date(2000, 0, 1, PICKUP_START_HOUR, 0);
  const end = new Date(2000, 0, 1, PICKUP_END_HOUR, 0);
  let current = new Date(start);
  while (current < end) {
    const next = new Date(current);
    next.setMinutes(current.getMinutes() + PICKUP_RANGE_MINUTES);
    ranges.push(formatPickupRange(current, next));
    current = next;
  }
  return ranges;
};

const PICKUP_RANGES = buildPickupRanges();

const parseRangeStart = (label) => {
  const parts = label.split(' - ');
  if (parts.length !== 2) return null;
  const [startPart, endPart] = parts;
  const endMatch = endPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!endMatch) return null;
  const endPeriod = endMatch[3].toUpperCase();
  const startMatch = startPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!startMatch) return null;
  const period = (startMatch[3] || endPeriod).toUpperCase();
  return {
    hour: parseInt(startMatch[1], 10),
    minute: parseInt(startMatch[2], 10),
    period,
  };
};

const statusSteps = ['pending', 'in_prep', 'in_progress', 'ready', 'completed'];

export default function CustomerCartScreen() {
  const router = useRouter();
  const {
    cart,
    removeFromCart,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  } = useCart();

  const [selectedTime, setSelectedTime] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [orderStatus, setOrderStatus] = useState(null);

  const pickupTimes = PICKUP_RANGES;

  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });

  const cartCount = cart.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const finalTotal = total;
  const emptyMessage = 'Add items to start your order.';
  const cartItemsData = cart.length ? [{ key: 'cart-items' }] : [];

  const handleDecrease = (item) => {
    if (Number(item.quantity || 0) <= 1) {
      removeFromCart(item.id);
      return;
    }
    decreaseQuantity(item.id);
  };
  const handleEditItem = (item) => {
    const itemId = item.id ?? item.menu_item_id;
    if (itemId === null || itemId === undefined) {
      Alert.alert('Unavailable', 'This item cannot be customized right now.');
      return;
    }
    router.push({
      pathname: '/cart/customize',
      params: { itemId: String(itemId) },
    });
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = await getValidToken();
        if (!token) throw new Error('No valid token found.');
        const userRes = await api.get('/accounts/profile/', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = userRes.data;
        if (user) setCustomerName(user.name || '');
      } catch (err) {
        console.error(
          'Failed to fetch user data:',
          err.response?.data || err.message
        );
        Alert.alert('Error', 'Failed to fetch user info. Please log in again.');
      }
    };
    fetchUserData();
  }, []);

  const isTimeDisabled = (time) => {
    const parsed = parseRangeStart(time);
    if (!parsed) return false;
    let hour24 = parsed.hour % 12;
    if (parsed.period === 'PM') hour24 += 12;

    const now = new Date();
    const slotTime = new Date(now);
    slotTime.setHours(hour24, parsed.minute, 0, 0);

    if (hour24 >= 21 || hour24 < 4) return true;
    return slotTime <= now;
  };

  const handleProceed = () => {
    if (!customerName) {
      Alert.alert('User not loaded', 'Please log in first.');
      return;
    }
    if (!selectedTime) {
      Alert.alert(
        'Pickup Time Required',
        'Please select a pickup time before proceeding.'
      );
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Cart is empty', 'Please add items.');
      return;
    }
    goToPayment();
  };

  const goToPayment = async () => {
    setLoading(true);
    try {
      const token = await getValidToken();
      if (!token) throw new Error('No valid token found.');

      const parsedTime = parseRangeStart(selectedTime);
      if (!parsedTime) {
        throw new Error('Invalid pickup time selected.');
      }
      let hour24 = parsedTime.hour % 12;
      if (parsedTime.period === 'PM') hour24 += 12;

      const now = new Date();
      const pickupDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour24,
        parsedTime.minute,
        0
      );

      const subtotal = cart.reduce(
        (sum, item) => sum + parseFloat(item.price) * Number(item.quantity),
        0
      );

      const payload = {
        customer_name: customerName,
        order_type: 'pickup',
        subtotal,
        total_amount: finalTotal,
        payment_method: 'pending',
        promised_time: pickupDate.toISOString(),
        items: cart.map((item) => ({
          menu_item_id: item.id,
          name: item.name,
          price: parseFloat(item.price),
          quantity: Number(item.quantity),
          size: item.size || null,
          customize: item.customize || null,
        })),
      };

      const res = await createOrder(payload);
      if (!res.success) {
        Alert.alert('Order Error', res.message || 'Failed to create order');
        setLoading(false);
        return;
      }

      clearCart();
      setSelectedTime(null);
      setOrderStatus(null);

      router.push({
        pathname: '/cart/payment',
        params: {
          orderType: 'pickup',
          total: finalTotal.toFixed(2),
          selectedTime,
          orderId: res.order_number,
          celebrate: '1',
        },
      });
    } catch (err) {
      console.error('Create Order Error:', err);
      Alert.alert('Order Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStatusTracker = () => {
    if (!orderStatus) return null;
    const activeIndex = statusSteps.indexOf(orderStatus);
    const activeColor = '#F97316';
    const inactiveColor = '#E5E7EB';
    const inactiveText = '#9CA3AF';
    return (
      <View style={styles.statusContainer}>
        {statusSteps.map((step, index) => {
          const active = activeIndex >= index && activeIndex !== -1;
          return (
            <View key={step} style={styles.statusStep}>
              <View
                style={[
                  styles.statusCircle,
                  { backgroundColor: active ? activeColor : inactiveColor },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: active ? activeColor : inactiveText },
                ]}
              >
                {step.replace('_', ' ').toUpperCase()}
              </Text>
              {index < statusSteps.length - 1 && (
                <View
                  style={[
                    styles.statusLine,
                    { backgroundColor: active ? activeColor : inactiveColor },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderCartItemsCard = () => (
    <View style={styles.cartItemsCard}>
      {cart.map((item, index) => (
        <View
          key={String(item.id ?? item.menu_item_id ?? `${item.name}-${index}`)}
          style={[
            styles.cartItemRow,
            index < cart.length - 1 && styles.cartItemDivider,
          ]}
        >
          <Image
            source={resolveImageSource(item.image)}
            style={styles.cartItemImage}
            resizeMode="cover"
          />
          <View style={styles.cartItemInfo}>
            <View style={styles.cartItemTitleRow}>
              <Text style={styles.cartItemName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEditItem(item)}
            >
              <Ionicons name="create-outline" size={14} color="#9A3412" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <View style={styles.cartItemFooter}>
              <Text style={styles.cartItemPrice}>{`\u20b1${item.price}`}</Text>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  onPress={() => handleDecrease(item)}
                  style={styles.qtyButton}
                >
                  <Text style={styles.qtyButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => increaseQuantity(item.id)}
                  style={styles.qtyButton}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      ))}
      <View style={styles.cartTotalDivider} />
      <View style={styles.cartTotalRow}>
        <Text style={styles.cartTotalLabel}>Total</Text>
        <Text style={styles.cartTotalValue}>{`\u20b1${finalTotal}`}</Text>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      <LinearGradient
        colors={['#FFE4C7', '#FFC37A', '#FF8A3D']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.heroCard}
      >
        <View style={styles.heroRow}>
          <TouchableOpacity
            style={styles.heroIconButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>My Cart</Text>
            <Text style={styles.heroSubtitle}>
              {cartCount} items ready for pickup
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="cart-outline" size={14} color="#9A3412" />
            <Text style={styles.heroBadgeText}>{cartCount} items</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <Text style={styles.sectionSubtitle}>Review your order</Text>
        </View>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{cartCount} items</Text>
        </View>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Pickup Time</Text>
          <Text style={styles.sectionSubtitle}>Choose a slot</Text>
        </View>
      </View>
      <View style={styles.pickupCard}>
        <Text style={styles.pickupLabel}>Available today</Text>
        <View style={styles.pickupGrid}>
          {pickupTimes.map((time) => {
            const disabled = isTimeDisabled(time);
            const selected = selectedTime === time;
            return (
              <TouchableOpacity
                key={time}
                disabled={disabled}
                style={[
                  styles.pickupTimeBtn,
                  selected && styles.pickupTimeSelected,
                  disabled && styles.pickupTimeDisabled,
                ]}
                onPress={() => setSelectedTime(time)}
              >
                <Text
                  style={[
                    styles.pickupTimeText,
                    selected && styles.pickupTimeTextSelected,
                    disabled && styles.pickupTimeTextDisabled,
                  ]}
                >
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {orderStatus && (
        <View>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Order Status</Text>
              <Text style={styles.sectionSubtitle}>Live updates</Text>
            </View>
          </View>
          {renderStatusTracker()}
        </View>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptySubtitle}>{emptyMessage}</Text>
    </View>
  );

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading cart...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <FlatList
        data={cartItemsData}
        extraData={{ selectedTime, orderStatus, cartCount, total }}
        keyExtractor={(item) => item.key}
        renderItem={renderCartItemsCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={cart.length ? renderFooter : null}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: total > 0 ? 180 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {total > 0 && (
        <LinearGradient
          colors={['#FFFFFF', '#FFF3E4']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.checkoutBar}
        >
          <View style={styles.checkoutRow}>
            <View style={styles.checkoutInfo}>
              <View style={styles.checkoutBadge}>
                <Ionicons name="wallet-outline" size={14} color="#F97316" />
                <Text style={styles.checkoutLabel}>Total</Text>
              </View>
              <Text style={styles.checkoutValue}>{`\u20b1${finalTotal}`}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={handleProceed}
            >
              <Text style={styles.checkoutButtonText}>Proceed</Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color="#fff"
                style={styles.checkoutButtonIcon}
              />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      )}
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
  heroIconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginLeft: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
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
  cartItemsCard: {
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
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  cartItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3D6B7',
  },
  cartItemImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: '#F7EDE2',
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  editButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginLeft: 6,
  },
  cartItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  cartItemPrice: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FF7A18',
  },
  cartTotalDivider: {
    height: 1,
    backgroundColor: '#F3D6B7',
    marginVertical: 12,
  },
  cartTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  cartTotalValue: {
    fontSize: 26,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E4',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  qtyButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF7A18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  qtyText: {
    minWidth: 20,
    textAlign: 'center',
    fontWeight: '700',
    color: '#1F2937',
    marginHorizontal: 6,
  },
  pickupCard: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pickupLabel: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginBottom: 10,
  },
  pickupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  pickupTimeBtn: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
  },
  pickupTimeSelected: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  pickupTimeDisabled: {
    opacity: 0.4,
  },
  pickupTimeText: {
    fontSize: 12,
    fontFamily: 'Roboto_400Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  pickupTimeTextSelected: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
  },
  pickupTimeTextDisabled: {
    color: '#9CA3AF',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
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
  checkoutBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  checkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkoutInfo: {
    flex: 1,
    marginRight: 12,
  },
  checkoutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0E0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  checkoutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginLeft: 6,
  },
  checkoutValue: {
    fontSize: 26,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginTop: 6,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: '#F97316',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  checkoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  checkoutButtonIcon: {
    marginLeft: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statusStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    marginHorizontal: 4,
  },
  statusLine: {
    width: 24,
    height: 2,
    marginHorizontal: 2,
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
