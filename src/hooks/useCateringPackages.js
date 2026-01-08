import { useState, useEffect } from 'react';
import cateringService from '@/api/services/cateringService';

export const useCateringPackages = () => {
  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPackages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await cateringService.listPackages({
        includeItems: true,
        active: true,
      });
      const items = response?.data || [];
      setPackages(items);
    } catch (err) {
      const message =
        err?.message || err?.details?.message || 'Failed to load packages';
      setError(message);
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  return {
    packages,
    isLoading,
    error,
    refetch: fetchPackages,
  };
};

export default useCateringPackages;
