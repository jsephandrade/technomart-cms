import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCart } from '../../context/CartContext';

const SIZE_OPTIONS = [
  { label: 'Regular', value: 'Regular', price: 0, hint: 'Standard serving' },
  { label: 'Large', value: 'Large', price: 15, hint: 'More to enjoy' },
  { label: 'Family', value: 'Family', price: 30, hint: 'Shareable size' },
];

const ADD_ONS = [
  { key: 'extra_rice', label: 'Extra Rice', price: 10 },
  { key: 'extra_sauce', label: 'Extra Sauce', price: 5 },
  { key: 'cheese', label: 'Cheese', price: 12 },
  { key: 'bacon', label: 'Bacon', price: 20 },
];

const formatPeso = (value) => `\u20b1${Number(value || 0)}`;

export default function CustomizeOrderScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams();
  const { cart, updateCartItem } = useCart();

  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });
  const [selectedSize, setSelectedSize] = useState(SIZE_OPTIONS[0]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  const item = useMemo(() => {
    if (!itemId) return null;
    return cart.find(
      (entry) => String(entry.id ?? entry.menu_item_id) === String(itemId ?? '')
    );
  }, [cart, itemId]);

  const basePrice = useMemo(() => {
    if (!item) return 0;
    return Number(item.basePrice ?? item.price ?? 0);
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const match =
      SIZE_OPTIONS.find((option) => option.value === item.size) ||
      SIZE_OPTIONS[0];
    setSelectedSize(match);
    setSelectedAddOns(
      Array.isArray(item.addOns) ? item.addOns.filter(Boolean) : []
    );
  }, [item]);

  const additionsTotal = useMemo(() => {
    const sizeCost = selectedSize?.price || 0;
    const addonsCost = selectedAddOns.reduce((sum, key) => {
      const addon = ADD_ONS.find((entry) => entry.key === key);
      return sum + (addon?.price || 0);
    }, 0);
    return sizeCost + addonsCost;
  }, [selectedAddOns, selectedSize]);

  const updatedPrice = useMemo(
    () => Number((basePrice + additionsTotal).toFixed(2)),
    [basePrice, additionsTotal]
  );

  const toggleAddon = (key) => {
    setSelectedAddOns((prev) =>
      prev.includes(key)
        ? prev.filter((itemKey) => itemKey !== key)
        : [...prev, key]
    );
  };

  const handleSave = () => {
    if (!item) {
      Alert.alert('Unavailable', 'We could not find this item in your cart.');
      return;
    }
    const addOnLabels = ADD_ONS.filter((entry) =>
      selectedAddOns.includes(entry.key)
    ).map((entry) => entry.label);
    const customizeParts = [];
    if (selectedSize?.label) {
      customizeParts.push(`Size: ${selectedSize.label}`);
    }
    if (addOnLabels.length) {
      customizeParts.push(`Add-ons: ${addOnLabels.join(', ')}`);
    }
    updateCartItem(itemId, {
      size: selectedSize?.label || null,
      addOns: selectedAddOns,
      customize: customizeParts.join(' | '),
      basePrice,
      price: updatedPrice,
      addonTotal: additionsTotal,
    });
    router.back();
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading options...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Item not found</Text>
        <Text style={styles.emptySubtitle}>
          Please return to your cart and try again.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <ImageBackground
        source={require('../../../assets/drop_1.png')}
        resizeMode="cover"
        style={styles.headerBackground}
      >
        <View style={styles.overlay} />
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={26} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Customize</Text>
            <Ionicons name="fast-food-outline" size={26} color="black" />
          </View>
          <Text
            style={styles.headerSubtitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
        </View>
      </ImageBackground>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Size</Text>
            <Text style={styles.sectionSubtitle}>Choose a serving</Text>
          </View>
        </View>
        <View style={styles.optionCard}>
          {SIZE_OPTIONS.map((option, index) => {
            const selected = option.value === selectedSize?.value;
            const isLast = index === SIZE_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionRow,
                  !isLast && styles.optionRowSpacing,
                  selected && styles.optionRowActive,
                ]}
                onPress={() => setSelectedSize(option)}
              >
                <View style={styles.optionBody}>
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && styles.optionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.optionHint}>{option.hint}</Text>
                </View>
                <View style={styles.optionMeta}>
                  <View
                    style={[
                      styles.optionPriceChip,
                      selected && styles.optionPriceChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionPrice,
                        selected && styles.optionPriceActive,
                      ]}
                    >
                      {option.price
                        ? `+${formatPeso(option.price)}`
                        : 'Included'}
                    </Text>
                  </View>
                  {selected && (
                    <View style={styles.optionSelectedBadge}>
                      <Text style={styles.optionSelectedText}>Selected</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Add-ons</Text>
            <Text style={styles.sectionSubtitle}>Upgrade your order</Text>
          </View>
        </View>
        <View style={styles.optionCard}>
          {ADD_ONS.map((option, index) => {
            const selected = selectedAddOns.includes(option.key);
            const isLast = index === ADD_ONS.length - 1;
            return (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.optionRow,
                  !isLast && styles.optionRowSpacing,
                  selected && styles.optionRowActive,
                ]}
                onPress={() => toggleAddon(option.key)}
              >
                <View style={styles.optionBody}>
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && styles.optionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
                <View style={styles.optionMeta}>
                  <View
                    style={[
                      styles.optionPriceChip,
                      selected && styles.optionPriceChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionPrice,
                        selected && styles.optionPriceActive,
                      ]}
                    >
                      +{formatPeso(option.price)}
                    </Text>
                  </View>
                  {selected && (
                    <View style={styles.optionSelectedBadge}>
                      <Text style={styles.optionSelectedText}>Selected</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Price Summary</Text>
            <Text style={styles.sectionSubtitle}>Per item</Text>
          </View>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Base price</Text>
            <Text style={styles.summaryValue}>{formatPeso(basePrice)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Add-ons</Text>
            <Text style={styles.summaryValue}>
              {additionsTotal
                ? `+${formatPeso(additionsTotal)}`
                : formatPeso(0)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Item total</Text>
            <Text style={styles.summaryTotalValue}>
              {formatPeso(updatedPrice)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <LinearGradient
        colors={['#FFFFFF', '#FFF3E4']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.actionBar}
      >
        <View style={styles.actionRow}>
          <View style={styles.actionInfo}>
            <View style={styles.actionBadge}>
              <Ionicons name="pricetag-outline" size={14} color="#F97316" />
              <Text style={styles.actionLabel}>Updated total</Text>
            </View>
            <Text style={styles.actionValue}>{formatPeso(updatedPrice)}</Text>
          </View>
          <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
            <Text style={styles.actionButtonText}>Save Changes</Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color="#fff"
              style={styles.actionButtonIcon}
            />
          </TouchableOpacity>
        </View>
      </LinearGradient>
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
    paddingTop: 16,
    paddingBottom: 140,
  },
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
  headerContainer: {
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
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
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: 'Roboto_400Regular',
    color: '#4B5563',
    textAlign: 'center',
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
  optionCard: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFF7EE',
  },
  optionRowSpacing: {
    marginBottom: 10,
  },
  optionRowActive: {
    backgroundColor: '#FFE7C7',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  optionBody: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  optionLabelActive: {
    color: '#9A3412',
  },
  optionHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  optionMeta: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  optionPriceChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F3D6B7',
  },
  optionPriceChipActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
  optionPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  optionPriceActive: {
    color: '#9A3412',
  },
  optionSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0E0',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  optionSelectedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9A3412',
  },
  summaryCard: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F3D6B7',
    marginVertical: 10,
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  summaryTotalValue: {
    fontSize: 22,
    fontFamily: 'Roboto_700Bold',
    color: '#FF7A18',
  },
  actionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FFE0C2',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionInfo: {
    flex: 1,
    marginRight: 12,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0E0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
    marginLeft: 6,
  },
  actionValue: {
    fontSize: 24,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginTop: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: '#F97316',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  actionButtonIcon: {
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 8,
    color: '#F97316',
    fontFamily: 'Roboto_700Bold',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#F97316',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
