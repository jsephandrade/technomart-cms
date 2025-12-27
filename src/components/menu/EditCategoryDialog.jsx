// src/components/menu/EditCategoryDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { AlertCircle, ArrowUpDown, Tag, Trash2 } from 'lucide-react';

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
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    setName(initial.name);
    setDescription(initial.description);
    setSortOrder(initial.sortOrder);
    setSaving(false);
    setSubmitted(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [initial]);

  if (!category) return null;

  const handleSave = async () => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      setSubmitted(true);
      return;
    }

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

  const nameError = submitted && !(name || '').trim();

  return (
    <Dialog open={!!category} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Edit Category
          </DialogTitle>
          <DialogDescription>
            Update the category name, description, and display order. Required
            fields are marked with an asterisk (*).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
          className="space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Category Details</span>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-category-name"
                className="flex items-center gap-1 h-5"
              >
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-category-name"
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Combo Meals"
                className={cn(nameError && 'border-destructive')}
                disabled={saving}
              />
              {nameError ? (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  <span>Category name is required</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This name appears as a tab in Menu Management.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-category-description"
                className="flex items-center gap-2 h-5"
              >
                Description
                <Badge variant="secondary" className="text-xs">
                  Optional
                </Badge>
              </Label>
              <Textarea
                id="edit-category-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description (shown in admin tools)"
                className="min-h-[90px]"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Use this to help staff understand what belongs in this category.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowUpDown className="h-4 w-4" />
              <span>Display Order</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>

            <div className="space-y-1">
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-9 w-9 sm:mr-auto"
              aria-label="Delete category"
              title="Delete category"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCategoryDialog;
