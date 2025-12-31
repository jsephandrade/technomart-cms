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
import { Search } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CategoryItem from '../../components/CategoryItem';
import Recommended from '../../components/Recommended';
import { fetchMenuItems, USER_CACHE_KEY } from '../../api/api';
import { useCart } from '../../context/CartContext';
import { resolveImageSource } from '../../utils/image';

const MENU_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const CATEGORY_IMAGE_OVERRIDES = [
  { key: 'combo', image: require('../../../assets/choices/combo.png') },
  { key: 'meal', image: require('../../../assets/choices/meals.png') },
  { key: 'drink', image: require('../../../assets/choices/drinks.png') },
  { key: 'snack', image: require('../../../assets/choices/snacks.png') },
];
const CATEGORY_ROW_ORDER = [
  {
    label: 'Meals',
    match: 'meal',
    image: require('../../../assets/choices/meals.png'),
  },
  {
    label: 'Drinks',
    match: 'drink',
    image: require('../../../assets/choices/drinks.png'),
  },
  {
    label: 'Combo Meals',
    match: 'combo',
    image: require('../../../assets/choices/combo.png'),
  },
  {
    label: 'Snack',
    match: 'snack',
    image: require('../../../assets/choices/snacks.png'),
  },
];

const normalizeCategoryKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const resolveCategoryImage = (category, itemName) => {
  const normalizedKey = normalizeCategoryKey(category);
  const match = CATEGORY_IMAGE_OVERRIDES.find((entry) =>
    normalizedKey.includes(entry.key)
  );
  if (match) {
    return match.image;
  }
  const normalizedName = String(itemName || '').toLowerCase();
  if (normalizedName.includes('pinaypay')) {
    return CATEGORY_IMAGE_OVERRIDES.find((entry) => entry.key === 'snack')
      ?.image;
  }
  return null;
};

export default function HomeDashboardScreen() {
  const [fontsLoaded] = useFonts({ Roboto_700Bold });
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity } = useCart();

  const [menuItems, setMenuItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const hasLoadedMenuRef = useRef(false);

  useEffect(() => {
    const getUserRole = async () => {
      try {
        const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
        const userData = entries[0][1] || entries[1][1];
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

  const loadAllData = async ({ silent = false } = {}) => {
    await loadMenuItems({ silent });
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
      const overrideImage = resolveCategoryImage(cat, item.name);
      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          key: cat,
          title: cat,
          itemCount: 0,
          image: overrideImage || item.image,
        };
      } else if (overrideImage && categoryMap[cat].image !== overrideImage) {
        categoryMap[cat].image = overrideImage;
      } else if (!categoryMap[cat].image && item.image) {
        categoryMap[cat].image = item.image;
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

  const categoryRowItems = useMemo(() => {
    return CATEGORY_ROW_ORDER.map((entry) => {
      const match = filteredMainCategories.find((cat) =>
        normalizeCategoryKey(cat.title).includes(entry.match)
      );
      return {
        label: entry.label,
        image: entry.image,
        category: match || null,
      };
    });
  }, [filteredMainCategories]);

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

  const handleCheckout = () => router.push('/customer-cart');
  const handleAddMoreItems = () => router.push('/home-dashboard');
  const handleOpenSearch = useCallback(() => {
    router.push('/search');
  }, [router]);
  const handleFilterPress = () =>
    Alert.alert('Filters', 'Filters are coming soon.');

  const searchPlaceholder =
    userRole === 'faculty' ? 'Search menu & catering...' : 'Search menu...';
  const emptyMessage = 'No items available right now.';

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
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
        >
          {categoryRowItems.map((item) => {
            const isDisabled = !item.category;
            return (
              <View key={item.label} style={styles.categoryCardWrap}>
                <CategoryItem
                  image={item.image}
                  title={item.label}
                  disabled={isDisabled}
                  onPress={() => {
                    if (!item.category) return;
                    router.push(
                      `/categories/${makeCategorySlug(item.category.title)}`
                    );
                  }}
                />
              </View>
            );
          })}
        </ScrollView>

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
  heroLogo: {
    width: 54,
    height: 54,
    marginRight: 12,
  },
  searchBar: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flex: 1,
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
  categoriesRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
  },
  categoryCardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
