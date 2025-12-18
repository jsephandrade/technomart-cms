// src/components/menu/AddItemDialog.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  Loader2,
  PlusCircle,
  Tag,
  UploadCloud,
  Utensils,
} from 'lucide-react';

const AddItemDialog = ({
  open,
  onOpenChange,
  newItem,
  setNewItem,
  onAdd,
  categories,
  onAddCategory,
  loading = false,
}) => {
  const [submitted, setSubmitted] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      return;
    }
    setSubmitted(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [open]);

  const nameValue = useMemo(
    () => String(newItem?.name || '').trim(),
    [newItem]
  );
  const categoryValue = useMemo(
    () => String(newItem?.category || '').trim(),
    [newItem]
  );
  const nameError = submitted && !nameValue;
  const categoryError = submitted && !categoryValue;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (newItem.imageUrl && newItem.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(newItem.imageUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setNewItem({ ...newItem, imageFile: file, imageUrl: previewUrl });
  };

  const handleRemoveImage = () => {
    if (newItem.imageUrl && newItem.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(newItem.imageUrl);
    }
    setNewItem({ ...newItem, imageFile: null, imageUrl: '' });
  };

  const handlePriceChange = (event) => {
    const value = event.target.value;
    const cleaned = value.replace(/[eE]/g, '');
    setNewItem({ ...newItem, price: cleaned === '' ? '' : cleaned });
  };

  const blockExponentInput = (event) => {
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (loading) return;
    setSubmitted(true);
    if (!nameValue || !categoryValue) return;
    onAdd?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5" />
            Add New Menu Item
          </DialogTitle>
          <DialogDescription>
            Add a new menu item to your canteen menu. Required fields are marked
            with an asterisk (*).
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
                <Label htmlFor="name" className="flex items-center gap-1 h-5">
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  ref={nameInputRef}
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem({ ...newItem, name: e.target.value })
                  }
                  placeholder="e.g., Chicken Adobo"
                  className={cn(nameError && 'border-destructive')}
                  disabled={loading}
                />
                {nameError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Item name is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Shown in the POS, customer display, and menu list.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="category"
                  className="flex items-center gap-1 h-5"
                >
                  Category <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={newItem.category}
                    onValueChange={(value) =>
                      setNewItem({ ...newItem, category: value })
                    }
                    disabled={loading}
                  >
                    <SelectTrigger
                      id="category"
                      className={cn(
                        'flex-1',
                        categoryError && 'border-destructive'
                      )}
                    >
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories && categories.length > 0 ? (
                        categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No categories available
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onAddCategory}
                    title="Add new category"
                    aria-label="Add new category"
                    disabled={loading}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
                {categoryError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Please select a category</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Used for the category tabs in Menu Management.
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CircleDollarSign className="h-4 w-4" />
              <span>Details & Pricing</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price" className="flex items-center h-5">
                  Price
                </Label>
                <Input
                  id="price"
                  type="number"
                  inputMode="decimal"
                  value={newItem.price ?? ''}
                  placeholder="0.00"
                  onChange={handlePriceChange}
                  onKeyDown={blockExponentInput}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the price in PHP (₱). Leave empty for 0.00.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="available" className="flex items-center h-5">
                  Availability
                </Label>
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Available
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Turn off if this item is temporarily sold out.
                    </p>
                  </div>
                  <Switch
                    id="available"
                    checked={newItem.available}
                    onCheckedChange={(checked) =>
                      setNewItem({ ...newItem, available: checked })
                    }
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="description"
                className="flex items-center gap-2 h-5"
              >
                Description
                <Badge variant="secondary" className="text-xs">
                  Optional
                </Badge>
              </Label>
              <Textarea
                id="description"
                value={newItem.description}
                onChange={(e) =>
                  setNewItem({ ...newItem, description: e.target.value })
                }
                placeholder="e.g., Slow-cooked chicken in soy sauce and vinegar"
                className="min-h-[90px]"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Keep it short — this may appear in customer-facing screens.
              </p>
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
                  htmlFor="image-file"
                  className={cn(
                    'flex items-center justify-between gap-3',
                    loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  )}
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UploadCloud className="h-4 w-4" />
                    <span>Click to upload or drop an image</span>
                  </div>
                  <Input
                    id="image-file"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Use a clear photo — it will be shown in grid cards.
              </p>

              {(newItem.imageUrl || newItem.image) && (
                <div className="rounded-lg border bg-muted p-2">
                  <div className="mb-1 text-xs text-muted-foreground">
                    Preview
                  </div>
                  <img
                    src={newItem.imageUrl || newItem.image}
                    alt={newItem.name || 'Preview'}
                    className="h-32 w-full rounded-md object-cover"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveImage}
                      disabled={loading}
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
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {loading ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddItemDialog;
