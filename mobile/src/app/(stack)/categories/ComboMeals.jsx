// ComboMeals.jsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { useCart } from '../../../context/CartContext';
import { fetchMenuItems } from '../../../api/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40) / 2;
const COLLAGE_GAP = 6;
const COLLAGE_HEIGHT = 100;

const resolveImageSrc = (item) => {
  if (!item) return null;
  const candidates = [
    item.image,
    item.imageUrl,
    item.image_url,
    item.photo,
    item.picture,
    item.thumbnail,
    item.img,
    item?.image?.url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return null;
};

const resolveIngredientEntries = (item) => {
  if (!item) return [];
  const raw =
    item.ingredients ||
    item.ingredientIds ||
    item.ingredient_ids ||
    item.combo_items ||
    item.comboItems;
  return Array.isArray(raw) ? raw : [];
};

const isComboMeal = (item) => {
  if (!item) return false;
  const category = String(
    item.category || item.categoryName || item.category_label || ''
  ).toLowerCase();
  if (category.includes('combo')) return true;
  const type = String(
    item.type || item.itemType || item.kind || ''
  ).toLowerCase();
  if (type.includes('combo')) return true;
  if (
    item.isCombo ||
    item.is_combo ||
    item.is_combo_meal ||
    item.isComboMeal ||
    item.combo
  ) {
    return true;
  }
  const ingredients =
    item.ingredients || item.ingredientIds || item.ingredient_ids;
  return Array.isArray(ingredients) && ingredients.length > 0;
};

const resolveComboImages = (item, imageById) => {
  const sources = [];
  resolveIngredientEntries(item).forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'object') {
      const direct = resolveImageSrc(entry);
      if (direct) {
        sources.push(direct);
        return;
      }
      const id =
        entry.id ||
        entry.menuItemId ||
        entry.itemId ||
        entry.menu_item_id ||
        null;
      if (id !== null && id !== undefined) {
        const mapped = imageById.get(String(id));
        if (mapped) sources.push(mapped);
      }
      return;
    }
    const mapped = imageById.get(String(entry));
    if (mapped) sources.push(mapped);
  });

  if (sources.length === 0) {
    const fallback = resolveImageSrc(item);
    if (fallback) sources.push(fallback);
  }

  return sources.filter((src) => {
    if (!src) return false;
    if (typeof src === 'string') {
      const lower = src.toLowerCase();
      if (lower.includes('.svg') || lower.startsWith('data:image/svg')) {
        return false;
      }
    }
    return true;
  });
};

const toImageSource = (src) => {
  if (!src) return null;
  if (typeof src === 'string') return { uri: src };
  if (typeof src === 'number') return src;
  if (typeof src === 'object' && src.uri) return src;
  return null;
};

export default function ComboMeals() {
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity, removeFromCart } = useCart();
  const [comboMeals, setComboMeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
  });

  useEffect(() => {
    const loadComboMeals = async () => {
      try {
        const items = await fetchMenuItems();
        const imageById = new Map();
        (items || []).forEach((entry) => {
          if (!entry || entry.id === undefined || entry.id === null) return;
          const src = resolveImageSrc(entry);
          if (src) imageById.set(String(entry.id), src);
        });

        const combos = (items || [])
          .filter((entry) => isComboMeal(entry))
          .map((entry) => {
            const collageSources = resolveComboImages(entry, imageById).slice(
              0,
              3
            );
            return { ...entry, collageSources };
          })
          .filter((entry) => entry.collageSources.length === 3);

        setComboMeals(combos);
      } catch (error) {
        console.error('Error fetching combo meals:', error);
        setComboMeals([]);
      } finally {
        setLoading(false);
      }
    };

    loadComboMeals();
  }, []);

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#e67e22" />
        <Text
          style={{
            marginTop: 8,
            color: '#e67e22',
            fontFamily: 'Roboto_700Bold',
          }}
        >
          Loading Combo Meals...
        </Text>
      </View>
    );
  }

  const handleDecrease = (itemId, qty) => {
    if (qty <= 1) {
      removeFromCart(itemId);
      return;
    }
    decreaseQuantity(itemId);
  };

  const renderItem = ({ item }) => {
    const qty = cart.find((i) => i.id === item.id)?.quantity || 0;
    const [mainSrc, topSrc, bottomSrc] = item.collageSources || [];
    const mainImage = toImageSource(mainSrc);
    const topImage = toImageSource(topSrc);
    const bottomImage = toImageSource(bottomSrc);

    if (!mainImage || !topImage || !bottomImage) {
      return null;
    }

    return (
      <View style={styles.card}>
        <View style={styles.collageGrid}>
          <View style={styles.collageMain}>
            <Image
              source={mainImage}
              style={styles.collageImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.collageSide}>
            <View style={[styles.collageTile, styles.collageTileTop]}>
              <Image
                source={topImage}
                style={styles.collageImage}
                resizeMode="cover"
              />
            </View>
            <View style={styles.collageTile}>
              <Image
                source={bottomImage}
                style={styles.collageImage}
                resizeMode="cover"
              />
            </View>
          </View>
        </View>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.price}>₱{item.price}</Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => handleDecrease(item.id, qty)}
          >
            <Ionicons name="remove" size={18} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.qty}>{qty}</Text>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => addToCart(item)}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = () => {
    router.push('/customer-cart');
  };

  const handleAddMoreItems = () => {
    router.push('/home-dashboard');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <ImageBackground
        source={require('../../../../assets/drop_1.png')}
        resizeMode="cover"
        style={styles.headerBackground}
      >
        <View style={styles.overlay} />
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Combo Meals</Text>
            <Ionicons name="fast-food-outline" size={26} color="black" />
          </View>
        </View>
      </ImageBackground>

      {/* Combo Meals List */}
      {comboMeals.length > 0 ? (
        <FlatList
          data={comboMeals}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `combo-${index}`
          }
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: total > 0 ? 130 : 50,
          }}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={{ fontFamily: 'Roboto_700Bold', color: '#555' }}>
            No Combo Meals found.
          </Text>
        </View>
      )}

      {/* Floating Cart */}
      {total > 0 && (
        <View style={styles.floatingContainer}>
          <TouchableOpacity
            style={styles.floatingCart}
            onPress={handleCheckout}
          >
            <Ionicons name="cart-outline" size={22} color="#fff" />
            <Text style={styles.cartText}>₱{total} • Checkout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addMoreBtn}
            onPress={handleAddMoreItems}
          >
            <Text style={styles.addMoreText}>+ Add More Items</Text>
          </TouchableOpacity>
        </View>
      )}
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
  card: {
    backgroundColor: '#fff',
    width: CARD_WIDTH,
    marginVertical: 10,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#f97316',
  },
  collageGrid: {
    width: '100%',
    height: COLLAGE_HEIGHT,
    flexDirection: 'row',
    marginBottom: 8,
  },
  collageMain: {
    flex: 2,
    marginRight: COLLAGE_GAP,
    borderRadius: 10,
    overflow: 'hidden',
  },
  collageSide: {
    flex: 1,
    justifyContent: 'space-between',
  },
  collageTile: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  collageTileTop: {
    marginBottom: COLLAGE_GAP,
  },
  collageImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  price: {
    fontSize: 18,
    fontFamily: 'Roboto_400Regular',
    color: '#777',
    marginBottom: 8,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  controlBtn: {
    backgroundColor: '#e67e22',
    padding: 6,
    borderRadius: 20,
    marginHorizontal: 6,
  },
  qty: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#333',
    minWidth: 20,
    textAlign: 'center',
  },
  floatingContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    gap: 10,
  },
  floatingCart: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 4,
  },
  cartText: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
    marginLeft: 8,
    fontSize: 16,
  },
  addMoreBtn: {
    backgroundColor: '#27ae60',
    paddingVertical: 12,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
    elevation: 3,
  },
  addMoreText: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
    fontSize: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
