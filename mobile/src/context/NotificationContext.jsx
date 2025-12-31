// context/NotificationContext.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { fetchNotifications, getValidToken } from '../api/api';

const TOAST_DURATION_MS = 2500;
const TOAST_FADE_MS = 200;
const NOTIFICATION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const hadTokenRef = useRef(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslate = useRef(new Animated.Value(-8)).current;
  const toastTimerRef = useRef(null);

  const showToast = useCallback(
    (message) => {
      if (!message) return;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      setToastMessage(message);
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: TOAST_FADE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslate, {
          toValue: 0,
          duration: TOAST_FADE_MS,
          useNativeDriver: true,
        }),
      ]).start();

      toastTimerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: TOAST_FADE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(toastTranslate, {
            toValue: -8,
            duration: TOAST_FADE_MS,
            useNativeDriver: true,
          }),
        ]).start(() => setToastMessage(''));
      }, TOAST_DURATION_MS);
    },
    [toastOpacity, toastTranslate]
  );

  const loadNotifications = async ({ silent = false } = {}) => {
    const shouldUpdateLoading = !silent;
    try {
      if (shouldUpdateLoading) {
        setLoading(true);
      }
      const token = await getValidToken();
      const hasToken = Boolean(token);
      if (hadTokenRef.current === null) {
        hadTokenRef.current = hasToken;
      }
      if (!hasToken) {
        setNotifications([]);
        if (!silent && hadTokenRef.current) {
          showToast('You are logged out. Sign in to see notifications.');
        }
        hadTokenRef.current = false;
        return;
      }
      hadTokenRef.current = true;
      const data = await fetchNotifications(); // fetch from backend
      const list = Array.isArray(data) ? data : [];
      setNotifications(list);
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const code = err?.code ?? err?.response?.data?.code;
      const message = err?.message || '';
      if (
        status === 401 ||
        code === 'token_not_valid' ||
        /token/i.test(message)
      ) {
        setNotifications([]);
        if (!silent && hadTokenRef.current) {
          showToast('Session expired. Please sign in again.');
        }
      } else {
        console.error('Failed to load notifications:', err);
        if (!silent) {
          showToast('Unable to refresh notifications right now.');
        }
      }
    } finally {
      if (shouldUpdateLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadNotifications({ silent: false });

    const interval = setInterval(
      () => loadNotifications({ silent: true }),
      NOTIFICATION_REFRESH_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  return (
    <NotificationContext.Provider
      value={{ notifications, loading, refresh: loadNotifications }}
    >
      <View style={styles.providerRoot}>
        {children}
        {toastMessage ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                opacity: toastOpacity,
                transform: [{ translateY: toastTranslate }],
              },
            ]}
          >
            <Text style={styles.toastText}>{toastMessage}</Text>
          </Animated.View>
        ) : null}
      </View>
    </NotificationContext.Provider>
  );
};

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
  toast: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
