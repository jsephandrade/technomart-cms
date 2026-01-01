// ComboMeals.jsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { useCart } from '../../../context/CartContext';

const { width } = Dimensions.get('window');
const GRID_GUTTER = 12;
const CARD_WIDTH = (width - GRID_GUTTER * 4) / 3;
const CARD_HEIGHT = CARD_WIDTH;
const COMBO_MEAL_IMAGES = [
  { id: 'combo-1', image: require('../../../../assets/chicken.png') },
  { id: 'combo-2', image: require('../../../../assets/ginaling.png') },
  { id: 'combo-3', image: require('../../../../assets/ngohiong.png') },
];

export default function ComboMeals() {
  const router = useRouter();
  const { cart } = useCart();

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.centered}>
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

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Image source={item.image} style={styles.image} resizeMode="cover" />
    </View>
  );

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
      <FlatList
        data={COMBO_MEAL_IMAGES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{
          padding: GRID_GUTTER,
          paddingBottom: total > 0 ? 130 : 50,
        }}
      />

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
    height: CARD_HEIGHT,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#f97316',
  },
  image: { width: '100%', height: '100%' },
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
