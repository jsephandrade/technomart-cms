// src/components/menu/EditItemDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  CircleDollarSign,
  Image as ImageIcon,
  SquarePen,
  Tag,
  UploadCloud,
} from 'lucide-react';

const EditItemDialog = ({
  item,
  setItem,
  onSave,
  onClose,
  onRemoveImage,
  categories = [],
}) => {
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef(null);

  const isArchived = useMemo(
    () => Boolean(item?.archived || item?.archivedAt || item?.archived_at),
    [item]
  );

  const nameValue = useMemo(() => String(item?.name || '').trim(), [item]);
  const categoryValue = useMemo(
    () => String(item?.category || '').trim(),
    [item]
  );
  const categoryOptions = useMemo(() => {
    const unique = new Set();
    (Array.isArray(categories) ? categories : []).forEach((entry) => {
      const name =
        typeof entry === 'string'
          ? entry.trim()
          : String(entry?.name || entry?.label || entry?.title || '').trim();
      if (name) unique.add(name);
    });
    if (categoryValue) unique.add(categoryValue);
    return Array.from(unique);
  }, [categories, categoryValue]);
  const nameError = submitted && !nameValue;
  const categoryError = submitted && !categoryValue;
  const itemId = item?.id;

  useEffect(() => {
    if (!itemId) return;
    setSubmitted(false);
    setSaving(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [itemId]);

  if (!item) return null;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (item.imageUrl && item.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.imageUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setItem({ ...item, imageFile: file, imageUrl: previewUrl });
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    const cleaned = value.replace(/[eE]/g, '');
    setItem({ ...item, price: cleaned === '' ? '' : cleaned });
  };

  const blockExponentInput = (event) => {
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  };

  const clearImage = () => {
    if (item.imageUrl && item.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.imageUrl);
    }
    setItem({ ...item, imageFile: null, imageUrl: '', image: null });
    if (onRemoveImage && item?.id) {
      onRemoveImage(item.id);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setSubmitted(true);
    if (!nameValue || !categoryValue) return;

    setSaving(true);
    try {
      await onSave?.(item);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="scrollbar-hide max-h-[90vh] overflow-y-auto sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquarePen className="h-5 w-5" />
            Edit Menu Item
            {isArchived ? (
              <Badge
                variant="outline"
                className="ml-1 bg-slate-100 text-slate-600 border-transparent"
              >
                Archived
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Update the menu item details. Required fields are marked with an
            asterisk (*).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Basic Information</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="edit-name"
                  className="flex items-center gap-1 h-5"
                >
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  ref={nameInputRef}
                  value={item.name}
                  onChange={(e) => setItem({ ...item, name: e.target.value })}
                  placeholder="e.g., Chicken Adobo"
                  className={cn(nameError && 'border-destructive')}
                  disabled={saving}
                />
                {nameError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Item name is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Shown on customer-facing screens and the POS.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="edit-category"
                  className="flex items-center gap-1 h-5"
                >
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={categoryValue || undefined}
                  onValueChange={(value) =>
                    setItem({ ...item, category: value })
                  }
                  disabled={saving}
                >
                  <SelectTrigger
                    id="edit-category"
                    className={cn(categoryError && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.length > 0 ? (
                      categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={categoryValue || 'Uncategorized'}>
                        {categoryValue || 'Uncategorized'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {categoryError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Category is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Controls where the item appears in category tabs.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-description"
                className="flex items-center gap-2 h-5"
              >
                Description
                <Badge variant="secondary" className="text-xs">
                  Optional
                </Badge>
              </Label>
              <Textarea
                id="edit-description"
                value={item.description || ''}
                onChange={(e) =>
                  setItem({ ...item, description: e.target.value })
                }
                placeholder="Short description shown to customers"
                className="min-h-[90px]"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Keep it concise — this may appear under the item name.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CircleDollarSign className="h-4 w-4" />
              <span>Pricing & Availability</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-price" className="flex items-center h-5">
                  Price
                </Label>
                <Input
                  id="edit-price"
                  type="number"
                  inputMode="decimal"
                  value={item.price ?? ''}
                  onChange={handlePriceChange}
                  onKeyDown={blockExponentInput}
                  placeholder="0.00"
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the price in PHP (₱).
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="edit-available"
                  className="flex items-center h-5"
                >
                  Availability
                </Label>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Available
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Turn off if sold out. Restore first if archived.
                    </p>
                  </div>
                  <Switch
                    id="edit-available"
                    checked={Boolean(item.available)}
                    onCheckedChange={(checked) =>
                      setItem({ ...item, available: checked })
                    }
                    disabled={saving || isArchived}
                  />
                </div>
                {isArchived ? (
                  <p className="text-xs text-muted-foreground">
                    This item is archived — restore it to change availability.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              <span>Image</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="rounded-lg border border-dashed bg-muted/40 p-3">
                <label
                  htmlFor="edit-image-file"
                  className={cn(
                    'flex items-center justify-between gap-3',
                    saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UploadCloud className="h-4 w-4" />
                    <span>Click to upload or drop an image</span>
                  </div>
                  <Input
                    id="edit-image-file"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={saving}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Use a clear photo — it will be shown in grid cards.
              </p>

              {(item.imageUrl || item.image || item.imageFile) && (
                <div className="rounded-lg border bg-muted p-2">
                  <div className="mb-1 text-xs text-muted-foreground">
                    Preview
                  </div>
                  <img
                    src={item.imageUrl || item.image}
                    alt={item.name || 'Preview'}
                    className="h-32 w-full rounded-md object-cover"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearImage}
                      disabled={saving}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
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

export default EditItemDialog;
