// Meals.jsx
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
import { resolveImageSource } from '../../../utils/image';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40) / 2;

export default function ComboMeals() {
  const router = useRouter();
  const { cart, addToCart, decreaseQuantity, removeFromCart } = useCart();
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
  });

  useEffect(() => {
    loadComboMeals();
  }, []);

  const loadComboMeals = async () => {
    try {
      const items = await fetchMenuItems();
      const filtered = items.filter((item) => {
        const category = String(
          item.category || item.categoryName || item.category_label || ''
        )
          .trim()
          .toLowerCase();
        if (!category) return false;
        if (category.includes('combo')) return false;
        return category === 'meals' || category === 'meal';
      });
      setMenuItems(filtered);
    } catch (error) {
      console.error('Error fetching meals:', error);
    } finally {
      setLoading(false);
    }
  };

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
          Loading Meals...
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
    const isAvailable =
      item?.available !== false &&
      item?.is_available !== false &&
      item?.isAvailable !== false &&
      item?.sold_out !== true &&
      item?.soldOut !== true;

    return (
      <View style={[styles.card, !isAvailable && styles.cardDisabled]}>
        <Image source={resolveImageSource(item.image)} style={styles.image} />
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
            style={[
              styles.controlBtn,
              !isAvailable && styles.controlBtnDisabled,
            ]}
            onPress={() => addToCart(item)}
            disabled={!isAvailable}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        {!isAvailable && (
          <Text style={styles.unavailableText}>Unavailable</Text>
        )}
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
            <Text style={styles.headerTitle}>Meals</Text>
            <Ionicons name="fast-food-outline" size={26} color="black" />
          </View>
        </View>
      </ImageBackground>

      {/* Meals List */}
      {menuItems.length > 0 ? (
        <FlatList
          data={menuItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
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
            No Meals found.
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
  cardDisabled: {
    opacity: 0.55,
    borderColor: '#E5E7EB',
  },
  image: { width: '100%', height: 100, borderRadius: 8, marginBottom: 8 },
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
  controlBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  qty: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#333',
    minWidth: 20,
    textAlign: 'center',
  },
  unavailableText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Roboto_700Bold',
    color: '#B91C1C',
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
