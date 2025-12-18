// src/components/menu/EditCategoryDialog.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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

const normalizeSortOrderSelection = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return '';
  return String(parsed);
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
      sortOrder: normalizeSortOrderSelection(sortOrderRaw),
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
    };

    const sortSelection = (sortOrder || '').trim();
    if (sortSelection) {
      payload.sortOrder = parseInt(sortSelection, 10);
    }

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
            <Label className="text-right">Sort Order</Label>
            <div className="col-span-3 space-y-1">
              <ToggleGroup
                type="single"
                value={sortOrder}
                onValueChange={setSortOrder}
                variant="outline"
                size="sm"
                className="w-fit justify-start"
                aria-label="Category sort order"
                disabled={saving}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <ToggleGroupItem
                    key={n}
                    value={String(n)}
                    aria-label={`Sort order ${n}`}
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                  >
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                Select 1-5, or leave empty to keep the current order.
              </p>
            </div>
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
