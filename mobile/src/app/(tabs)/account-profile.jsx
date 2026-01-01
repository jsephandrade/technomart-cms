import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Roboto_700Bold } from '@expo-google-fonts/roboto';
import api, {
  clearStoredTokens,
  getValidToken,
  USER_CACHE_KEY,
} from '../../api/api';
import { useCart } from '../../context/CartContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = 140;
const SPACING = 16;

export default function AccountProfile() {
  const { clearCart } = useCart();
  const [profile, setProfile] = useState(null);
  const [creditPoints, setCreditPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(false);
  const [specialOffers, setSpecialOffers] = useState([]);

  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Roboto_700Bold });

  const safeString = (val) => (val != null ? String(val) : 'N/A');

  // --- Load user profile & credit points ---
  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
      const userData = entries[0][1] || entries[1][1];
      if (!userData) {
        setProfile(null);
        setCreditPoints(0);
        return;
      }

      const parsed = JSON.parse(userData);
      setProfile(parsed);

      const token = await getValidToken();
      if (!token) throw new Error('No access token');

      let points = 0;

      try {
        const res = await api.get('/orders/user-credit-points/', {
          headers: { Authorization: `Bearer ${token}` },
        });

        // ✅ Only use credit_points if response is an object and has the field
        if (
          res.data &&
          typeof res.data === 'object' &&
          'credit_points' in res.data
        ) {
          points = res.data.credit_points ?? 0;
        }
      } catch (apiErr) {
        // If API fails or returns HTML, fallback to 0
        console.warn('Failed to fetch credit points, defaulting to 0', apiErr);
        points = 0;
      }

      setCreditPoints(points);
    } catch (err) {
      console.error('loadProfile outer error:', err);
      setProfile((prev) => prev ?? null);
      setCreditPoints(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Load special offers ---
  const loadSpecialOffers = useCallback(async () => {
    try {
      const token = await getValidToken();
      if (!token) throw new Error('No access token');

      const res = await api.get('/offers/', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const offers = res.data.offers.map((o) => ({
        ...o,
        points: o.required_points,
      }));

      setSpecialOffers(offers);
    } catch (err) {
      console.error(
        'loadSpecialOffers error:',
        err.response?.status,
        err.response?.data || err.message
      );
      if (err.response?.status === 401) {
        Alert.alert(
          'Unauthorized',
          'Cannot fetch special offers. Please log in again if the issue persists.'
        );
      } else {
        Alert.alert('Error', 'Failed to load special offers.');
      }
    }
  }, []);

  // --- Run on screen focus ---
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadSpecialOffers();
    }, [loadProfile, loadSpecialOffers])
  );

  const openCreditModal = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setCreditModal(true);
  }, []);

  const handleRewardsPress = useCallback(() => {
    router.push('/customer-cart');
  }, [router]);

  // --- Logout ---
  const handleLogout = () => {
    Alert.alert('Confirm Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearStoredTokens();
          router.replace('/account-login');
        },
      },
    ]);
  };

  // --- Redeem offer ---
  const redeemOffer = async (offer) => {
    const points = Number(creditPoints) || 0; // ensure it's a number

    if (points < offer.points) {
      Alert.alert(
        'Not enough points',
        `You need ${offer.points} points to redeem this offer, but you only have ${points.toFixed(2)} points.`
      );
      return; // Exit early
    }

    try {
      const token = await getValidToken();
      if (!token) throw new Error('No access token');

      const res = await api.post(
        '/orders/redeem-offer/',
        { offer_id: offer.id, points_used: offer.points },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCreditPoints(res.data.remaining_points ?? points);
      clearCart();
      Alert.alert(
        'Success',
        `You redeemed ${offer.name} for ${offer.points} points!`
      );
      setCreditModal(false);
    } catch (err) {
      console.error('redeemOffer error:', err.response?.data || err.message);

      const message =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Failed to redeem the offer.';

      Alert.alert('Error', message);
    }
  };

  // --- Pick avatar ---
  const pickAvatar = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access so we can update your profile picture.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || result.cancelled) {
        return;
      }

      const asset =
        (Array.isArray(result.assets) && result.assets[0]) || result;
      const base64 = asset?.base64;
      if (!base64) {
        Alert.alert('Upload failed', 'We could not read the selected image.');
        return;
      }

      let mimeType = asset?.mimeType || asset?.type || 'image/jpeg';
      if (typeof mimeType === 'string' && !mimeType.includes('/')) {
        mimeType = 'image/jpeg';
      }
      const avatar = `data:${mimeType};base64,${base64}`;

      const token = await getValidToken();
      if (!token) throw new Error('No access token');

      const res = await api.patch(
        '/accounts/update-avatar/',
        { avatar },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const avatarUrl =
        res?.data?.avatar_url || res?.data?.avatar || res?.data?.url || avatar;

      setProfile((prev) => {
        const nextProfile = {
          ...prev,
          avatar: avatarUrl,
          image: avatarUrl,
        };
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextProfile)).catch(
          () => {}
        );
        return nextProfile;
      });
      Alert.alert('Success', 'Avatar updated successfully!');
    } catch (err) {
      console.log(err);
      Alert.alert('Error', 'Failed to update avatar.');
    }
  };

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.emptyCard}>
          <Ionicons name="person-circle-outline" size={42} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No profile data</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to view your account details.
          </Text>
        </View>
      </View>
    );
  }

  const creditValue = Number(creditPoints || 0).toFixed(2);
  const rewardCount = Array.isArray(specialOffers) ? specialOffers.length : 0;
  const profileDetails = [
    {
      key: 'id',
      label: 'ID',
      value: safeString(profile.id),
      icon: 'id-card-outline',
    },
    {
      key: 'role',
      label: 'Role',
      value: safeString(profile.role),
      icon: 'person-outline',
    },
    {
      key: 'status',
      label: 'Status',
      value: safeString(profile.status),
      icon: 'checkmark-circle-outline',
    },
    {
      key: 'email',
      label: 'Email',
      value: safeString(profile.email),
      icon: 'mail-outline',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        ref={scrollRef}
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
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={pickAvatar}
              activeOpacity={0.85}
            >
              <Image
                source={{
                  uri:
                    profile.avatar ||
                    profile.image ||
                    'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                }}
                style={styles.avatar}
              />
              <View style={styles.avatarBadge}>
                <Ionicons name="camera-outline" size={14} color="#9A3412" />
              </View>
            </TouchableOpacity>

            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{safeString(profile.name)}</Text>
              <Text style={styles.heroSubtitle}>
                {safeString(profile.role)} | {safeString(profile.status)}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {safeString(profile.email)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.heroBadge}
              onPress={handleRewardsPress}
              activeOpacity={0.85}
            >
              <Text style={styles.heroBadgeLabel}>Points</Text>
              <Text style={styles.heroBadgeValue}>{creditValue}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.heroAction} onPress={pickAvatar}>
            <Ionicons name="image-outline" size={14} color="#9A3412" />
            <Text style={styles.heroActionText}>Change avatar</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Profile Details</Text>
            <Text style={styles.sectionSubtitle}>Account information</Text>
          </View>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{profileDetails.length}</Text>
          </View>
        </View>

        {profileDetails.map((detail) => (
          <View key={detail.key} style={styles.infoCard}>
            <View style={styles.infoIconWrap}>
              <Ionicons name={detail.icon} size={18} color="#F97316" />
            </View>
            <View style={styles.infoBody}>
              <Text style={styles.infoLabel}>{detail.label}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {detail.value}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Rewards</Text>
            <Text style={styles.sectionSubtitle}>Redeem special offers</Text>
          </View>
          <TouchableOpacity
            style={styles.sectionBadge}
            onPress={openCreditModal}
          >
            <Text style={styles.sectionBadgeText}>{rewardCount}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleRewardsPress}
          activeOpacity={0.85}
          style={styles.infoCard}
        >
          <View style={styles.infoIconWrap}>
            <Ionicons name="cash-outline" size={18} color="#F97316" />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoLabel}>Credit Points</Text>
            <Text style={styles.infoValue}>{creditValue} pts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Account Actions</Text>
            <Text style={styles.sectionSubtitle}>Manage your access</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={creditModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Special Offers</Text>
              <Text style={styles.modalSubtitle}>
                Redeem your points for rewards.
              </Text>
            </View>
            <Animated.FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={specialOffers}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{
                paddingHorizontal: (width - CARD_WIDTH) / 2,
              }}
              snapToInterval={CARD_WIDTH + SPACING}
              decelerationRate="fast"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              renderItem={({ item, index }) => {
                const inputRange = [
                  (index - 1) * (CARD_WIDTH + SPACING),
                  index * (CARD_WIDTH + SPACING),
                  (index + 1) * (CARD_WIDTH + SPACING),
                ];
                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.8, 1, 0.8],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    style={[styles.offerCard, { transform: [{ scale }] }]}
                  >
                    <Image
                      source={{ uri: item.image }}
                      style={styles.offerImage}
                    />
                    <Text style={styles.offerName}>{item.name}</Text>
                    <Text style={styles.offerPoints}>{item.points} pts</Text>
                    <TouchableOpacity
                      style={styles.redeemBtn}
                      onPress={() => redeemOffer(item)}
                    >
                      <Text style={styles.redeemText}>Redeem</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
            <TouchableOpacity
              style={[styles.modalBtn, styles.saveBtn]}
              onPress={() => setCreditModal(false)}
            >
              <Text style={styles.modalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
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
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#FFE7C7',
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginRight: 12,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F97316',
  },
  heroContent: {
    flex: 1,
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
  heroMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  heroBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 64,
  },
  heroBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9A3412',
  },
  heroBadgeValue: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#9A3412',
    marginTop: 2,
  },
  heroAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  heroActionText: {
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBody: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#9A3412',
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    paddingVertical: 14,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#F97316',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  logoutText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 80,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    width: '92%',
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 12,
    borderRadius: 999,
  },
  saveBtn: {
    backgroundColor: '#F97316',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  offerCard: {
    backgroundColor: '#fff',
    marginHorizontal: SPACING / 2,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    width: CARD_WIDTH,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F3D6B7',
  },
  offerImage: {
    width: 88,
    height: 88,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#F7EDE2',
  },
  offerName: {
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    color: '#111827',
  },
  offerPoints: {
    color: '#9A3412',
    marginBottom: 8,
    fontWeight: '700',
  },
  redeemBtn: {
    backgroundColor: '#F97316',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  redeemText: {
    color: '#fff',
    fontWeight: '700',
  },
});
