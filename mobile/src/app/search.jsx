import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMenuItems } from '../api/api';
import { useCart } from '../context/CartContext';
import { resolveImageSource } from '../utils/image';

const SEARCH_DEBOUNCE_MS = 150;

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cart, addToCart, decreaseQuantity } = useCart();

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('student');

  useEffect(() => {
    const getUserRole = async () => {
      try {
        const userData = await AsyncStorage.getItem('@sanaol/auth/user');
        if (userData) {
          const parsed = JSON.parse(userData);
          setUserRole(parsed.role || 'student');
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

  useEffect(() => {
    let active = true;
    const loadMenuItems = async () => {
      setLoading(true);
      const items = await fetchMenuItems();
      if (active) {
        setMenuItems(items || []);
        setLoading(false);
      }
    };
    loadMenuItems();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setSearchTerm('');
      return;
    }
    const timeoutId = setTimeout(() => {
      setSearchTerm(normalized);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (userRole !== 'faculty') {
      items = items.filter(
        (item) => (item.category || '').toLowerCase() !== 'catering'
      );
    }
    if (searchTerm) {
      items = items.filter((item) => {
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        return (
          name.includes(searchTerm) ||
          desc.includes(searchTerm) ||
          category.includes(searchTerm)
        );
      });
    }
    return items;
  }, [menuItems, searchTerm, userRole]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleClear = useCallback(() => {
    setQuery('');
    setSearchTerm('');
  }, []);

  const hasSearch = query.trim().length > 0;
  const emptyTitle = hasSearch ? 'No results' : 'Search the menu';
  const emptyMessage = hasSearch
    ? 'No items match your search yet.'
    : 'Start typing to search the menu.';
  const listData = searchTerm ? filteredItems : [];

  const renderItem = useCallback(
    ({ item }) => {
      const qty = cart.find((i) => i.id === item.id)?.quantity || 0;
      const isAvailable = item.available !== false;
      return (
        <View
          style={[styles.menuCard, !isAvailable && styles.menuCardDisabled]}
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
              <Text style={styles.menuPrice}>PHP {item.price}</Text>
              {isAvailable ? (
                <View style={styles.qtyControls}>
                  <Pressable
                    onPress={() => decreaseQuantity(item.id)}
                    style={styles.qtyButton}
                  >
                    <Text style={styles.qtyButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyText}>{qty}</Text>
                  <Pressable
                    onPress={() => addToCart(item)}
                    style={styles.qtyButton}
                  >
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.menuUnavailable}>Unavailable</Text>
              )}
            </View>
          </View>
        </View>
      );
    },
    [addToCart, cart, decreaseQuantity]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#6B7280" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search menu items..."
          placeholderTextColor="#9CA3AF"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          autoFocus
          style={styles.searchInput}
        />
        {query ? (
          <Pressable style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>x</Text>
          </Pressable>
        ) : null}
      </View>

      {searchTerm ? (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Results</Text>
          <Text style={styles.resultsCount}>{filteredItems.length} items</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, index) =>
            item.id ? String(item.id) : `${item.name}-${index}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{emptyMessage}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 8,
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
    fontSize: 14,
    color: '#111827',
  },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 24,
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
});
