// src/pages/MenuManagement.jsx
import React, { useEffect, useMemo, useState } from 'react';
import useMenuManagement, {
  useMenuCategories,
} from '@/hooks/useMenuManagement';
import AddItemDialog from '@/components/menu/AddItemDialog';
import AddCategoryDialog from '@/components/menu/AddCategoryDialog';
import AddComboMealDialog from '@/components/menu/AddComboMealDialog';
import EditItemDialog from '@/components/menu/EditItemDialog';
import CategoryTabs from '@/components/menu/CategoryTabs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PlusCircle, Menu as MenuIcon } from 'lucide-react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';

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
  const {
    items,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem: archiveMenuItem,
    uploadItemImage,
    deleteItemImage,
    refetch: refetchActive,
    setLocalImage,
  } = useMenuManagement({});
  const {
    items: archivedItems,
    loading: archivedLoading,
    restoreMenuItem: restoreArchivedItem,
    refetch: refetchArchived,
  } = useMenuManagement({ archived: true });
  const { categories: categoryRows, refetch: refetchCategories } =
    useMenuCategories();
  const categories = useMemo(
    () => (categoryRows || []).map((c) => c.name),
    [categoryRows]
  );
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
  });
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [comboDialogOpen, setComboDialogOpen] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleAddItem = async () => {
    if (adding) return;
    try {
      if (!newItem.name || !newItem.category) {
        toast.error('Please fill in all required fields');
        return;
      }
      setAdding(true);
      const payload = {
        name: newItem.name,
        description: newItem.description,
        price: Number(newItem.price) || 0,
        category: newItem.category,
        available: Boolean(newItem.available),
        ingredients: [],
        preparationTime: 0,
      };
      const created = await createMenuItem(payload);
      const previewUrl = newItem.imageUrl;
      if (newItem.imageFile && created?.id) {
        if (previewUrl) {
          setLocalImage(created.id, previewUrl);
        }
        setUploadQueue((prev) => [
          ...prev,
          { id: created.id, file: newItem.imageFile },
        ]);
      }
      setNewItem({
        name: '',
        description: '',
        price: '',
        category: '',
        available: true,
        imageUrl: '',
        imageFile: null,
      });
      setDialogOpen(false);
    } catch (e) {
      toast.error(e?.message || 'Failed to add menu item');
    } finally {
      setAdding(false);
    }
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

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1"
        onClick={() => setComboDialogOpen(true)}
      >
        <PlusCircle className="h-4 w-4" />
        Add Combo Meal
      </Button>
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
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
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
          onEdit={(it) =>
            setEditingItem({
              ...stripUnsupportedFields(it),
              imageFile: null,
            })
          }
          onArchive={handleArchiveItem}
          archivedItems={archivedItemsWithImages}
          archivedLoading={archivedLoading}
          onRestore={handleRestoreItem}
        />
      </FeaturePanelCard>

      <EditItemDialog
        item={editingItem}
        setItem={setEditingItem}
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
        onCreate={async (payload) => {
          try {
            await createMenuItem(payload);
          } catch (e) {
            toast.error(e?.message || 'Failed to create combo meal');
          }
        }}
      />
    </div>
  );
};

export default MenuManagement;
