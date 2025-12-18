// src/components/menu/EditCategoryDialog.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import menuService from '@/api/services/menuService';
import { toast } from 'sonner';

const normalizeSortOrderInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.max(0, parsed));
};

const EditCategoryDialog = ({ category, onClose, onUpdated }) => {
  const initial = useMemo(() => {
    if (!category) {
      return { name: '', description: '', sortOrder: '' };
    }
    const sortOrderRaw =
      category.sortOrder ?? category.sort_order ?? category.sortOrderRaw ?? '';
    return {
      name: String(category.name || '').trim(),
      description: String(category.description || '').trim(),
      sortOrder: normalizeSortOrderInput(sortOrderRaw),
    };
  }, [category]);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description);
    setSortOrder(initial.sortOrder);
    setSaving(false);
  }, [initial]);

  if (!category) return null;

  const handleSave = async () => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    const payload = {
      name: trimmedName,
      description: (description || '').trim(),
      sortOrder: (() => {
        const parsed = parseInt(String(sortOrder), 10);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, parsed);
      })(),
    };

    setSaving(true);
    try {
      const response = await menuService.updateCategory(category.id, payload);
      toast.success(`Category "${trimmedName}" updated successfully`);
      onUpdated?.(response?.data || payload);
      onClose?.();
    } catch (error) {
      toast.error(error?.message || 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const blockExponentInput = (event) => {
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  };

  return (
    <Dialog open={!!category} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>
            Update the category name, description, and display order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-category-name" className="text-right">
              Name
            </Label>
            <Input
              id="edit-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Combo Meals"
              className="col-span-3"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label
              htmlFor="edit-category-description"
              className="pt-2 text-right"
            >
              Description
            </Label>
            <Textarea
              id="edit-category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description (shown in admin tools)"
              className="col-span-3"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-category-sort" className="text-right">
              Sort Order
            </Label>
            <Input
              id="edit-category-sort"
              type="number"
              inputMode="numeric"
              min={1}
              value={sortOrder}
              onChange={(e) => {
                const value = Math.max(1, Number(e.target.value));
                setSortOrder(normalizeSortOrderInput(value));
              }}
              onKeyDown={blockExponentInput}
              className="col-span-3"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCategoryDialog;
