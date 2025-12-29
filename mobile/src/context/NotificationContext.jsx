// context/NotificationContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchNotifications } from '../api/api'; // we'll create this API function

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await fetchNotifications(); // fetch from backend
      const list = Array.isArray(data) ? data : [];
      // Optional: filter only menu updates
      const menuUpdates = list.filter(
        (n) => n.type === 'new' || n.type === 'sold'
      );
      setNotifications(menuUpdates);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Optional: refresh notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notifications, loading, refresh: loadNotifications }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
