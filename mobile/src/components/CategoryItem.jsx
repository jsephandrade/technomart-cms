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

export default function CategoryItem({ image, title, onPress }) {
  const imageSource = resolveImageSource(image);
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
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
          <View style={styles.tag}>
            <Text style={styles.tagText}>Browse</Text>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    height: 170,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  background: {
    flex: 1,
  },
  backgroundImage: {
    transform: [{ scale: 1.1 }],
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 138, 61, 0.4)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  imageWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  image: {
    width: 70,
    height: 70,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Roboto_700Bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  tag: {
    backgroundColor: 'rgba(255, 231, 199, 0.9)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9A3412',
  },
});
