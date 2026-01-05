import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  Switch,
  Modal,
  Animated,
  Alert,
  ActivityIndicator,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirmPayment, getCreditPoints, USER_CACHE_KEY } from '../../api/api';

const PARTY_DURATION_MS = 2600;
const PARTY_PIECE_COUNT = 18;
const PARTY_COLORS = [
  '#F97316',
  '#F59E0B',
  '#FACC15',
  '#22C55E',
  '#38BDF8',
  '#FB7185',
];
const GCASH_CHECKOUT_URL =
  'https://checkout-staging.xendit.co/od/technomart-gcashpayment';

const createPartyPieces = () =>
  Array.from({ length: PARTY_PIECE_COUNT }, (_, index) => {
    const leftPct = ((index * 37) % 90) / 100 + 0.05;
    const size = 6 + (index % 4) * 3;
    const delay = (index % 6) * 90;
    const duration = 1200 + (index % 5) * 160;
    const drift = (index % 2 === 0 ? -1 : 1) * (10 + (index % 3) * 8);
    const spin = (index % 2 === 0 ? 1 : -1) * (120 + (index % 4) * 60);
    return {
      id: index,
      leftPct,
      size,
      color: PARTY_COLORS[index % PARTY_COLORS.length],
      delay,
      duration,
      drift,
      spin,
      shape: index % 3 === 0 ? 'circle' : 'rect',
      progress: new Animated.Value(0),
    };
  });

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return '\u20b10.00';
  return `\u20b1${amount.toFixed(2)}`;
};

const formatLabel = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function PaymentPage() {
  const router = useRouter();
  const {
    orderType,
    total,
    selectedTime,
    orderId,
    checkoutId,
    orderNumber,
    celebrate,
  } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creditPoints, setCreditPoints] = useState(0);
  const [isGuest, setIsGuest] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const partyPieces = useRef(createPartyPieces()).current;
  const partyTimerRef = useRef(null);
  const hasCelebratedRef = useRef(false);
  const totalAmount = Number(total) || 0;
  const pointsEligible =
    !isGuest && creditPoints >= totalAmount && totalAmount > 0;
  const shouldCelebrate = celebrate === '1' || celebrate === 'true';
  const fallDistance = Math.max(240, height + 120);
  const orderTypeLabel = formatLabel(orderType) || 'Pickup';
  const timeLabel = selectedTime || 'Not set';
  const resolvedCheckoutId = checkoutId || orderId;
  const displayOrderNumber = orderNumber || orderId || checkoutId || '';

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
    if (!shouldCelebrate || hasCelebratedRef.current) return;
    hasCelebratedRef.current = true;
    setShowParty(true);
    partyPieces.forEach((piece) => {
      piece.progress.stopAnimation();
      piece.progress.setValue(0);
      Animated.timing(piece.progress, {
        toValue: 1,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    if (partyTimerRef.current) {
      clearTimeout(partyTimerRef.current);
    }
    partyTimerRef.current = setTimeout(() => {
      setShowParty(false);
    }, PARTY_DURATION_MS);
  }, [partyPieces, shouldCelebrate]);

  useEffect(
    () => () => {
      if (partyTimerRef.current) {
        clearTimeout(partyTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    const loadSession = async () => {
      let guest = false;
      try {
        const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
        const storedUser = entries[0][1] || entries[1][1];
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            const email = String(parsed?.email || '').toLowerCase();
            guest = email.endsWith('@guest.local');
          } catch (err) {
            console.warn('Failed to parse stored user in payment:', err);
          }
        }
      } catch (err) {
        console.warn('Failed to read stored user in payment:', err);
      }
      if (isMounted) {
        setIsGuest(guest);
      }
      if (guest) {
        if (isMounted) {
          setCreditPoints(0);
        }
        return;
      }
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
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  let [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });
  if (!fontsLoaded) return null;

  const handlePaymentSuccess = (confirmedOrderNumber) => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      router.push({
        pathname: '/order-tracking',
        params: { orderId: confirmedOrderNumber || displayOrderNumber },
      });
    }, 4000);
  };

  const handlePaymentSelect = async (method) => {
    if (!resolvedCheckoutId) {
      Alert.alert('Error', 'Checkout session is missing.');
      return;
    }
    const normalizedMethod = method === 'counter' ? 'cash' : method;
    setSelectedPayment(normalizedMethod);

    if (normalizedMethod === 'gcash') {
      try {
        const supported = await Linking.canOpenURL(GCASH_CHECKOUT_URL);
        if (!supported) {
          Alert.alert(
            'Unable to open GCash checkout',
            'Please try again or choose another payment method.'
          );
          return;
        }
        await Linking.openURL(GCASH_CHECKOUT_URL);
        setLoading(true);

        // Polling after GCash payment
        setTimeout(async () => {
          const res = await confirmPayment(
            resolvedCheckoutId,
            normalizedMethod
          );
          setLoading(false);
          if (res.success) {
            handlePaymentSuccess(res.order_number);
          } else {
            Alert.alert('Payment Failed', res.message);
          }
        }, 6000);
      } catch (err) {
        console.log(err);
        setLoading(false);
        Alert.alert('Error', 'Something went wrong with GCash payment.');
      }
      return;
    }

    if (normalizedMethod === 'points') {
      if (isGuest) {
        setSelectedPayment(null);
        Alert.alert(
          'Sign in to use points',
          'Create an account to earn and use credit points.'
        );
        return;
      }
      if (!pointsEligible) {
        setSelectedPayment(null);
        Alert.alert(
          'Not enough points',
          'Your credit points are not enough to cover this order.'
        );
        return;
      }
    }

    try {
      setLoading(true);
      const res = await confirmPayment(resolvedCheckoutId, normalizedMethod);
      setLoading(false);
      if (res.success) {
        handlePaymentSuccess(res.order_number);
      } else {
        Alert.alert('Payment Failed', res.message);
      }
    } catch {
      setLoading(false);
      Alert.alert(
        'Error',
        normalizedMethod === 'cash'
          ? 'Could not confirm cash payment.'
          : 'Could not confirm points payment.'
      );
    }
  };

  if (!resolvedCheckoutId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Missing checkout details. Go back to cart.
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const paymentOptions = [
    {
      key: 'gcash',
      title: 'Pay with GCash',
      subtitle: 'Complete payment via the Xendit GCash checkout.',
      icon: require('../../../assets/gcash.png'),
    },
    {
      key: 'cash',
      title: 'Pay at the Counter',
      subtitle: 'Cash payment confirmed by the cashier.',
      icon: require('../../../assets/cash.png'),
    },
  ];

  return (
    <View style={styles.container}>
      {showParty ? (
        <View pointerEvents="none" style={styles.partyOverlay}>
          {partyPieces.map((piece) => {
            const translateY = piece.progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-40, fallDistance],
            });
            const translateX = piece.progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, piece.drift],
            });
            const rotate = piece.progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${piece.spin}deg`],
            });
            const opacity = piece.progress.interpolate({
              inputRange: [0, 0.9, 1],
              outputRange: [1, 1, 0],
            });
            return (
              <Animated.View
                key={`party-${piece.id}`}
                style={[
                  styles.partyPiece,
                  {
                    left: width * piece.leftPct,
                    width: piece.size,
                    height: piece.size,
                    backgroundColor: piece.color,
                    borderRadius: piece.shape === 'circle' ? piece.size : 3,
                    opacity,
                    transform: [{ translateX }, { translateY }, { rotate }],
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
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
            <Text style={styles.headerTitle}>Payment</Text>
            <Ionicons name="card-outline" size={26} color="black" />
          </View>
        </View>
      </ImageBackground>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.sectionBadge}>
              <Ionicons name="receipt-outline" size={14} color="#b45309" />
              <Text style={styles.sectionBadgeText}>
                Order #{displayOrderNumber || 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order Type</Text>
            <Text style={styles.summaryValue}>{orderTypeLabel}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pickup Time</Text>
            <Text style={styles.summaryValue}>{timeLabel}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>
              {formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Payment Options</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Select one method to continue.
          </Text>
        </View>

        {paymentOptions.map((option) => {
          const isSelected = selectedPayment === option.key;
          const isDisabled =
            loading ||
            (selectedPayment === 'points' && option.key !== 'points');
          return (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.paymentOption,
                isSelected && styles.paymentOptionSelected,
                isDisabled && styles.paymentOptionDisabled,
              ]}
              onPress={() => handlePaymentSelect(option.key)}
              disabled={isDisabled}
              activeOpacity={0.85}
            >
              <View style={styles.paymentIconWrap}>
                <Image source={option.icon} style={styles.paymentIcon} />
              </View>
              <View style={styles.paymentBody}>
                <Text style={styles.paymentTitle}>{option.title}</Text>
                <Text style={styles.paymentSubtitle}>{option.subtitle}</Text>
              </View>
              {loading && isSelected ? (
                <ActivityIndicator size="small" color="#f97316" />
              ) : (
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                  size={22}
                  color={isSelected ? '#f97316' : '#9ca3af'}
                />
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.pointsCard}>
          <View style={styles.pointsInfo}>
            <Text style={styles.pointsTitle}>Use Points</Text>
            <Text style={styles.pointsSubtitle}>
              Available: {creditPoints.toFixed(2)} pts
            </Text>
            {isGuest ? (
              <Text style={styles.pointsHint}>
                Sign in to earn and use credit points.
              </Text>
            ) : !pointsEligible ? (
              <Text style={styles.pointsHint}>
                Not enough points to cover this order.
              </Text>
            ) : null}
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
            disabled={!pointsEligible || loading}
            thumbColor={selectedPayment === 'points' ? '#f97316' : '#f3f4f6'}
            trackColor={{ false: '#e5e7eb', true: '#fed7aa' }}
          />
        </View>

        {loading && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#f97316" />
            <Text style={styles.processingText}>
              Processing your payment...
            </Text>
          </View>
        )}
      </ScrollView>

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
  headerContainer: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 12 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'Roboto_700Bold',
    color: '#1F2937',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 10,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    paddingBottom: 36,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: '#1F2937',
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sectionBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    fontFamily: 'Roboto_700Bold',
    color: '#b45309',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#f97316',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Roboto_400Regular',
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: 'Roboto_700Bold',
    color: '#1F2937',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#fde7d2',
    marginVertical: 6,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#1F2937',
  },
  summaryTotalValue: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: '#f97316',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#fde7d2',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentOptionSelected: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
  },
  paymentOptionDisabled: {
    opacity: 0.6,
  },
  paymentIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  paymentBody: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  paymentSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  pointsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: '#f97316',
    marginTop: 4,
  },
  pointsInfo: {
    flex: 1,
    marginRight: 12,
  },
  pointsTitle: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  pointsSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontFamily: 'Roboto_400Regular',
  },
  pointsHint: {
    fontSize: 11,
    color: '#b45309',
    marginTop: 6,
    fontFamily: 'Roboto_400Regular',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  processingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  errorText: {
    marginTop: 24,
    textAlign: 'center',
    fontFamily: 'Roboto_700Bold',
    color: '#b91c1c',
    fontSize: 16,
    marginHorizontal: 24,
  },
  backBtn: {
    marginTop: 16,
    alignSelf: 'center',
    backgroundColor: '#f97316',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
  },
  backBtnText: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
    fontSize: 16,
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
    fontFamily: 'Roboto_700Bold',
    color: '#16a34a',
  },
  partyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    overflow: 'hidden',
  },
  partyPiece: {
    position: 'absolute',
    top: -20,
  },
});
