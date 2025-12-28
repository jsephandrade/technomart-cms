import React, { startTransition, useCallback, useMemo, useState } from 'react';
import InventoryRecentActivity from '@/components/inventory/InventoryRecentActivity';
import { toast } from 'sonner';
import InventoryHeader from '@/components/inventory/InventoryHeader';
import InventoryFilters from '@/components/inventory/InventoryFilters';
import InventoryTabs from '@/components/inventory/InventoryTabs';
import InventoryFooter from '@/components/inventory/InventoryFooter';
import InventoryModals from '@/components/inventory/InventoryModals';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Boxes } from 'lucide-react';
import {
  useInventoryManagement,
  useInventoryActivities,
} from '@/hooks/useInventoryManagement';

const Inventory = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Build stable params for list query
  const listParams = useMemo(
    () => ({
      search: searchTerm,
      category: selectedCategory === 'all' ? '' : selectedCategory,
    }),
    [searchTerm, selectedCategory]
  );
  const {
    items,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    updateStock,
    refetch: refetchInventory,
  } = useInventoryManagement(listParams);
  const [disabledMap, setDisabledMap] = useState({});

  // Recent activity (DB)
  const activityParams = useMemo(() => ({ limit: 8 }), []);
  const {
    activities: recentActivities,
    loading: recentLoading,
    refetch: refetchActivities,
  } = useInventoryActivities(activityParams, {
    auto: true,
    debounceMs: 400,
    cacheTtlMs: 30000,
  });

  const forceRefreshActivities = useCallback(
    () => refetchActivities({ force: true }),
    [refetchActivities]
  );

  const schedulePostMutationSync = useCallback(() => {
    startTransition(() => {
      forceRefreshActivities();
      refetchInventory();
    });
  }, [forceRefreshActivities, refetchInventory]);

  const categories = [
    'Grains',
    'Meat',
    'Vegetables',
    'Dairy',
    'Condiments',
    'Baking',
    'Fruits',
    'Seafood',
    'Beverages',
    'Spices',
    'Oils',
    'Frozen',
    'Canned Goods',
    'Dry Goods',
    'Snacks',
    'Packaging',
    'Cleaning Supplies',
    'Ingredients',
  ];

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const mapped = (items || []).map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      currentStock: it.quantity ?? 0,
      minThreshold: it.minStock ?? 0,
      unit: it.unit,
      supplier: it.supplier || '',
      expiryDate: it.expiryDate || null,
      disabled: !!disabledMap[it.id],
      lastUpdated: it.updatedAt || it.lastRestocked || '',
    }));
    return mapped.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(term) ||
        (item.supplier || '').toLowerCase().includes(term);
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [items, disabledMap, searchTerm, selectedCategory]);

  const getStockPercentage = (current, threshold) =>
    Math.min(100, Math.round((current / (threshold * 2)) * 100));
  const getStockBadgeVariant = (current, threshold) =>
    current <= threshold * 0.5
      ? 'destructive'
      : current <= threshold
        ? 'warning'
        : 'success';
  const getStockStatusText = (current, threshold) =>
    current <= threshold * 0.5
      ? 'Critical'
      : current <= threshold
        ? 'Low'
        : current >= threshold * 2
          ? 'Sufficient'
          : 'Good';

  const handleAddItem = useCallback(
    async (newItem) => {
      const initialQty = Number(newItem.currentStock ?? 0);
      // Create item (backend now also mirrors initial quantity into ledger, but we set quantity explicitly just in case)
      const payload = {
        name: newItem.name,
        category: newItem.category,
        quantity: initialQty,
        minStock: Number(newItem.minThreshold ?? 0),
        unit: newItem.unit,
        supplier: newItem.supplier,
        expiryDate: newItem.expiryDate ? newItem.expiryDate : null,
      };
      const created = await createInventoryItem(payload);
      schedulePostMutationSync();
      // No extra call needed since backend mirrors initial quantity into ledger and response includes authoritative quantity
      return created;
    },
    [createInventoryItem, schedulePostMutationSync]
  );

  const handleEditItem = useCallback((item) => {
    setEditingItem(item);
    setShowEditModal(true);
  }, []);

  const handleUpdateItem = useCallback(
    (updatedItem) => {
      const newQty = Number(updatedItem.currentStock ?? 0);
      const prevQty = Number(
        (editingItem && editingItem.currentStock) ?? newQty
      );
      // Optimistically update UI before awaiting backend responses.
      const metaPayload = {
        name: updatedItem.name,
        category: updatedItem.category,
        minStock: Number(updatedItem.minThreshold ?? 0),
        unit: updatedItem.unit,
        supplier: updatedItem.supplier,
        expiryDate: updatedItem.expiryDate ? updatedItem.expiryDate : null,
      };
      const metaPromise = updateInventoryItem(updatedItem.id, metaPayload);
      const stockPromise =
        !Number.isNaN(newQty) && newQty !== prevQty
          ? updateStock(updatedItem.id, newQty, 'set')
          : Promise.resolve();

      Promise.all([metaPromise, stockPromise])
        .catch(() => {
          // Errors are handled in the hooks; keep UI responsive.
        })
        .finally(() => {
          schedulePostMutationSync();
        });
    },
    [updateInventoryItem, editingItem, schedulePostMutationSync, updateStock]
  );

  const handleDeleteItem = useCallback(
    async (item) => {
      if (!item?.id) return;
      const confirmed = window.confirm(
        `Delete ${item.name}? This action cannot be undone.`
      );
      if (!confirmed) return;
      await deleteInventoryItem(item.id);
      schedulePostMutationSync();
    },
    [deleteInventoryItem, schedulePostMutationSync]
  );

  const handleDisableItem = useCallback((itemId, itemName) => {
    setDisabledMap((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      const disabled = !!next[itemId];
      toast.success(
        `${itemName} has been ${disabled ? 'archived' : 'unarchived'}`
      );
      return next;
    });
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Left: Raw Materials Inventory */}
      <div className="md:col-span-2 space-y-4">
        <FeaturePanelCard
          title="Raw Materials Inventory"
          titleStyle="accent"
          titleIcon={Boxes}
          titleAccentClassName="px-3 py-1 text-xs md:text-sm"
          titleClassName="text-xs md:text-sm"
          description="Track and manage inventory items"
          headerActions={
            <InventoryHeader onAddItem={() => setShowAddModal(true)} />
          }
          contentClassName="space-y-4"
        >
          <InventoryFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            categories={categories}
          />

          <InventoryTabs
            filteredItems={filteredItems}
            onEditItem={handleEditItem}
            onDisableItem={handleDisableItem}
            onDeleteItem={handleDeleteItem}
            getStockPercentage={useCallback(getStockPercentage, [])}
            getStockBadgeVariant={useCallback(getStockBadgeVariant, [])}
            getStockStatusText={useCallback(getStockStatusText, [])}
          />

          <InventoryFooter
            filteredCount={filteredItems.length}
            totalCount={(items || []).length}
          />
        </FeaturePanelCard>
      </div>

      {/* Right: Recent Inventory Activity (beside) */}
      <div className="space-y-4">
        <InventoryRecentActivity
          recentActivities={recentActivities}
          loading={recentLoading}
        />
      </div>

      <InventoryModals
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        showEditModal={showEditModal}
        setShowEditModal={setShowEditModal}
        editingItem={editingItem}
        onAddItem={handleAddItem}
        onEditItem={handleUpdateItem}
      />
    </div>
  );
};

export default Inventory;
