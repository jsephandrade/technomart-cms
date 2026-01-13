import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMenuItems, USER_CACHE_KEY } from '../../../api/api';
import { useCart } from '../../../context/CartContext';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import { resolveImageSource } from '../../../utils/image';
import { getPaxRemaining, isPaxAvailable } from '../../../utils/pax';

export default function CategoryScreen() {
  const { category } = useLocalSearchParams();
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity, removeFromCart } = useCart();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
        const userData = entries[0][1] || entries[1][1];
        const parsed = userData ? JSON.parse(userData) : null;
        setRole(parsed?.role || 'customer');

        const menu = await fetchMenuItems();
        const filtered = (menu || []).filter(
          (item) => item.category === category
        );
        setItems(filtered);
      } catch (err) {
        console.error('Error loading category items', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [category]);

  const isCatering = category === 'Catering';

  if (loading || role === null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#fff7ed',
        }}
      >
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (isCatering && role !== 'faculty') {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          backgroundColor: '#fff7ed',
        }}
      >
        <Text
          style={{
            color: '#ef4444',
            fontSize: 18,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          Access Denied
        </Text>
        <Text style={{ textAlign: 'center', color: '#6b7280', fontSize: 16 }}>
          You are not allowed to view Catering items.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/home-dashboard')}
          style={{
            marginTop: 24,
            backgroundColor: '#f97316',
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 30,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>
            Back to Home
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const handleCheckout = () => router.push('/customer-cart');
  const handleAddMoreItems = () => router.push('/home-dashboard');
  const handleDecrease = (itemId, qty) => {
    if (qty <= 1) {
      removeFromCart(itemId);
      return;
    }
    decreaseQuantity(itemId);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff7ed' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Cute Gradient Header */}
        <View style={{ marginBottom: 16 }}>
          <LinearGradient
            colors={['#fbbf24', '#f97316']}
            start={[0, 0]}
            end={[1, 1]}
            style={{
              borderBottomLeftRadius: 40,
              borderBottomRightRadius: 40,
              padding: 28,
              paddingTop: 50,
              marginBottom: 16,
              shadowColor: '#000',
              shadowOpacity: 0.1,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 5 },
              elevation: 5,
              position: 'relative',
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                position: 'absolute',
                top: 16,
                left: 16,
                backgroundColor: 'rgba(255,255,255,0.3)',
                padding: 8,
                borderRadius: 20,
              }}
            >
              <ArrowLeft size={24} color="#fff" />
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 28,
                fontWeight: '900',
                color: '#fff',
                marginBottom: 6,
                letterSpacing: 1,
              }}
            >
              {category}
            </Text>
            <Text style={{ fontSize: 16, color: '#fff', opacity: 0.95 }}>
              {`Yummy options for you in the ${category} category! 🍽️`}
            </Text>

            {items.length > 0 && (
              <Image
                source={resolveImageSource(items[0]?.image)}
                style={{
                  width: '100%',
                  height: 140,
                  borderRadius: 20,
                  marginTop: 16,
                  resizeMode: 'cover',
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              />
            )}
          </LinearGradient>
        </View>

        {/* Items List with Cute Cards */}
        {items.length === 0 ? (
          <Text
            style={{
              color: '#6b7280',
              fontSize: 16,
              textAlign: 'center',
              marginTop: 20,
            }}
          >
            No items found in this category.
          </Text>
        ) : (
          items.map((item) => {
            const qty = cart.find((i) => i.id === item.id)?.quantity || 0;
            const paxRemaining = getPaxRemaining(item);
            const isAvailable = isPaxAvailable(item);
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: '#fff4e6',
                  borderRadius: 20,
                  marginHorizontal: 16,
                  marginBottom: 12,
                  shadowColor: '#000',
                  shadowOpacity: 0.05,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 2,
                  borderWidth: 1,
                  borderColor: '#ffd699',
                }}
              >
                <Image
                  source={resolveImageSource(item.image)}
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: 20,
                    marginRight: 16,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: '700',
                      color: '#f97316',
                    }}
                  >
                    {item.name}{' '}
                    {!isAvailable && (
                      <Text style={{ color: '#ef4444' }}> (Sold Out)</Text>
                    )}
                  </Text>
                  <Text
                    style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}
                  >
                    {item.description}
                  </Text>
                  {paxRemaining !== null && (
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor:
                          paxRemaining === 0 ? '#FEE2E2' : '#E0F2FE',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: paxRemaining === 0 ? '#B91C1C' : '#075985',
                        }}
                      >
                        {paxRemaining} pax
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: '#fbbf24',
                    }}
                  >
                    ₱{item.price}
                  </Text>
                  {isAvailable && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => handleDecrease(item.id, qty)}
                        style={{
                          backgroundColor: '#f97316',
                          padding: 6,
                          borderRadius: 20,
                          marginHorizontal: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: '#fff',
                            fontWeight: '700',
                            fontSize: 16,
                          }}
                        >
                          -
                        </Text>
                      </TouchableOpacity>
                      <Text
                        style={{
                          minWidth: 24,
                          textAlign: 'center',
                          fontWeight: '700',
                          fontSize: 16,
                        }}
                      >
                        {qty}
                      </Text>
                      <TouchableOpacity
                        onPress={() => addToCart(item)}
                        style={{
                          backgroundColor: '#f97316',
                          padding: 6,
                          borderRadius: 20,
                          marginHorizontal: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: '#fff',
                            fontWeight: '700',
                            fontSize: 16,
                          }}
                        >
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Floating Checkout & Add More with Cute Gradient */}
      {total > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            gap: 12,
          }}
        >
          <LinearGradient
            colors={['#f97316', '#fbbf24']}
            start={[0, 0]}
            end={[1, 1]}
            style={{ borderRadius: 30, overflow: 'hidden' }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: 16,
              }}
              onPress={handleCheckout}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>
                ₱{total} • Checkout 🍽️
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          <TouchableOpacity
            style={{
              backgroundColor: '#34d399',
              paddingVertical: 14,
              borderRadius: 30,
              width: '100%',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.1,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
            onPress={handleAddMoreItems}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
              + Add More Items 🛒
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
