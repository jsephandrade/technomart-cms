// src/pages/MenuManagement.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useMenuManagement, {
  useMenuCategories,
} from '@/hooks/useMenuManagement';
import PackageFormModal from '@/components/catering/PackageFormModal';
import PackageManagementPanel from '@/components/catering/PackageManagementPanel';
import AddItemDialog from '@/components/menu/AddItemDialog';
import AddCategoryDialog from '@/components/menu/AddCategoryDialog';
import AddComboMealDialog from '@/components/menu/AddComboMealDialog';
import EditItemDialog from '@/components/menu/EditItemDialog';
import CategoryTabs from '@/components/menu/CategoryTabs';
import { toast } from 'sonner';
import cateringService from '@/api/services/cateringService';
import { menuService } from '@/api/services/menuService';
import { useAuth } from '@/components/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Menu as MenuIcon, Package, PlusCircle } from 'lucide-react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { initPaxState, parseEstimatedPax } from '@/lib/paxTracker';

const stripUnsupportedFields = (item = {}) => {
  if (!item) return item;
  // Remove fields the backend update endpoint ignores/complains about
  // (seen in some list responses like cart/combo contexts)
  // Keep reference when no forbidden keys to avoid extra renders.
  const { quantity, qty, orderedQuantity, orderQuantity, ...rest } = item;
  const hadUnsupported =
    quantity !== undefined ||
    qty !== undefined ||
    orderedQuantity !== undefined ||
    orderQuantity !== undefined;
  return hadUnsupported ? rest : item;
};

const MenuManagement = () => {
  const { can } = useAuth();
  const {
    items,
    createMenuItem,
    createMenuItemOptimistic,
    updateMenuItem,
    deleteMenuItem: archiveMenuItem,
    uploadItemImage,
    deleteItemImage,
    refetch: refetchActive,
  } = useMenuManagement({});
  const {
    items: archivedItems,
    loading: archivedLoading,
    restoreMenuItem: restoreArchivedItem,
    hardDeleteMenuItem: hardDeleteArchivedItem,
    refetch: refetchArchived,
  } = useMenuManagement({ archived: true });
  const { categories: categoryRows, refetch: refetchCategories } =
    useMenuCategories();
  const categories = useMemo(() => {
    const result = [];
    const seen = new Set();
    const add = (value) => {
      const name = String(value || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      result.push(name);
    };
    (categoryRows || []).forEach((c) => {
      if (typeof c === 'string') {
        add(c);
      } else if (c && typeof c === 'object') {
        add(c.name || c.label || c.title || c.slug || '');
      }
    });
    (items || []).forEach((it) => add(it?.category));
    return result;
  }, [categoryRows, items]);
  const itemsWithImages = items;
  const archivedItemsWithImages = archivedItems;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    available: true,
    imageUrl: '',
    imageFile: null,
    estimatedPax: '60',
  });
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [packageSearchTerm, setPackageSearchTerm] = useState('');
  const [packageStatus, setPackageStatus] = useState('active');
  const [packages, setPackages] = useState([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [isSubmittingPackage, setIsSubmittingPackage] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [isLoadingMenuItems, setIsLoadingMenuItems] = useState(false);
  const [activeTab, setActiveTab] = useState('menu');
  const [bulkPaxUpdating, setBulkPaxUpdating] = useState(false);
  const canManagePackages = can('catering.manage');

  const handleAddItem = () => {
    if (adding) return;
    if (!newItem.name || !newItem.category) {
      toast.error('Please fill in all required fields');
      return;
    }
    const trimmedPrice = String(newItem.price ?? '').trim();
    const parsedPrice = trimmedPrice === '' ? Number.NaN : Number(trimmedPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error('Please enter a valid price.');
      return;
    }

    setAdding(true);

    const payload = {
      name: newItem.name,
      description: newItem.description,
      price: parsedPrice,
      category: newItem.category,
      available: Boolean(newItem.available),
      ingredients: [],
      preparationTime: 0,
      estimatedPax: newItem.estimatedPax,
    };
    const previewUrl = newItem.imageUrl;
    const imageFile = newItem.imageFile;

    setNewItem({
      name: '',
      description: '',
      price: '',
      category: '',
      available: true,
      imageUrl: '',
      imageFile: null,
      estimatedPax: '60',
    });
    setDialogOpen(false);
    setAdding(false);

    createMenuItemOptimistic(payload, { previewImageUrl: previewUrl })
      .then((created) => {
        if (imageFile && created?.id) {
          setUploadQueue((prev) => [
            ...prev,
            { id: created.id, file: imageFile },
          ]);
        }
      })
      .catch((e) => {
        toast.error(e?.message || 'Failed to add menu item');
      });
  };

  useEffect(() => {
    if (isUploading || uploadQueue.length === 0) return;
    const nextJob = uploadQueue[0];
    if (!nextJob?.id || !nextJob?.file) {
      setUploadQueue((prev) => prev.slice(1));
      return;
    }
    let canceled = false;
    const runUpload = async () => {
      setIsUploading(true);
      try {
        await uploadItemImage(nextJob.id, nextJob.file);
      } catch (err) {
        console.error('Menu image upload failed', err);
      } finally {
        if (!canceled) {
          setUploadQueue((prev) => prev.slice(1));
          setIsUploading(false);
        }
      }
    };
    runUpload();
    return () => {
      canceled = true;
    };
  }, [uploadQueue, isUploading, uploadItemImage]);

  const fetchPackages = useCallback(
    async (status = packageStatus) => {
      setIsLoadingPackages(true);
      setPackagesError(null);
      try {
        const res = await cateringService.listPackages({
          includeItems: true,
          active: status === 'active',
        });
        const list = res?.data || [];
        setPackages(Array.isArray(list) ? list : []);
      } catch (error) {
        const message =
          error?.message ||
          error?.details?.message ||
          'Failed to load packages';
        setPackagesError(message);
        toast.error(message);
        setPackages([]);
      } finally {
        setIsLoadingPackages(false);
      }
    },
    [packageStatus]
  );

  const fetchMenuItems = useCallback(async () => {
    setIsLoadingMenuItems(true);
    try {
      const res = await menuService.getMenuItems({ archived: false });
      const list = res?.data || [];
      setMenuItems(Array.isArray(list) ? list : []);
    } catch (error) {
      const message =
        error?.message ||
        error?.details?.message ||
        'Failed to load menu items';
      toast.error(message);
      setMenuItems([]);
    } finally {
      setIsLoadingMenuItems(false);
    }
  }, []);

  useEffect(() => {
    if (!canManagePackages) return;
    if (activeTab !== 'packages') return;
    fetchPackages(packageStatus);
  }, [activeTab, canManagePackages, fetchPackages, packageStatus]);

  useEffect(() => {
    if (!showPackageModal) return;
    if (menuItems.length > 0 || isLoadingMenuItems) return;
    fetchMenuItems();
  }, [fetchMenuItems, isLoadingMenuItems, menuItems.length, showPackageModal]);

  const handleCreatePackage = useCallback(() => {
    setEditingPackage(null);
    setShowPackageModal(true);
  }, []);

  const handleEditPackage = useCallback((pkg) => {
    setEditingPackage(pkg);
    setShowPackageModal(true);
  }, []);

  const handlePackageModalChange = useCallback((nextOpen) => {
    setShowPackageModal(nextOpen);
    if (!nextOpen) {
      setEditingPackage(null);
    }
  }, []);

  const handleSubmitPackage = useCallback(
    async (payload) => {
      setIsSubmittingPackage(true);
      try {
        const response = editingPackage
          ? await cateringService.updatePackage(editingPackage.id, payload)
          : await cateringService.createPackage(payload);
        if (!response?.success) {
          throw new Error(
            response?.message ||
              (editingPackage
                ? 'Failed to update package'
                : 'Failed to create package')
          );
        }
        toast.success(
          editingPackage
            ? 'Package updated successfully.'
            : 'Package created successfully.'
        );
        setShowPackageModal(false);
        setEditingPackage(null);
        await fetchPackages(packageStatus);
        return true;
      } catch (error) {
        const message =
          error?.message ||
          error?.details?.message ||
          (editingPackage
            ? 'Failed to update package'
            : 'Failed to create package');
        toast.error(message);
        return false;
      } finally {
        setIsSubmittingPackage(false);
      }
    },
    [editingPackage, fetchPackages, packageStatus]
  );

  const handleTogglePackageActive = useCallback(
    async (pkg, nextActive) => {
      if (!pkg?.id) return;
      try {
        let response;
        if (nextActive) {
          response = await cateringService.updatePackage(pkg.id, {
            active: true,
          });
        } else {
          response = await cateringService.deactivatePackage(pkg.id);
        }
        if (response?.success === false) {
          throw new Error(
            response?.message || 'Unable to update package status'
          );
        }
        toast.success(
          nextActive
            ? `Package "${pkg.name}" activated.`
            : `Package "${pkg.name}" deactivated.`
        );
        await fetchPackages(packageStatus);
      } catch (error) {
        const message =
          error?.message ||
          error?.details?.message ||
          'Unable to update package status';
        toast.error(message);
      }
    },
    [fetchPackages, packageStatus]
  );

  const handlePackageStatusChange = useCallback((nextStatus) => {
    setPackageStatus(nextStatus === 'inactive' ? 'inactive' : 'active');
  }, []);

  useEffect(() => {
    const buildMap = () => {
      if (!Array.isArray(menuItems) || menuItems.length === 0) {
        initPaxState({});
        return;
      }
      const map = {};
      const comboRequirements = {};
      menuItems.forEach((item) => {
        if (!item?.id) return;
        const key = String(item.id);
        const estimated = parseEstimatedPax(item);
        map[key] = { estimated, remaining: estimated };
        const raw =
          item.ingredients ?? item.ingredientIds ?? item.ingredient_ids ?? [];
        if (Array.isArray(raw) && raw.length > 0) {
          const requirements = raw
            .map((entry) => {
              if (!entry) return null;
              if (typeof entry === 'object') {
                const id =
                  entry.id ||
                  entry.menuItemId ||
                  entry.itemId ||
                  entry.menu_item_id ||
                  null;
                if (!id) return null;
                const qtyRaw = entry.quantity || entry.qty || entry.count || 1;
                const qty = Number.isFinite(Number(qtyRaw))
                  ? Math.max(1, Math.floor(Number(qtyRaw)))
                  : 1;
                return { id: String(id), qty };
              }
              return { id: String(entry), qty: 1 };
            })
            .filter(Boolean);
          if (requirements.length > 0) {
            comboRequirements[key] = requirements;
          }
        }
      });
      initPaxState(map, { combos: comboRequirements });
    };
    buildMap();
  }, [menuItems]);

  const handleEditItem = async (overrideItem) => {
    try {
      const source = stripUnsupportedFields(overrideItem || editingItem);
      if (!source) return;
      if (!source.id) {
        toast.error('Cannot update: missing item id.');
        return;
      }
      const name = (source.name || '').trim();
      const category = (source.category || '').trim();
      const updates = {
        description: source.description || '',
        available: Boolean(source.available),
        ingredients: Array.isArray(source.ingredients)
          ? source.ingredients
          : undefined,
        preparationTime:
          source.preparationTime ?? source.preparation_time ?? undefined,
      };
      if (name) updates.name = name;
      if (category) updates.category = category;
      const priceNum = Number(source.price);
      if (!Number.isNaN(priceNum) && priceNum >= 0) {
        updates.price = priceNum;
      }
      const rawPax =
        source.estimatedPax ??
        source.paxPerPreparation ??
        source.pax_per_preparation ??
        source.estimated ??
        source.pax;
      if (rawPax !== undefined && rawPax !== null) {
        const parsedRaw = typeof rawPax === 'string' ? rawPax.trim() : rawPax;
        if (parsedRaw !== '') {
          const paxNum = Number(parsedRaw);
          if (Number.isFinite(paxNum) && paxNum >= 0) {
            updates.estimatedPax = Math.floor(paxNum);
          }
        }
      }
      // Backend rejects making archived items available; guard early.
      if (source.archived && updates.available) {
        toast.error('Restore this item before making it available.');
        updates.available = false;
      }
      await updateMenuItem(source.id, updates);
      if (source.imageFile) {
        await uploadItemImage(source.id, source.imageFile);
      }
      setEditingItem(null);
      refetchActive?.();
      refetchArchived?.();
    } catch (e) {
      toast.error(e?.message || 'Failed to update menu item');
    }
  };

  const handleArchiveItem = async (id) => {
    try {
      await archiveMenuItem(id);
      refetchArchived();
      refetchActive();
    } catch (e) {
      toast.error(e?.message || 'Failed to archive menu item');
    }
  };

  const handleRestoreItem = async (item) => {
    try {
      await restoreArchivedItem(item.id);
      refetchArchived();
      refetchActive();
      toast.success(`${item.name} has been restored to the active menu.`);
    } catch (e) {
      toast.error(e?.message || 'Failed to restore menu item');
    }
  };

  const handleHardDeleteItem = async (item) => {
    if (!item?.id) {
      toast.error('Missing menu item id.');
      return;
    }
    await hardDeleteArchivedItem(item.id);
    refetchArchived();
    refetchActive();
  };

  const handleBulkSetPax = useCallback(
    async (categoryName, paxValue) => {
      if (bulkPaxUpdating) return false;
      const normalizedCategory = String(categoryName || '').trim();
      if (!normalizedCategory) {
        toast.error('Select a category first.');
        return false;
      }
      const parsedPax = Number(paxValue);
      if (!Number.isFinite(parsedPax) || parsedPax < 0) {
        toast.error('Pax must be 0 or greater.');
        return false;
      }
      const targets = (items || []).filter(
        (item) =>
          String(item?.category || '').trim() === normalizedCategory && item?.id
      );
      if (targets.length === 0) {
        toast.error(`No items found in ${normalizedCategory}.`);
        return false;
      }
      setBulkPaxUpdating(true);
      try {
        const results = await Promise.allSettled(
          targets.map((item) =>
            updateMenuItem(item.id, { estimatedPax: Math.floor(parsedPax) })
          )
        );
        const failures = results.filter(
          (result) => result.status === 'rejected'
        );
        if (failures.length > 0) {
          toast.error(
            `Updated ${targets.length - failures.length}/${
              targets.length
            } items in ${normalizedCategory}.`
          );
          return false;
        }
        toast.success(
          `Set pax to ${Math.floor(parsedPax)} for ${targets.length} item${
            targets.length === 1 ? '' : 's'
          } in ${normalizedCategory}.`
        );
        refetchActive?.();
        return true;
      } catch (error) {
        toast.error(
          error?.message || `Failed to update ${normalizedCategory} items.`
        );
        return false;
      } finally {
        setBulkPaxUpdating(false);
      }
    },
    [bulkPaxUpdating, items, refetchActive, updateMenuItem]
  );

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <AddItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        newItem={newItem}
        setNewItem={setNewItem}
        onAdd={handleAddItem}
        loading={adding}
        categories={categories}
        onAddCategory={() => setCategoryDialogOpen(true)}
      />
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1"
        onClick={() => setComboDialogOpen(true)}
      >
        <PlusCircle className="h-4 w-4" />
        Add Combo Meal
      </Button>
    </div>
  );

  const packageActions = canManagePackages ? (
    <Button onClick={handleCreatePackage}>
      <Package className="h-4 w-4 mr-2" />
      Create Package
    </Button>
  ) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="menu">Menu Management</TabsTrigger>
          <TabsTrigger value="packages">Catering Packages</TabsTrigger>
        </TabsList>

        <TabsContent value="menu">
          <FeaturePanelCard
            title="Menu Management"
            titleStyle="accent"
            titleIcon={MenuIcon}
            headerActions={actionButtons}
            contentClassName="space-y-6"
          >
            <CategoryTabs
              items={itemsWithImages}
              categories={categories}
              categoryRows={categoryRows}
              onEdit={(it) =>
                setEditingItem({
                  ...stripUnsupportedFields(it),
                  imageFile: null,
                })
              }
              onArchive={handleArchiveItem}
              onCategoryUpdated={() => {
                refetchCategories();
                refetchActive?.();
                refetchArchived?.();
              }}
              archivedItems={archivedItemsWithImages}
              archivedLoading={archivedLoading}
              onRestore={handleRestoreItem}
              onHardDelete={handleHardDeleteItem}
              onBulkSetPax={handleBulkSetPax}
            />
          </FeaturePanelCard>
        </TabsContent>

        <TabsContent value="packages">
          <FeaturePanelCard
            title="Catering Packages"
            titleStyle="accent"
            titleIcon={Package}
            description="Build bundles that managers can select for catering events."
            headerActions={packageActions}
            contentClassName="space-y-6"
          >
            {canManagePackages ? (
              <PackageManagementPanel
                packages={packages}
                isLoading={isLoadingPackages}
                error={packagesError}
                searchTerm={packageSearchTerm}
                onSearchChange={setPackageSearchTerm}
                statusFilter={packageStatus}
                onStatusChange={handlePackageStatusChange}
                onRetry={() => fetchPackages(packageStatus)}
                onCreate={handleCreatePackage}
                onEdit={handleEditPackage}
                onToggleActive={handleTogglePackageActive}
                canManage={canManagePackages}
                showCreateButton={false}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-muted-foreground/40 p-8 text-center text-sm text-muted-foreground">
                You do not have access to manage catering packages.
              </div>
            )}
          </FeaturePanelCard>
        </TabsContent>
      </Tabs>

      <EditItemDialog
        item={editingItem}
        setItem={setEditingItem}
        categories={categories}
        onSave={handleEditItem}
        onRemoveImage={async (id) => {
          const targetId = id || editingItem?.id;
          if (!targetId) return;
          const ok = await deleteItemImage(targetId);
          if (ok) {
            setEditingItem((prev) =>
              prev
                ? { ...prev, image: null, imageUrl: null, imageFile: null }
                : prev
            );
            refetchActive?.();
            refetchArchived?.();
          }
        }}
        onClose={() => setEditingItem(null)}
      />

      <AddCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onConfirm={(catName) => {
          setNewItem((prev) => ({ ...prev, category: catName }));
          setCategoryDialogOpen(false);
          // Refresh categories list to include the newly added category
          refetchCategories();
          // Keep AddItemDialog open if it was already open
          if (!dialogOpen) {
            setDialogOpen(true);
          }
        }}
      />

      <AddComboMealDialog
        open={comboDialogOpen}
        onOpenChange={setComboDialogOpen}
        items={items}
        onCreate={(payload) => {
          createMenuItemOptimistic(payload).catch((e) => {
            toast.error(e?.message || 'Failed to create combo meal');
          });
        }}
      />

      <PackageFormModal
        open={showPackageModal}
        onOpenChange={handlePackageModalChange}
        onSubmit={handleSubmitPackage}
        menuItems={menuItems}
        initialData={editingPackage}
        isSubmitting={isSubmittingPackage}
      />
    </div>
  );
};

export default MenuManagement;
