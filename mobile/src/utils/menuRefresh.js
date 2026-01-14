const listeners = new Set();

export const notifyMenuRefresh = (payload = null) => {
  for (const callback of Array.from(listeners)) {
    try {
      callback(payload);
    } catch (error) {
      console.warn('menu refresh listener failed', error);
    }
  }
};

export const subscribeMenuRefresh = (callback) => {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
