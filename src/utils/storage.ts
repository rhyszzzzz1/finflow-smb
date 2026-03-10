// Utility functions for localStorage operations with user isolation

export const getUserStorageKey = (userId: string, key: string): string => {
  return `fintrac_${userId}_${key}`;
};

export const getUserData = <T>(userId: string, key: string, defaultValue: T): T => {
  const storageKey = getUserStorageKey(userId, key);
  const data = localStorage.getItem(storageKey);
  return data ? JSON.parse(data) : defaultValue;
};

export const setUserData = <T>(userId: string, key: string, value: T): void => {
  const storageKey = getUserStorageKey(userId, key);
  localStorage.setItem(storageKey, JSON.stringify(value));
};

export const removeUserData = (userId: string, key: string): void => {
  const storageKey = getUserStorageKey(userId, key);
  localStorage.removeItem(storageKey);
};
