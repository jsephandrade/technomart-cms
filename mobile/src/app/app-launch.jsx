import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  TouchableWithoutFeedback,
  StatusBar,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_URL,
  USER_CACHE_KEY,
  clearStoredTokens,
  getValidToken,
} from '../api/api';

export default function AppLaunchScreen() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Animations
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const logoY = useRef(new Animated.Value(10)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  const spin1 = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const spin3 = useRef(new Animated.Value(0)).current;

  // Go to login (replace so user can’t go back to splash)
  const goNext = useCallback(() => {
    Animated.timing(fadeOut, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      router.replace(isAuthenticated ? '/home-dashboard' : '/account-login');
    });
  }, [fadeOut, isAuthenticated, router]);

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const token = await getValidToken();
        if (!token) {
          if (active) {
            setIsAuthenticated(false);
          }
          return;
        }

        const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
        const storedUser = entries[0][1] || entries[1][1];
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            const email = String(parsed?.email || '').toLowerCase();
            if (email.endsWith('@guest.local')) {
              if (active) {
                setIsAuthenticated(false);
              }
              return;
            }
          } catch (err) {
            console.warn('Failed to parse stored user:', err);
          }
        }

        try {
          const res = await fetch(`${BASE_URL}/accounts/profile/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            await clearStoredTokens();
            if (active) {
              setIsAuthenticated(false);
            }
            return;
          }
        } catch (err) {
          console.warn('Profile check failed, continuing session:', err);
        }

        if (active) {
          setIsAuthenticated(true);
        }
      } finally {
        if (active) {
          setAuthChecked(true);
        }
      }
    };
    checkAuth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.('Techno Mart is loading');

    // Start spinning icons
    const loops = [
      Animated.loop(
        Animated.timing(spin1, {
          toValue: 1,
          duration: 9000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(spin2, {
          toValue: 1,
          duration: 11000,
          easing: Easing.linear,
          useNativeDriver: true,
          delay: 300,
        })
      ),
      Animated.loop(
        Animated.timing(spin3, {
          toValue: 1,
          duration: 10000,
          easing: Easing.linear,
          useNativeDriver: true,
          delay: 600,
        })
      ),
    ];
    loops.forEach((l) => l.start());

    // Logo animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoY, {
          toValue: 0,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(650),
    ]).start();

    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [logoY, opacity, scale, spin1, spin2, spin3]);

  useEffect(() => {
    if (!authChecked) {
      return undefined;
    }
    const timeout = setTimeout(goNext, 2500);
    return () => clearTimeout(timeout);
  }, [authChecked, goNext]);

  // Spins
  const rotate1 = spin1.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const rotate2 = spin2.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  const rotate3 = spin3.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        if (authChecked) {
          goNext();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel="Skip intro and continue to login"
    >
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'white',
          paddingTop: 0,
          paddingBottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fadeOut, // fade-out applied here
        }}
      >
        <StatusBar barStyle="dark-content" />

        {/* Background spinning icons */}
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 60,
              left: 30,
              opacity: 0.18,
              transform: [{ rotate: rotate1 }],
            }}
          >
            <MaterialCommunityIcons name="pizza" size={110} color="#FFC999" />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              top: 130,
              right: 30,
              opacity: 0.18,
              transform: [{ rotate: rotate2 }],
            }}
          >
            <MaterialCommunityIcons
              name="french-fries"
              size={110}
              color="#FFC999"
            />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 110,
              left: 80,
              opacity: 0.18,
              transform: [{ rotate: rotate3 }],
            }}
          >
            <MaterialCommunityIcons name="cup" size={110} color="#FFC999" />
          </Animated.View>
        </View>

        {/* Logo */}
        <Animated.View
          style={{
            opacity,
            transform: [{ scale }, { translateY: logoY }],
          }}
        >
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 180, height: 180 }}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
