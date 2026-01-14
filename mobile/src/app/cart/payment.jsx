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
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  confirmPayment,
  getCreditPoints,
  submitPaymentProof,
  USER_CACHE_KEY,
} from '../../api/api';

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
const GCASH_RECEIVER_NAME =
  process.env.EXPO_PUBLIC_GCASH_RECEIVER_NAME || 'TechnoMart';
const GCASH_RECEIVER_NUMBER =
  process.env.EXPO_PUBLIC_GCASH_RECEIVER_NUMBER || '09XXXXXXXXX';
const GCASH_QR_IMAGE = require('../../../assets/choices/GCash-QR.jpg');
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
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState(null);
  const [proofReference, setProofReference] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofError, setProofError] = useState('');
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

  const handleCopyNumber = async () => {
    if (!GCASH_RECEIVER_NUMBER) return;
    await Clipboard.setStringAsync(GCASH_RECEIVER_NUMBER);
    Alert.alert('Copied', 'GCash number copied to clipboard.');
  };

  const resolveImagePickerMediaTypes = () =>
    ImagePicker?.MediaType?.Images || ImagePicker?.MediaTypeOptions?.Images;

  const handlePickProofImage = async () => {
    setProofError('');
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission required',
          'Allow photo library access to upload payment proof.'
        );
        return;
      }
      const mediaTypes = resolveImagePickerMediaTypes();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        quality: 0.85,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setProofImage({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
    } catch (err) {
      console.warn('Failed to pick proof image', err);
      Alert.alert('Error', 'Unable to open image picker.');
    }
  };

  const handleSubmitProof = async () => {
    const targetId = orderNumber || resolvedCheckoutId || displayOrderNumber;
    if (!targetId) {
      Alert.alert('Error', 'Order reference is missing.');
      return;
    }
    if (!proofImage?.uri) {
      setProofError('Please upload your payment screenshot.');
      return;
    }
    setProofSubmitting(true);
    setProofError('');
    try {
      const response = await submitPaymentProof(targetId, {
        image: proofImage,
        referenceNumber: proofReference,
      });
      if (response?.success) {
        setProofModalOpen(false);
        setProofImage(null);
        setProofReference('');
        Alert.alert(
          'Payment submitted',
          'Your proof has been received and is pending verification.'
        );
        router.push({
          pathname: '/order-tracking',
          params: { orderId: displayOrderNumber || targetId },
        });
      } else {
        setProofError(response?.message || 'Failed to submit payment proof.');
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to submit payment proof.';
      setProofError(message);
    } finally {
      setProofSubmitting(false);
    }
  };

  const handlePaymentSelect = async (method) => {
    if (!resolvedCheckoutId) {
      Alert.alert('Error', 'Checkout session is missing.');
      return;
    }
    const normalizedMethod = method === 'counter' ? 'cash' : method;
    setSelectedPayment(normalizedMethod);

    if (normalizedMethod === 'gcash') {
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
      subtitle: 'Scan the QR and upload payment proof.',
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

        {selectedPayment === 'gcash' && (
          <View style={styles.gcashCard}>
            <Text style={styles.gcashTitle}>GCash Payment</Text>
            <Text style={styles.gcashSubtitle}>
              Scan the QR or send the exact amount to the receiver below.
            </Text>
            <View style={styles.gcashQrWrap}>
              <Image source={GCASH_QR_IMAGE} style={styles.gcashQr} />
            </View>
            <View style={styles.gcashRow}>
              <Text style={styles.gcashLabel}>Receiver</Text>
              <Text style={styles.gcashValue}>{GCASH_RECEIVER_NAME}</Text>
            </View>
            <View style={styles.gcashRow}>
              <Text style={styles.gcashLabel}>GCash Number</Text>
              <View style={styles.gcashValueRow}>
                <Text style={styles.gcashValue}>{GCASH_RECEIVER_NUMBER}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyNumber}
                >
                  <Ionicons name="copy-outline" size={16} color="#ea580c" />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.gcashRow}>
              <Text style={styles.gcashLabel}>Order ID</Text>
              <Text style={styles.gcashValue}>
                {displayOrderNumber || 'Pending'}
              </Text>
            </View>
            <View style={styles.gcashRow}>
              <Text style={styles.gcashLabel}>Exact Amount</Text>
              <Text style={styles.gcashValue}>
                {formatCurrency(totalAmount)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.proofButton}
              onPress={() => {
                setProofModalOpen(true);
                setProofError('');
              }}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.proofButtonText}>I already paid</Text>
            </TouchableOpacity>
            <Text style={styles.gcashHint}>
              Upload your payment screenshot for manual verification.
            </Text>
          </View>
        )}

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

      {/* Payment Proof Modal */}
      <Modal
        transparent
        visible={proofModalOpen}
        animationType="slide"
        onRequestClose={() => setProofModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.proofModal}>
            <Text style={styles.proofTitle}>Upload Payment Proof</Text>
            <Text style={styles.proofSubtitle}>
              Order #{displayOrderNumber || 'Pending'} -{' '}
              {formatCurrency(totalAmount)}
            </Text>
            <TouchableOpacity
              style={styles.proofPicker}
              onPress={handlePickProofImage}
              disabled={proofSubmitting}
            >
              {proofImage?.uri ? (
                <Image
                  source={{ uri: proofImage.uri }}
                  style={styles.proofPreview}
                />
              ) : (
                <View style={styles.proofPlaceholder}>
                  <Ionicons name="image-outline" size={34} color="#9ca3af" />
                  <Text style={styles.proofPlaceholderText}>
                    Tap to upload screenshot
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.proofField}>
              <Text style={styles.proofLabel}>Reference Number (optional)</Text>
              <TextInput
                style={styles.proofInput}
                value={proofReference}
                onChangeText={setProofReference}
                placeholder="e.g. 1234567890"
                editable={!proofSubmitting}
                keyboardType="number-pad"
              />
            </View>
            {proofError ? (
              <Text style={styles.proofError}>{proofError}</Text>
            ) : null}
            <View style={styles.proofActions}>
              <TouchableOpacity
                style={styles.proofCancel}
                onPress={() => setProofModalOpen(false)}
                disabled={proofSubmitting}
              >
                <Text style={styles.proofCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.proofSubmit}
                onPress={handleSubmitProof}
                disabled={proofSubmitting}
              >
                {proofSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.proofSubmitText}>Submit Proof</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  gcashCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#fed7aa',
    marginBottom: 16,
  },
  gcashTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  gcashSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  gcashQrWrap: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gcashQr: {
    width: 220,
    height: 220,
    resizeMode: 'contain',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fde7d2',
    backgroundColor: '#fff',
  },
  gcashRow: {
    marginTop: 12,
  },
  gcashLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  gcashValue: {
    marginTop: 4,
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Roboto_700Bold',
  },
  gcashValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  copyButtonText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#ea580c',
    fontFamily: 'Roboto_700Bold',
  },
  proofButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    paddingVertical: 12,
    borderRadius: 12,
  },
  proofButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
  },
  gcashHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#9a3412',
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
  proofModal: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },
  proofTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  proofSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  proofPicker: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  proofPreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  proofPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: '#f9fafb',
  },
  proofPlaceholderText: {
    marginTop: 8,
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'Roboto_400Regular',
  },
  proofField: {
    marginTop: 14,
  },
  proofLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto_400Regular',
  },
  proofInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    fontFamily: 'Roboto_400Regular',
  },
  proofError: {
    marginTop: 10,
    fontSize: 12,
    color: '#b91c1c',
    fontFamily: 'Roboto_700Bold',
  },
  proofActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  proofCancel: {
    flex: 1,
    marginRight: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
  },
  proofCancelText: {
    color: '#6b7280',
    fontFamily: 'Roboto_700Bold',
    fontSize: 14,
  },
  proofSubmit: {
    flex: 1,
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: '#f97316',
    paddingVertical: 10,
    alignItems: 'center',
  },
  proofSubmitText: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
    fontSize: 14,
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
