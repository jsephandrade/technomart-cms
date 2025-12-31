// app/(tabs)/home-dashboard.jsx
import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Image,
  Pressable,
  Alert,
  StyleSheet,
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
  Search,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CategoryItem from '../../components/CategoryItem';
import Recommended from '../../components/Recommended';
import { fetchMenuItems, fetchNotifications } from '../../api/api';
import { useCart } from '../../context/CartContext';
import { resolveImageSource } from '../../utils/image';

const MENU_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export default function HomeDashboardScreen() {
  const [fontsLoaded] = useFonts({ Roboto_700Bold });
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity } = useCart();

  const [menuItems, setMenuItems] = useState([]);
  const [menuNotifications, setMenuNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const hasLoadedMenuRef = useRef(false);

  useEffect(() => {
    const getUserRole = async () => {
      try {
        const userData = await AsyncStorage.getItem('@sanaol/auth/user');
        if (userData) {
          const parsed = JSON.parse(userData);
          setUserRole(parsed.role);
        } else {
          setUserRole('student');
        }
      } catch (err) {
        console.error('Failed to get user role', err);
        setUserRole('student');
      }
    };
    getUserRole();
  }, []);

  const loadMenuItems = async ({ silent = false } = {}) => {
    const shouldUpdateLoading = !hasLoadedMenuRef.current && !silent;
    try {
      if (shouldUpdateLoading) {
        setLoading(true);
      }
      const items = await fetchMenuItems();
      setMenuItems(items || []);
      hasLoadedMenuRef.current = true;
    } catch (err) {
      console.error('Error fetching menu items:', err);
    } finally {
      if (shouldUpdateLoading) {
        setLoading(false);
      }
    }
  };

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
              type: n.type,
              title: n.title || n.item?.name || 'Notification',
              message: n.message || '',
              created_at: createdAt || new Date().toISOString(),
            });
          }
        });
        return merged.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      });
    } catch (err) {
      console.error('Failed to fetch backend notifications:', err);
    }
  };

  const loadAllData = async ({ silent = false } = {}) => {
    await loadMenuItems({ silent });
    await loadBackendNotifications();
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(
      () => loadAllData({ silent: true }),
      MENU_REFRESH_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllData({ silent: false }).finally(() => setRefreshing(false));
  }, []);

  const categoriesData = useMemo(() => {
    const categoryMap = {};
    menuItems.forEach((item) => {
      const cat = item.category || 'Others';
      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          key: cat,
          title: cat,
          itemCount: 0,
          image: item.image,
        };
      }
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
    if (userRole !== 'faculty') {
      cats = cats.filter((cat) => cat.title.toLowerCase() !== 'catering');
    }
    return cats;
  }, [mainCategories, userRole]);

  const filteredCatering = useMemo(() => {
    if (!cateringCategory || userRole !== 'faculty') return null;
    return cateringCategory;
  }, [cateringCategory, userRole]);

  const allItemsFiltered = useMemo(() => {
    let items = menuItems;
    if (userRole !== 'faculty') {
      items = items.filter(
        (item) => (item.category || '').toLowerCase() !== 'catering'
      );
    }
    return items;
  }, [menuItems, userRole]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
  const handleOpenSearch = useCallback(() => {
    router.push('/search');
  }, [router]);
  const handleFilterPress = () =>
    Alert.alert('Filters', 'Filters are coming soon.');

  const searchPlaceholder =
    userRole === 'faculty' ? 'Search menu & catering...' : 'Search menu...';
  const emptyMessage = 'No items available right now.';

  const DropdownItem = ({ icon, label, onPress, color }) => (
    <TouchableOpacity style={styles.dropdownItem} onPress={onPress}>
      <View style={styles.dropdownIcon}>{icon}</View>
      <Text style={[styles.dropdownLabel, color ? { color } : null]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderDropdownContainer = (children) => (
    <View style={styles.dropdownContainer}>
      <View style={styles.dropdownPointer} />
      <View style={styles.dropdownPanel}>{children}</View>
    </View>
  );

  if (!fontsLoaded || loading || userRole === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading Menu...</Text>
      </View>
    );
  }

  const makeCategorySlug = (title) =>
    encodeURIComponent(title.replace(/\s+/g, ''));

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: total > 0 ? 180 : 40 },
        ]}
      >
        <LinearGradient
          colors={['#FFE4C7', '#FFC37A', '#FF8A3D']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.heroCard}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Fresh today</Text>
              <Text style={styles.heroTitle}>TechnoMart</Text>
              <Text style={styles.heroSubtitle}>
                Order ahead and pick up in minutes.
              </Text>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() =>
                  setOpenDropdown(
                    openDropdown === 'notifications' ? null : 'notifications'
                  )
                }
              >
                <Bell size={18} color="#1F2937" />
                {menuNotifications.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {menuNotifications.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() =>
                  setOpenDropdown(
                    openDropdown === 'settings' ? null : 'settings'
                  )
                }
              >
                <Gear size={18} color="#1F2937" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>Pickup 15-20 min</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>{menuItems.length} items</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>
                {userRole === 'faculty' ? 'Faculty access' : 'Student menu'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.cartPill,
                cartCount === 0 && styles.cartPillDisabled,
              ]}
              onPress={handleCheckout}
              disabled={cartCount === 0}
            >
              <Ionicons
                name="cart-outline"
                size={16}
                color={cartCount === 0 ? '#9CA3AF' : '#1F2937'}
              />
              <Text
                style={[
                  styles.cartPillText,
                  cartCount === 0 && styles.cartPillTextDisabled,
                ]}
              >
                Cart {cartCount}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Search size={18} color="#6B7280" />
            <Pressable style={styles.searchInput} onPress={handleOpenSearch}>
              <Text style={styles.searchPlaceholderText}>
                {searchPlaceholder}
              </Text>
            </Pressable>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={handleFilterPress}
            >
              <Ionicons name="options-outline" size={18} color="#1F2937" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {menuItems.length > 0 && (
          <View style={styles.recommendedWrap}>
            <Recommended items={menuItems.slice(0, 6)} />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Categories</Text>
            <Text style={styles.sectionSubtitle}>Browse the menu</Text>
          </View>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>
              {filteredMainCategories.length} types
            </Text>
          </View>
        </View>
        <View style={styles.categoriesGrid}>
          {filteredMainCategories.map((item) => (
            <View key={item.key} style={styles.categoryWrap}>
              <CategoryItem
                image={item.image}
                title={item.title}
                onPress={() =>
                  router.push(`/categories/${makeCategorySlug(item.title)}`)
                }
              />
            </View>
          ))}
        </View>

        {userRole === 'faculty' && filteredCatering && (
          <View style={styles.menuSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Catering</Text>
                <Text style={styles.sectionSubtitle}>Faculty only</Text>
              </View>
            </View>
            <View style={styles.categoryWrap}>
              <CategoryItem
                image={filteredCatering.image}
                title={filteredCatering.title}
                onPress={() =>
                  router.push(
                    `/categories/${makeCategorySlug(filteredCatering.title)}`
                  )
                }
              />
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>All Menu Items</Text>
            <Text style={styles.sectionSubtitle}>
              {allItemsFiltered.length} items found
            </Text>
          </View>
        </View>
        <View style={styles.menuSection}>
          {allItemsFiltered.length > 0 ? (
            allItemsFiltered.map((item) => {
              const qty = cart.find((i) => i.id === item.id)?.quantity || 0;
              const isAvailable = item.available !== false;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.menuCard,
                    !isAvailable && styles.menuCardDisabled,
                  ]}
                >
                  <Image
                    source={resolveImageSource(item.image)}
                    style={styles.menuImage}
                  />
                  <View style={styles.menuInfo}>
                    <View style={styles.menuTitleRow}>
                      <Text style={styles.menuName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!isAvailable && (
                        <View style={styles.soldOutBadge}>
                          <Text style={styles.soldOutText}>Sold Out</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.menuDesc} numberOfLines={2}>
                      {item.description || 'No description available.'}
                    </Text>
                    <View style={styles.menuFooter}>
                      <Text style={styles.menuPrice}>�,�{item.price}</Text>
                      {isAvailable ? (
                        <View style={styles.qtyControls}>
                          <TouchableOpacity
                            onPress={() => decreaseQuantity(item.id)}
                            style={styles.qtyButton}
                          >
                            <Text style={styles.qtyButtonText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyText}>{qty}</Text>
                          <TouchableOpacity
                            onPress={() => addToCart(item)}
                            style={styles.qtyButton}
                          >
                            <Text style={styles.qtyButtonText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={styles.menuUnavailable}>Unavailable</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptySubtitle}>{emptyMessage}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {total > 0 && (
        <View style={styles.checkoutBar}>
          <View style={styles.checkoutRow}>
            <View>
              <Text style={styles.checkoutLabel}>Your cart</Text>
              <Text style={styles.checkoutValue}>�,�{total}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={handleCheckout}
            >
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <Text style={styles.checkoutButtonText}>View Cart</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.checkoutSecondary}
            onPress={handleAddMoreItems}
          >
            <Text style={styles.checkoutSecondaryText}>Continue browsing</Text>
          </TouchableOpacity>
        </View>
      )}

      <>
        {openDropdown && (
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setOpenDropdown(null)}
          />
        )}
        {openDropdown === 'settings' &&
          renderDropdownContainer(
            <>
              <Text style={styles.dropdownHeader}>Account</Text>
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

        {openDropdown === 'notifications' &&
          renderDropdownContainer(
            <>
              <Text style={styles.dropdownHeader}>Notifications</Text>
              {menuNotifications.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No updates yet</Text>
              ) : (
                menuNotifications.slice(0, 5).map((n, idx) => (
                  <View key={idx} style={styles.notificationItem}>
                    <Text
                      style={[
                        styles.notificationTitle,
                        {
                          color:
                            n.type === 'new'
                              ? '#16a34a'
                              : n.type === 'soldout'
                                ? '#ef4444'
                                : n.type === 'deleted'
                                  ? '#9ca3af'
                                  : '#374151',
                        },
                      ]}
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
                    <Text style={styles.notificationTime}>
                      {new Date(n.created_at).toLocaleString()}
                    </Text>
                    {n.message ? (
                      <Text style={styles.notificationMessage}>
                        {n.message}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </>
          )}
      </>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  heroEyebrow: {
    fontSize: 12,
    letterSpacing: 1.4,
    color: '#7C2D12',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 28,
    color: '#1F2937',
    fontFamily: 'Roboto_700Bold',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 6,
    maxWidth: 220,
  },
  heroActions: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C2D12',
  },
  cartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  cartPillDisabled: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  cartPillText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  cartPillTextDisabled: {
    color: '#9CA3AF',
  },
  searchBar: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  searchPlaceholderText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  filterButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedWrap: {
    marginTop: 6,
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
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  categoryWrap: {
    width: '48%',
    marginBottom: 12,
  },
  menuSection: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  menuCardDisabled: {
    opacity: 0.6,
  },
  menuImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: '#F7EDE2',
  },
  menuInfo: {
    flex: 1,
  },
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  menuDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  menuFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  menuPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF7A18',
  },
  soldOutBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soldOutText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B91C1C',
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
  menuUnavailable: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
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
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  checkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkoutLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  checkoutValue: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginTop: 2,
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF7A18',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  checkoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  checkoutSecondary: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    backgroundColor: '#FFF7EE',
    paddingVertical: 8,
    alignItems: 'center',
  },
  checkoutSecondaryText: {
    color: '#9A3412',
    fontWeight: '700',
    fontSize: 13,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 84,
    right: 16,
    width: 240,
    zIndex: 200,
  },
  dropdownPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
    alignSelf: 'flex-end',
    marginRight: 10,
  },
  dropdownPanel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  dropdownIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  dropdownEmpty: {
    color: '#6B7280',
    textAlign: 'center',
    padding: 8,
  },
  notificationItem: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationTime: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  notificationMessage: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
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
