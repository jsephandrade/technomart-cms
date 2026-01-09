import React, {
  startTransition,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import InventoryExpiringProducts from '@/components/inventory/InventoryExpiringProducts';
import { toast } from 'sonner';
import InventoryHeader from '@/components/inventory/InventoryHeader';
import InventoryFilters from '@/components/inventory/InventoryFilters';
import InventoryTabs from '@/components/inventory/InventoryTabs';
import InventoryFooter from '@/components/inventory/InventoryFooter';
import InventoryModals from '@/components/inventory/InventoryModals';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Boxes } from 'lucide-react';
import { notificationsService } from '@/api/services/notificationsService';
import { useAuth } from '@/components/AuthContext';
import { useInventoryManagement } from '@/hooks/useInventoryManagement';
import { calculateExpiringItems } from '@/components/analytics/utils/analyticsHelpers';

const EXPIRY_WARNING_DAYS = 5;
const EXPIRY_WARNING_STORAGE_KEY = 'inventory.expiryWarnings.v1';

const loadExpiryWarnings = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EXPIRY_WARNING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveExpiryWarnings = (warnings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      EXPIRY_WARNING_STORAGE_KEY,
      JSON.stringify(warnings || {})
    );
  } catch {
    // Ignore storage failures.
  }
};

const buildExpiryKey = (itemId, expiryDate) => {
  if (!itemId || !expiryDate) return '';
  let dateKey = '';
  try {
    const parsed = new Date(expiryDate);
    if (!Number.isNaN(parsed.getTime())) {
      dateKey = parsed.toISOString().split('T')[0];
    }
  } catch {
    dateKey = '';
  }
  if (!dateKey) {
    dateKey = String(expiryDate).split('T')[0];
  }
  return `${itemId}:${dateKey}`;
};

const getDaysToExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDay = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  return Math.ceil((expiryDay - today) / (1000 * 60 * 60 * 24));
};

const Inventory = () => {
  const { can } = useAuth();
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
    loading: inventoryLoading,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    updateStock,
    refetch: refetchInventory,
  } = useInventoryManagement(listParams);
  const [disabledMap, setDisabledMap] = useState({});
  const notifyInFlightRef = useRef(false);
  const canSendNotifications = can('notification.send');

  const schedulePostMutationSync = useCallback(() => {
    startTransition(() => {
      refetchInventory();
    });
  }, [refetchInventory]);

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

  const expiringItems = useMemo(() => {
    const normalized = (items || []).map((item) => ({
      ...item,
      expiryDate: item.expiryDate || item.expiry_date || null,
    }));
    return calculateExpiringItems(normalized, EXPIRY_WARNING_DAYS).filter(
      (item) => item.daysToExpiry >= 0
    );
  }, [items]);

  const notifyExpiryWarning = useCallback(
    async (item, { showToast = false } = {}) => {
      const expiryDate = item?.expiryDate || item?.expiry_date || null;
      if (!expiryDate) return;
      const daysToExpiry = getDaysToExpiry(expiryDate);
      if (
        daysToExpiry === null ||
        daysToExpiry > EXPIRY_WARNING_DAYS ||
        daysToExpiry < 0
      )
        return;

      const expiresLabel =
        daysToExpiry === 0
          ? 'expires today'
          : `expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`;
      const title = 'Inventory expiry warning';
      const itemName = item.name || 'Inventory item';
      const message = `${itemName} ${expiresLabel}.`;

      if (showToast) {
        toast.warning(message);
      }

      if (!canSendNotifications) return;
      const key = buildExpiryKey(item.id, expiryDate);
      if (!key) return;
      const warnings = loadExpiryWarnings();
      if (warnings[key]) return;

      warnings[key] = Date.now();
      saveExpiryWarnings(warnings);
      try {
        await notificationsService.create({
          title,
          message,
          type: 'warning',
        });
      } catch {
        // Ignore notification failures.
      }
    },
    [canSendNotifications]
  );

  useEffect(() => {
    if (!canSendNotifications) return;
    if (!expiringItems.length) return;
    if (notifyInFlightRef.current) return;
    notifyInFlightRef.current = true;
    const run = async () => {
      for (const item of expiringItems) {
        await notifyExpiryWarning(item);
      }
    };
    run().finally(() => {
      notifyInFlightRef.current = false;
    });
  }, [canSendNotifications, expiringItems, notifyExpiryWarning]);

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
      await notifyExpiryWarning(created, { showToast: true });
      schedulePostMutationSync();
      // No extra call needed since backend mirrors initial quantity into ledger and response includes authoritative quantity
      return created;
    },
    [createInventoryItem, notifyExpiryWarning, schedulePostMutationSync]
  );

  const handleEditItem = useCallback((item) => {
    setEditingItem(item);
    setShowEditModal(true);
  }, []);

  const handleUpdateItem = useCallback(
    async (updatedItem) => {
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

      try {
        await Promise.all([metaPromise, stockPromise]);
        await notifyExpiryWarning(
          { ...updatedItem, expiryDate: metaPayload.expiryDate },
          { showToast: true }
        );
      } catch {
        // Errors are handled in the hooks; keep UI responsive.
      } finally {
        schedulePostMutationSync();
      }
    },
    [
      updateInventoryItem,
      editingItem,
      schedulePostMutationSync,
      updateStock,
      notifyExpiryWarning,
    ]
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

      {/* Right: Upcoming Expired Products (beside) */}
      <div className="space-y-4">
        <InventoryExpiringProducts
          items={expiringItems}
          loading={inventoryLoading}
          thresholdDays={EXPIRY_WARNING_DAYS}
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
