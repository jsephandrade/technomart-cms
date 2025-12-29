// app/(tabs)/home-dashboard.jsx
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { useFonts, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LogOut,
  User,
  Settings as Gear,
  HelpCircle,
  MessageCircle,
  Bell,
} from 'lucide-react-native';
import CategoryItem from '../../components/CategoryItem';
import Recommended from '../../components/Recommended';
import { fetchMenuItems, fetchNotifications } from '../../api/api';
import { useCart } from '../../context/CartContext';
import { resolveImageSource } from '../../utils/image';

export default function HomeDashboardScreen() {
  const [fontsLoaded] = useFonts({ Roboto_700Bold });
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity } = useCart();

  const [menuItems, setMenuItems] = useState([]);
  const [menuNotifications, setMenuNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Load user role
  useEffect(() => {
    const getUserRole = async () => {
      try {
        const userData = await AsyncStorage.getItem('@sanaol/auth/user');
        if (userData) {
          const parsed = JSON.parse(userData);
          setUserRole(parsed.role); // expects "faculty" or "student"
        } else {
          setUserRole('student'); // fallback
        }
      } catch (err) {
        console.error('Failed to get user role', err);
        setUserRole('student');
      }
    };
    getUserRole();
  }, []);

  // Load menu items
  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const items = await fetchMenuItems();
      setMenuItems(items || []);
    } catch (err) {
      console.error('Error fetching menu items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load notifications
  const loadBackendNotifications = async () => {
    try {
      const backend = await fetchNotifications();
      const list = Array.isArray(backend) ? backend : [];
      setMenuNotifications((prev) => {
        const merged = [...prev];
        list.forEach((n) => {
          if (!prev.find((p) => p.id === n.id)) {
            const createdAt = n.created_at || n.createdAt || n.created || null;
            merged.push({
              id: n.id || `${n.type || 'notif'}-${createdAt || Date.now()}`,
              type: n.type, // "new", "soldout", "deleted"
              title: n.title || n.item?.name || 'Notification',
              message: n.message || '',
              created_at: createdAt || new Date().toISOString(),
            });
          }
        });
        // Sort by newest first
        return merged.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      });
    } catch (err) {
      console.error('Failed to fetch backend notifications:', err);
    }
  };

  const loadAllData = async () => {
    await loadMenuItems();
    await loadBackendNotifications();
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllData().finally(() => setRefreshing(false));
  }, []);

  // Group categories from backend
  const categoriesData = useMemo(() => {
    const categoryMap = {};
    menuItems.forEach((item) => {
      const cat = item.category || 'Others';
      if (!categoryMap[cat])
        categoryMap[cat] = {
          key: cat,
          title: cat,
          itemCount: 0,
          image: item.image,
        };
      categoryMap[cat].itemCount += 1;
    });
    return Object.values(categoryMap);
  }, [menuItems]);

  const mainCategories = useMemo(
    () =>
      categoriesData.filter((cat) => cat.title.toLowerCase() !== 'catering'),
    [categoriesData]
  );
  const cateringCategory = useMemo(
    () =>
      categoriesData.find((cat) => cat.title.toLowerCase() === 'catering') ||
      null,
    [categoriesData]
  );

  const filteredMainCategories = useMemo(() => {
    let cats = mainCategories;
    if (searchQuery)
      cats = cats.filter((cat) =>
        cat.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    if (userRole !== 'faculty')
      cats = cats.filter((cat) => cat.title.toLowerCase() !== 'catering');
    return cats;
  }, [mainCategories, searchQuery, userRole]);

  const filteredCatering = useMemo(() => {
    if (!cateringCategory || userRole !== 'faculty') return null;
    if (!searchQuery) return cateringCategory;
    return cateringCategory.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
      ? cateringCategory
      : null;
  }, [cateringCategory, searchQuery, userRole]);

  const allItemsFiltered = useMemo(() => {
    let items = menuItems;
    if (userRole !== 'faculty')
      items = items.filter(
        (item) => (item.category || '').toLowerCase() !== 'catering'
      );
    if (searchQuery)
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return items;
  }, [menuItems, searchQuery, userRole]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Handlers
  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove([
        '@sanaol/auth/accessToken',
        '@sanaol/auth/refreshToken',
        '@sanaol/auth/user',
      ]);
      setOpenDropdown(null);
      router.replace('/account-login');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  const handleCheckout = () => router.push('/customer-cart');
  const handleAddMoreItems = () => router.push('/(tabs)');

  const DropdownItem = ({ icon, label, onPress, color }) => (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
      }}
      onPress={onPress}
    >
      <View
        style={{
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          marginLeft: 8,
          fontSize: 14,
          color: color || '#374151',
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderCategoriesHeader = () => (
    <View style={{ marginBottom: 8, paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
        Categories
      </Text>
      <View
        style={{
          marginTop: 4,
          width: 48,
          height: 3,
          borderRadius: 2,
          backgroundColor: '#f97316',
        }}
      />
    </View>
  );

  const renderDropdownContainer = (children) => (
    <View
      style={{
        position: 'absolute',
        top: 56,
        right: 16,
        width: 220,
        zIndex: 150,
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 8,
          borderRightWidth: 8,
          borderBottomWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: 'white',
          alignSelf: 'flex-end',
          marginRight: 8,
        }}
      />
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          paddingVertical: 8,
          paddingHorizontal: 8,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 },
          elevation: 5,
        }}
      >
        {children}
      </View>
    </View>
  );

  if (!fontsLoaded || loading || userRole === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text
          style={{
            marginTop: 8,
            color: '#f97316',
            fontFamily: 'Roboto_700Bold',
          }}
        >
          Loading Menu...
        </Text>
      </View>
    );
  }

  const makeCategorySlug = (title) =>
    encodeURIComponent(title.replace(/\s+/g, ''));

  return (
    <View style={{ flex: 1, backgroundColor: '#fef3c7' }}>
      {/* Top Search & Buttons */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 8,
          zIndex: 200,
        }}
      >
        <TextInput
          placeholder="Search menu..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: 'white',
            borderRadius: 12,
            paddingHorizontal: 12,
            fontSize: 14,
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        />

        {/* Bell with badge */}
        <TouchableOpacity
          onPress={() =>
            setOpenDropdown(
              openDropdown === 'notifications' ? null : 'notifications'
            )
          }
        >
          <Bell
            size={20}
            color={menuNotifications.length > 0 ? '#f97316' : '#374151'}
          />
          {menuNotifications.length > 0 && (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#ef4444',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                {menuNotifications.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            setOpenDropdown(openDropdown === 'settings' ? null : 'settings')
          }
        >
          <Gear size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#f97316']}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <Recommended items={menuItems.slice(0, 6)} />

        {/* Main Categories */}
        {renderCategoriesHeader()}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            paddingHorizontal: 8,
          }}
        >
          {filteredMainCategories.map((item) => (
            <CategoryItem
              key={item.key}
              image={item.image}
              title={item.title}
              onPress={() =>
                router.push(`/categories/${makeCategorySlug(item.title)}`)
              }
            />
          ))}
        </View>

        {/* Catering Section (Faculty Only) */}
        {userRole === 'faculty' && filteredCatering && (
          <View style={{ marginTop: 16, paddingHorizontal: 8 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: '#111827',
                marginBottom: 8,
              }}
            >
              Catering
            </Text>
            <CategoryItem
              key={filteredCatering.key}
              image={filteredCatering.image}
              title={filteredCatering.title}
              onPress={() =>
                router.push(
                  `/categories/${makeCategorySlug(filteredCatering.title)}`
                )
              }
            />
          </View>
        )}

        {/* All Menu Items */}
        <View style={{ marginTop: 16, paddingHorizontal: 8 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#111827',
              marginBottom: 8,
            }}
          >
            All Menu Items
          </Text>
          {allItemsFiltered.length > 0 ? (
            allItemsFiltered.map((item) => {
              const qty = cart.find((i) => i.id === item.id)?.quantity || 0;
              return (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    backgroundColor: 'white',
                    borderRadius: 12,
                    marginBottom: 8,
                  }}
                >
                  <Image
                    source={resolveImageSource(item.image)}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      marginRight: 12,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '500',
                        color: '#111827',
                      }}
                    >
                      {item.name}{' '}
                      {item.available === false && (
                        <Text style={{ color: '#ef4444' }}> (Sold Out)</Text>
                      )}
                    </Text>
                    <Text
                      style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}
                    >
                      {item.description}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color: '#f97316',
                    }}
                  >
                    ₱{item.price}
                  </Text>
                  {item.available && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginLeft: 10,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => decreaseQuantity(item.id)}
                        style={{
                          backgroundColor: '#e67e22',
                          padding: 6,
                          borderRadius: 20,
                          marginHorizontal: 4,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          -
                        </Text>
                      </TouchableOpacity>
                      <Text
                        style={{
                          minWidth: 20,
                          textAlign: 'center',
                          fontWeight: '700',
                        }}
                      >
                        {qty}
                      </Text>
                      <TouchableOpacity
                        onPress={() => addToCart(item)}
                        style={{
                          backgroundColor: '#e67e22',
                          padding: 6,
                          borderRadius: 20,
                          marginHorizontal: 4,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={{ fontFamily: 'Roboto_700Bold', color: '#555' }}>
              No items found.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Floating Checkout & Add More */}
      {total > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            gap: 10,
          }}
        >
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#FF8C00',
              paddingVertical: 14,
              borderRadius: 30,
              elevation: 4,
            }}
            onPress={handleCheckout}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: '700',
                fontSize: 16,
                marginLeft: 8,
              }}
            >
              ₱{total} • Checkout
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              backgroundColor: '#27ae60',
              paddingVertical: 12,
              borderRadius: 30,
              width: '100%',
              alignItems: 'center',
              elevation: 3,
            }}
            onPress={handleAddMoreItems}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              + Add More Items
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dropdown Overlay */}
      <>
        {openDropdown && (
          <Pressable
            style={{ position: 'absolute', inset: 0 }}
            onPress={() => setOpenDropdown(null)}
          />
        )}
        {/* Settings Dropdown */}
        {openDropdown === 'settings' &&
          renderDropdownContainer(
            <>
              <DropdownItem
                icon={<User size={16} color="#374151" />}
                label="Profile"
                onPress={() => router.push('/(tabs)/account-profile')}
              />
              <DropdownItem
                icon={<Gear size={16} color="#374151" />}
                label="App Settings"
                onPress={() => router.push('/screens/Settings')}
              />
              <DropdownItem
                icon={<HelpCircle size={16} color="#374151" />}
                label="Help"
                onPress={() => router.push('/screens/FAQs')}
              />
              <DropdownItem
                icon={<MessageCircle size={16} color="#374151" />}
                label="Feedback"
                onPress={() => router.push('/screens/Feedback')}
              />
              <DropdownItem
                icon={<LogOut size={16} color="red" />}
                label="Logout"
                onPress={handleLogout}
                color="red"
              />
            </>
          )}

        {/* Notifications Dropdown */}
        {openDropdown === 'notifications' &&
          renderDropdownContainer(
            <>
              {menuNotifications.length === 0 ? (
                <Text
                  style={{ color: '#6B7280', textAlign: 'center', padding: 8 }}
                >
                  No updates
                </Text>
              ) : (
                menuNotifications.slice(0, 5).map((n, idx) => (
                  <View key={idx} style={{ paddingVertical: 4 }}>
                    <Text
                      style={{
                        color:
                          n.type === 'new'
                            ? '#16a34a'
                            : n.type === 'soldout'
                              ? '#ef4444'
                              : n.type === 'deleted'
                                ? '#9ca3af'
                                : '#374151',
                        fontWeight: '500',
                      }}
                    >
                      {n.type === 'new'
                        ? 'New:'
                        : n.type === 'soldout'
                          ? 'Sold Out:'
                          : n.type === 'deleted'
                            ? 'Removed:'
                            : ''}{' '}
                      {n.title}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#6b7280' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#374151' }}>
                      {n.message}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
      </>
    </View>
  );
}
