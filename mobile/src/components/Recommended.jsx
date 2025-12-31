import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Roboto_400Regular,
  Roboto_700Bold,
  useFonts,
} from '@expo-google-fonts/roboto';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from '../styles/cn';
import { resolveImageSource } from '../utils/image';

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width * 0.78, 320);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.62);
const CARD_SPACING = 16;

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'PHP --';
  }
  return `PHP ${numeric.toFixed(2)}`;
};

export default function Recommended({ items = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedItem, setFocusedItem] = useState(null);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const flatListRef = useRef(null);
  const autoSlideRef = useRef(null);

  const [fontsLoaded] = useFonts({ Roboto_400Regular, Roboto_700Bold });

  const data = useMemo(() => {
    return items
      .filter((entry) => entry && !entry.archived && entry.available !== false)
      .map((item, index) => {
        const ratingValue =
          item.rating != null && Number.isFinite(Number(item.rating))
            ? Number(item.rating)
            : null;
        const reviewsValue =
          item.reviews != null && Number.isFinite(Number(item.reviews))
            ? Number(item.reviews)
            : null;

        return {
          id: item.id || `recommended-${index}`,
          image: item.image || item.thumbnail || null,
          title: item.name || item.title || 'Menu Item',
          price: Number(item.price ?? item.amount ?? 0),
          rating: ratingValue,
          reviews: reviewsValue,
          description: item.description || '',
        };
      });
  }, [items]);

  useEffect(() => {
    if (focusedItem || data.length <= 1) {
      return undefined;
    }

    autoSlideRef.current = setInterval(() => {
      setActiveIndex((current) => {
        const nextIndex = (current + 1) % data.length;
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, 5000);

    return () => {
      if (autoSlideRef.current) {
        clearInterval(autoSlideRef.current);
      }
    };
  }, [data.length, focusedItem]);

  useEffect(
    () => () => {
      if (autoSlideRef.current) {
        clearInterval(autoSlideRef.current);
      }
    },
    []
  );

  if (!fontsLoaded || data.length === 0) {
    return null;
  }

  const handleLongPress = (item) => {
    if (autoSlideRef.current) {
      clearInterval(autoSlideRef.current);
    }
    setFocusedItem(item);

    scaleAnim.setValue(0);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleClosePopup = () => {
    setFocusedItem(null);
  };

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Recommended For You</Text>
          <Text style={styles.headerSubtitle}>Handpicked favorites today</Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{data.length} items</Text>
        </View>
      </View>
      <FlatList
        ref={flatListRef}
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        snapToAlignment="start"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        onScroll={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_SPACING)
          );
          if (Number.isFinite(index)) {
            setActiveIndex(index);
          }
        }}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => handleLongPress(item)}
            style={({ pressed }) => [
              styles.cardWrap,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.card}>
              <Image
                source={resolveImageSource(item.image)}
                style={styles.cardImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
                style={styles.cardOverlay}
              />
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.cardMetaRow}>
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>
                      {formatCurrency(item.price)}
                    </Text>
                  </View>
                  {Number.isFinite(item.rating) ? (
                    <View style={styles.ratingPill}>
                      <Text style={styles.ratingText}>
                        {item.rating.toFixed(1)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </Pressable>
        )}
        keyExtractor={(item) => item.id}
      />

      <View style={styles.indicatorRow}>
        {Array.from({ length: data.length }).map((_, index) => (
          <View
            key={`indicator-${index}`}
            className={cn(
              'mx-1 mt-2.5 h-2 w-2 self-center rounded-full bg-neutral-300',
              index === activeIndex && 'w-4 bg-primary-500'
            )}
          />
        ))}
      </View>

      {focusedItem && (
        <Modal transparent visible animationType="fade">
          <Pressable
            className="flex-1 items-center justify-center bg-[rgba(0,0,0,0.4)]"
            onPress={handleClosePopup}
          >
            <Animated.View
              className="items-center rounded-2xl bg-white p-4 shadow-xl"
              style={[
                {
                  width: width * 0.8,
                  elevation: 10,
                }, // NativeWind: popup sizing & Android elevation require inline style
                {
                  transform: [{ scale: scaleAnim }],
                  opacity: opacityAnim,
                },
              ]}
            >
              <Image
                source={resolveImageSource(focusedItem.image)}
                className="mb-4 w-full rounded-xl"
                style={{ height: width * 0.5 }} // NativeWind: dynamic image height requires inline style
                resizeMode="cover"
              />
              <View className="items-center">
                <Text className="mb-1.5 font-heading text-xl text-neutral-900">
                  {focusedItem.title}
                </Text>
                <Text className="mb-1 text-lg text-warning-500">
                  {formatCurrency(focusedItem.price)}
                </Text>
                {Number.isFinite(focusedItem.rating) ? (
                  <Text className="text-sm text-neutral-500">
                    Rating: {focusedItem.rating.toFixed(1)}
                    {Number.isFinite(focusedItem.reviews)
                      ? ` (${focusedItem.reviews} reviews)`
                      : ''}
                  </Text>
                ) : null}
                {focusedItem.description ? (
                  <Text className="mt-1.5 text-center text-sm text-neutral-600">
                    {focusedItem.description}
                  </Text>
                ) : null}
              </View>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  headerBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  cardWrap: {
    marginRight: CARD_SPACING,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7EDE2',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '55%',
  },
  cardInfo: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#fff',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  pricePill: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  ratingPill: {
    marginLeft: 8,
    backgroundColor: 'rgba(17,24,39,0.75)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
