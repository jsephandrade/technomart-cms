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
  const { cart, clearCart } = useCart();
  const [profile, setProfile] = useState(null);
  const [creditPoints, setCreditPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creditModal, setCreditModal] = useState(false);
  const [specialOffers, setSpecialOffers] = useState([]);

  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const router = useRouter();

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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.cancelled) {
        const token = await getValidToken();
        const formData = new FormData();
        formData.append('image', {
          uri: result.uri,
          name: `avatar_${profile.id}.jpg`,
          type: 'image/jpeg',
        });

        await api.patch('/accounts/update-avatar/', formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });

        setProfile((prev) => ({ ...prev, image: result.uri }));
        Alert.alert('Success', 'Avatar updated successfully!');
      }
    } catch (err) {
      console.log(err);
      Alert.alert('Error', 'Failed to update avatar.');
    }
  };

  if (loading)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  if (!profile)
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>No profile data available.</Text>
      </View>
    );

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{
            uri:
              profile.image ||
              'https://cdn-icons-png.flaticon.com/512/847/847969.png',
          }}
          style={styles.avatar}
        />
        <TouchableOpacity onPress={pickAvatar}>
          <Text style={styles.editText}>Change Avatar</Text>
        </TouchableOpacity>
        <Text style={styles.name}>{safeString(profile.name)}</Text>
      </View>

      {/* Profile Info */}
      <View style={styles.infoContainer}>
        <View style={styles.infoCard}>
          <Ionicons name="id-card-outline" size={22} color="#f97316" />
          <Text style={styles.infoText}>ID: {safeString(profile.id)}</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="person-outline" size={22} color="#f97316" />
          <Text style={styles.infoText}>Role: {safeString(profile.role)}</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="checkmark-circle-outline" size={22} color="#f97316" />
          <Text style={styles.infoText}>
            Status: {safeString(profile.status)}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="mail-outline" size={22} color="#f97316" />
          <Text style={styles.infoText}>
            Email: {safeString(profile.email)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            setCreditModal(true);
          }}
        >
          <View style={styles.infoCard}>
            <Ionicons name="cash-outline" size={22} color="#f97316" />
            <Text style={styles.infoText}>
              Credit Points: {Number(creditPoints).toFixed(2)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      {/* Special Offers Modal */}
      <Modal visible={creditModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Special Offers</Text>
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
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        Redeem
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              }}
            />
            <TouchableOpacity
              style={[styles.modalBtn, styles.saveBtn]}
              onPress={() => setCreditModal(false)}
            >
              <Text style={{ color: '#fff' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff7ed', flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7ed',
  },
  header: { alignItems: 'center', marginBottom: 24, marginTop: 20 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#f97316',
  },
  name: { fontSize: 22, fontWeight: '700', color: '#111827' },
  editText: { color: '#f97316', marginBottom: 10, fontWeight: '600' },
  infoContainer: { marginVertical: 16 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoText: { marginLeft: 8, fontSize: 16, color: '#111827' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  logoutText: { color: '#fff', marginLeft: 8, fontWeight: '700' },
  message: { fontSize: 16, color: '#555' },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '95%',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    borderRadius: 6,
  },
  saveBtn: { backgroundColor: '#f97316' },
  offerCard: {
    backgroundColor: '#fff',
    marginHorizontal: SPACING / 2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: CARD_WIDTH,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  offerImage: { width: 80, height: 80, marginBottom: 8 },
  offerName: {
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  offerPoints: { color: '#f97316', marginBottom: 6 },
  redeemBtn: {
    backgroundColor: '#f97316',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
});
