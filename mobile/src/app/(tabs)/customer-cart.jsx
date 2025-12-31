import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
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
import api, { getValidToken, createOrder } from '../../api/api';
import { resolveImageSource } from '../../utils/image';

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

  const pickupTimes = [
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
    '5:00 PM',
    '6:00 PM',
    '7:00 PM',
    '8:00 PM',
    '9:00 PM',
  ];

  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const finalTotal = total;

  // ------------------------------ FETCH USER DATA
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

  // ------------------------------ DISABLE TIME FUNCTION
  const isTimeDisabled = (time) => {
    const [hour, minutePart] = time.split(':');
    let [minute, ampm] = minutePart.split(' ');
    let hour24 = parseInt(hour, 10);
    if (ampm === 'PM' && hour24 !== 12) hour24 += 12;
    if (ampm === 'AM' && hour24 === 12) hour24 = 0;

    const now = new Date();
    const slotTime = new Date(now);
    slotTime.setHours(hour24, parseInt(minute), 0, 0);

    if (hour24 >= 21 || hour24 < 4) return true; // Rule: disable 9 PM to 4 AM
    return slotTime <= now; // Disable past times
  };

  // ------------------------------ HANDLE ORDER
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

      const [hour, minutePart] = selectedTime.split(':');
      let [minute, ampm] = minutePart.split(' ');
      let hour24 = parseInt(hour, 10);
      if (ampm === 'PM' && hour24 !== 12) hour24 += 12;
      if (ampm === 'AM' && hour24 === 12) hour24 = 0;

      const now = new Date();
      const pickupDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour24,
        parseInt(minute),
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
        },
      });
    } catch (err) {
      console.error('Create Order Error:', err);
      Alert.alert('Order Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------ STATUS TRACKING
  const statusSteps = [
    'pending',
    'in_prep',
    'in_progress',
    'ready',
    'completed',
  ];

  const renderStatusTracker = () => {
    if (!orderStatus) return null;
    return (
      <View style={styles.statusContainer}>
        {statusSteps.map((step, index) => {
          const active = statusSteps.indexOf(orderStatus) >= index;
          return (
            <View key={step} style={styles.statusStep}>
              <View
                style={[
                  styles.statusCircle,
                  { backgroundColor: active ? '#27ae60' : '#ccc' },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: active ? '#27ae60' : '#999' },
                ]}
              >
                {step.replace('_', ' ').toUpperCase()}
              </Text>
              {index < statusSteps.length - 1 && (
                <View
                  style={[
                    styles.statusLine,
                    { backgroundColor: active ? '#27ae60' : '#ccc' },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Image
        source={resolveImageSource(item.image)}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.details}>
        <View style={styles.itemHeader}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.price}>₱{item.price}</Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={() => decreaseQuantity(item.id)}
            style={styles.controlBtn}
          >
            <Ionicons name="remove" size={18} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.qty}>{item.quantity}</Text>
          <TouchableOpacity
            onPress={() => increaseQuantity(item.id)}
            style={styles.controlBtn}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => removeFromCart(item.id)}
        style={styles.trashBtn}
      >
        <Ionicons name="trash-outline" size={22} color="#f97316" />
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => (
    <View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Final Total</Text>
        <Text style={styles.finalTotal}>₱{finalTotal}</Text>
      </View>

      <View style={styles.pickupContainer}>
        <Text style={styles.pickupLabel}>Select Pickup Time:</Text>
        <View style={styles.pickupGrid}>
          {pickupTimes.map((time) => {
            const disabled = isTimeDisabled(time);
            return (
              <TouchableOpacity
                key={time}
                disabled={disabled}
                style={[
                  styles.pickupTimeBtn,
                  selectedTime === time && styles.pickupTimeSelected,
                  disabled && { opacity: 0.4 },
                ]}
                onPress={() => setSelectedTime(time)}
              >
                <Text
                  style={[
                    styles.pickupTimeText,
                    selectedTime === time && {
                      color: '#fff',
                      fontFamily: 'Roboto_700Bold',
                    },
                    disabled && { color: '#777' },
                  ]}
                >
                  {time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {renderStatusTracker()}
    </View>
  );

  if (!fontsLoaded || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../../assets/drop_1.png')}
        resizeMode="cover"
        style={styles.headerBackground}
      >
        <View style={styles.overlay} />
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Cart</Text>
            <Ionicons name="cart-outline" size={26} color="black" />
          </View>
        </View>
      </ImageBackground>

      {cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>Your cart is empty</Text>
        </View>
      ) : (
        <FlatList
          data={cart}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 150 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListFooterComponent={renderFooter}
        />
      )}

      {total > 0 && (
        <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed}>
          <Text style={styles.proceedText}>Proceed to Payment</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ------------------------------ STYLES
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfdfd' },
  headerBackground: {
    width: '100%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(254,192,117,0.5)',
  },
  headerContainer: { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 14 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 30, fontFamily: 'Roboto_700Bold', color: 'black' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginVertical: 8,
    marginHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: '#F7EDE2',
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  details: { flex: 1 },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  price: { fontSize: 16, fontFamily: 'Roboto_700Bold', color: '#F97316' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFF3E4',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  controlBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    minWidth: 24,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  trashBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#FFF0E0',
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: {
    marginTop: 5,
    fontSize: 18,
    fontFamily: 'Roboto_400Regular',
    color: '#999',
  },
  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  finalTotal: {
    fontSize: 24,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginTop: 6,
  },
  pickupContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    shadowColor: '#000',
    shadowOpacity: 0.06,
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
    width: '30%',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
  },
  pickupTimeSelected: { backgroundColor: '#F97316', borderColor: '#F97316' },
  pickupTimeText: {
    fontSize: 12,
    fontFamily: 'Roboto_400Regular',
    color: '#6B7280',
  },
  proceedBtn: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#27ae60',
    paddingVertical: 14,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  proceedText: { color: '#fff', fontFamily: 'Roboto_700Bold', fontSize: 16 },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 12,
  },
  statusStep: { flexDirection: 'row', alignItems: 'center' },
  statusCircle: { width: 16, height: 16, borderRadius: 8 },
  statusText: { fontSize: 12, marginHorizontal: 4 },
  statusLine: { width: 24, height: 2, marginHorizontal: 2 },
});
