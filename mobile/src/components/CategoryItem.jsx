import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import { resolveImageSource } from '../utils/image';

const CARD_SIZE = 80; // ~0.5 in at 160 dpi (dp)

export default function CategoryItem({ image, title, onPress, disabled }) {
  const imageSource = resolveImageSource(image);
  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.containerDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <ImageBackground
        source={imageSource}
        style={styles.background}
        imageStyle={styles.backgroundImage}
        blurRadius={12}
      >
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.imageWrap}>
            <Image
              source={imageSource}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    width: CARD_SIZE,
    height: CARD_SIZE,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  containerDisabled: {
    opacity: 0.5,
  },
  background: {
    flex: 1,
  },
  backgroundImage: {
    transform: [{ scale: 1.1 }],
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 138, 61, 0.45)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  imageWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  image: {
    width: 28,
    height: 28,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Roboto_700Bold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
