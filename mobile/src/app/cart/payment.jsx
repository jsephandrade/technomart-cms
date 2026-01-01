import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  Switch,
  Modal,
  Animated,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { getGcashLink, confirmPayment, getCreditPoints } from '../../api/api';

export default function PaymentPage() {
  const router = useRouter();
  const { orderType, total, selectedTime, orderId } = useLocalSearchParams();
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creditPoints, setCreditPoints] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const totalAmount = Number(total) || 0;
  const pointsEligible = creditPoints >= totalAmount && totalAmount > 0;

  useEffect(() => {
    if (showSuccess) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else fadeAnim.setValue(0);
  }, [showSuccess]);

  useEffect(() => {
    let isMounted = true;
    const loadPoints = async () => {
      try {
        const points = await getCreditPoints();
        if (isMounted) {
          setCreditPoints(Number(points) || 0);
        }
      } catch (err) {
        console.warn('Failed to load credit points', err);
        if (isMounted) {
          setCreditPoints(0);
        }
      }
    };
    loadPoints();
    return () => {
      isMounted = false;
    };
  }, []);

  let [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });
  if (!fontsLoaded) return null;

  const handlePaymentSelect = async (method) => {
    setSelectedPayment(method);

    if (method === 'gcash') {
      try {
        const { gcash_url } = await getGcashLink(orderId, total);
        const supported = await Linking.canOpenURL(gcash_url);
        if (!supported) {
          Alert.alert(
            'GCash not installed',
            'Please install GCash to continue.'
          );
          return;
        }
        await Linking.openURL(gcash_url);
        setLoading(true);

        // Polling after GCash payment
        setTimeout(async () => {
          const res = await confirmPayment(orderId, method);
          setLoading(false);
          if (res.success) {
            setShowSuccess(true);

            // Navigate to Order Tracking after 4 seconds
            setTimeout(() => {
              setShowSuccess(false);
              router.push({
                pathname: '/order-tracking',
                params: { orderId: orderId }, // pass orderId if needed
              });
            }, 4000);
          } else {
            Alert.alert('Payment Failed', res.message);
          }
        }, 6000);
      } catch (err) {
        console.log(err);
        setLoading(false);
        Alert.alert('Error', 'Something went wrong with GCash payment.');
      }
    } else if (method === 'counter') {
      try {
        const res = await confirmPayment(orderId, method);
        if (res.success) {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            router.push({
              pathname: '/order-tracking',
              params: { orderId: orderId },
            });
          }, 4000);
        } else {
          Alert.alert('Payment Failed', res.message);
        }
      } catch {
        Alert.alert('Error', 'Could not confirm counter payment.');
      }
    } else if (method === 'points') {
      if (!pointsEligible) {
        Alert.alert(
          'Not enough points',
          'Your credit points are not enough to cover this order.'
        );
        return;
      }
      try {
        const res = await confirmPayment(orderId, method);
        if (res.success) {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            router.push({
              pathname: '/order-tracking',
              params: { orderId: orderId },
            });
          }, 4000);
        } else {
          Alert.alert('Payment Failed', res.message);
        }
      } catch {
        Alert.alert('Error', 'Could not confirm points payment.');
      }
    }
  };

  if (!orderId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Missing order details. Go back to cart.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../../assets/drop_1.png')}
        style={styles.headerBackground}
      >
        <View style={styles.overlay} />
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Payment Page</Text>
            <Ionicons name="card-outline" size={26} color="black" />
          </View>
        </View>
      </ImageBackground>

      <View style={styles.receiptCard}>
        <Text style={styles.receiptHeader}>Order Receipt</Text>
        <View style={styles.line} />
        <View style={styles.receiptRow}>
          <Text style={styles.label}>Order Type</Text>
          <Text style={styles.value}>{orderType}</Text>
        </View>
        <View style={styles.receiptRow}>
          <Text style={styles.label}>Pickup Time</Text>
          <Text style={styles.value}>{selectedTime}</Text>
        </View>
        <View style={styles.line} />
        <View style={styles.receiptRow}>
          <Text style={[styles.label, { fontWeight: 'bold' }]}>Total</Text>
          <Text style={[styles.value, { fontWeight: 'bold' }]}>
            ₱{totalAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Payment Buttons */}
      <TouchableOpacity
        style={[
          styles.paymentBtn,
          selectedPayment === 'gcash' && styles.selectedBtn,
          selectedPayment === 'points' && styles.disabledBtn,
        ]}
        disabled={selectedPayment === 'points'}
        onPress={() => handlePaymentSelect('gcash')}
      >
        <Image
          source={require('../../../assets/gcash.png')}
          style={styles.icon}
        />
        <Text style={styles.paymentText}>Pay with GCash</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.paymentBtn,
          selectedPayment === 'counter' && styles.selectedBtn,
          selectedPayment === 'points' && styles.disabledBtn,
        ]}
        disabled={selectedPayment === 'points'}
        onPress={() => handlePaymentSelect('counter')}
      >
        <Image
          source={require('../../../assets/cash.png')}
          style={styles.icon}
        />
        <Text style={styles.paymentText}>Pay at Counter</Text>
      </TouchableOpacity>

      <View style={styles.pointsCard}>
        <View style={styles.pointsInfo}>
          <Text style={styles.pointsTitle}>Use Points</Text>
          <Text style={styles.pointsSubtitle}>
            Available: {creditPoints.toFixed(2)} pts
          </Text>
          {!pointsEligible && (
            <Text style={styles.pointsHint}>
              Not enough points to cover this order.
            </Text>
          )}
        </View>
        <Switch
          value={selectedPayment === 'points'}
          onValueChange={(value) => {
            if (value) {
              handlePaymentSelect('points');
            } else {
              setSelectedPayment(null);
            }
          }}
          disabled={!pointsEligible}
          thumbColor={selectedPayment === 'points' ? '#f97316' : '#f3f4f6'}
          trackColor={{ false: '#e5e7eb', true: '#fed7aa' }}
        />
      </View>

      {loading && (
        <Text style={{ textAlign: 'center', marginTop: 10 }}>
          Waiting for confirmation...
        </Text>
      )}

      {/* Success Modal */}
      <Modal transparent visible={showSuccess}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.successBox, { opacity: fadeAnim }]}>
            <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
            <Text style={styles.successTitle}>Payment Successful!</Text>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBackground: { paddingBottom: 8 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,200,150,0.4)',
  },
  headerContainer: { paddingTop: 50, paddingHorizontal: 12 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 26, fontFamily: 'Roboto_700Bold' },
  receiptCard: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignSelf: 'center',
    borderColor: '#ccc',
    borderWidth: 1,
    marginVertical: 20,
  },
  line: { borderBottomColor: '#ccc', borderBottomWidth: 1, marginVertical: 8 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { fontSize: 16 },
  value: { fontSize: 16, fontWeight: '600' },
  paymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    padding: 14,
    borderRadius: 12,
    width: '85%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    elevation: 3,
  },
  selectedBtn: {
    backgroundColor: '#f0fdf4',
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  icon: { width: 50, height: 40 },
  paymentText: { fontSize: 16, fontWeight: '600', marginLeft: 10 },
  pointsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '85%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f3d6b7',
  },
  pointsInfo: {
    flex: 1,
    marginRight: 12,
  },
  pointsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  pointsSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  pointsHint: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
  },
  successTitle: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '700',
    color: '#16a34a',
  },
});
