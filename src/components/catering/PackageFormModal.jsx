import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Check,
  ChevronsUpDown,
  Package,
  Plus,
  Trash2,
  Utensils,
} from 'lucide-react';
import { toast } from 'sonner';

const buildEmptyItem = () => ({
  key: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  menuItemId: '',
  name: '',
  quantityPerPax: '1',
  notes: '',
});

const blockInvalidNumberKey = (event) => {
  if (
    event.key === 'e' ||
    event.key === 'E' ||
    event.key === '-' ||
    event.key === '+'
  ) {
    event.preventDefault();
  }
};

const normalizeNumericInput = (value, allowDecimal) => {
  if (value === '') return value;
  if (String(value).trim().startsWith('-')) return null;
  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;
  if (!pattern.test(value)) return null;
  return value;
};

const PackageFormModal = ({
  open,
  onOpenChange,
  onSubmit,
  menuItems = [],
  initialData = null,
  isSubmitting = false,
}) => {
  const isEdit = Boolean(initialData?.id);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pricePerPax: '',
    minPax: '1',
    maxPax: '',
    items: [buildEmptyItem()],
  });
  const [openMenuKey, setOpenMenuKey] = useState(null);

  const menuItemsById = useMemo(() => {
    const map = new Map();
    (menuItems || []).forEach((item) => {
      if (!item?.id) return;
      map.set(String(item.id), item);
    });
    return map;
  }, [menuItems]);
  const menuItemOptions = useMemo(
    () =>
      (menuItems || [])
        .filter((item) => item?.id)
        .map((item) => ({
          id: String(item.id),
          label: item.name || 'Unnamed item',
          category: item.category || item.categoryName || '',
        })),
    [menuItems]
  );

  useEffect(() => {
    if (!open) return;
    if (!initialData) {
      setFormData({
        name: '',
        description: '',
        pricePerPax: '',
        minPax: '1',
        maxPax: '',
        items: [buildEmptyItem()],
      });
      return;
    }

    const items = Array.isArray(initialData.items) ? initialData.items : [];
    const mappedItems =
      items.length > 0
        ? items.map((item, index) => ({
            key: item.id || `item-${index}`,
            menuItemId:
              String(item.menuItemId || item.menuItem?.id || '') || '',
            name: item.name || item.menuItem?.name || '',
            quantityPerPax: String(item.quantityPerPax ?? 1),
            notes: item.notes || '',
          }))
        : [buildEmptyItem()];

    setFormData({
      name: initialData.name || '',
      description: initialData.description || '',
      pricePerPax: String(initialData.pricePerPax ?? ''),
      minPax: String(initialData.minPax ?? 1),
      maxPax:
        initialData.maxPax === null || initialData.maxPax === undefined
          ? ''
          : String(initialData.maxPax),
      items: mappedItems,
    });
    setOpenMenuKey(null);
  }, [open, initialData]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNonNegativeFieldChange = (field, value, allowDecimal = true) => {
    const nextValue = normalizeNumericInput(value, allowDecimal);
    if (nextValue === null) return;
    handleFieldChange(field, nextValue);
  };

  const handleItemChange = (key, field, value) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.key !== key) return item;
        const updated = { ...item, [field]: value };
        if (field === 'menuItemId') {
          const matched = menuItemsById.get(String(value || ''));
          if (matched && !updated.name) {
            updated.name = matched.name || '';
          }
        }
        return updated;
      }),
    }));
  };

  const handleNonNegativeItemChange = (
    key,
    field,
    value,
    allowDecimal = true
  ) => {
    const nextValue = normalizeNumericInput(value, allowDecimal);
    if (nextValue === null) return;
    handleItemChange(key, field, nextValue);
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, buildEmptyItem()],
    }));
  };

  const handleRemoveItem = (key) => {
    setFormData((prev) => {
      const nextItems = prev.items.filter((item) => item.key !== key);
      return {
        ...prev,
        items: nextItems.length ? nextItems : [buildEmptyItem()],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      toast.error('Package name is required.');
      return;
    }
    const price = Number(formData.pricePerPax);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Price per pax must be greater than 0.');
      return;
    }
    const minPax = Number(formData.minPax);
    if (!Number.isFinite(minPax) || minPax < 1) {
      toast.error('Minimum pax must be at least 1.');
      return;
    }
    const maxPax = formData.maxPax !== '' ? Number(formData.maxPax) : null;
    if (maxPax !== null && (!Number.isFinite(maxPax) || maxPax < minPax)) {
      toast.error('Max pax must be greater than or equal to min pax.');
      return;
    }

    const normalizedItems = formData.items
      .map((item) => {
        const menuItemId = item.menuItemId || null;
        const itemName = item.name.trim();
        const quantityPerPax = Number(item.quantityPerPax);
        if (!menuItemId && !itemName) {
          return null;
        }
        if (!Number.isFinite(quantityPerPax) || quantityPerPax <= 0) {
          return { error: 'Item quantity per pax must be greater than 0.' };
        }
        return {
          menuItemId,
          name: itemName,
          quantityPerPax,
          notes: item.notes.trim(),
        };
      })
      .filter(Boolean);

    if (!normalizedItems.length) {
      toast.error('Add at least one package item.');
      return;
    }

    const invalidItem = normalizedItems.find((item) => item?.error);
    if (invalidItem) {
      toast.error(invalidItem.error);
      return;
    }

    await onSubmit?.({
      name,
      description: formData.description.trim(),
      pricePerPax: price,
      minPax,
      maxPax,
      items: normalizedItems,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-hide max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isEdit ? 'Edit Package' : 'Create Package'}
          </DialogTitle>
          <DialogDescription>
            Define a catering package with per-pax pricing and included items.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" />
              <span>Package Details</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="package-name">Package Name</Label>
                <Input
                  id="package-name"
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  placeholder="Corporate Bento Set"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-price">Price per Pax</Label>
                <Input
                  id="package-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.pricePerPax}
                  onKeyDown={blockInvalidNumberKey}
                  onChange={(e) =>
                    handleNonNegativeFieldChange('pricePerPax', e.target.value)
                  }
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="package-min">Minimum Pax</Label>
                <Input
                  id="package-min"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={formData.minPax}
                  onKeyDown={blockInvalidNumberKey}
                  onChange={(e) =>
                    handleNonNegativeFieldChange(
                      'minPax',
                      e.target.value,
                      false
                    )
                  }
                  placeholder="1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="package-max"
                  className="flex items-center gap-2"
                >
                  Maximum Pax
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Input
                  id="package-max"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={formData.maxPax}
                  onKeyDown={blockInvalidNumberKey}
                  onChange={(e) =>
                    handleNonNegativeFieldChange(
                      'maxPax',
                      e.target.value,
                      false
                    )
                  }
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="package-desc" className="flex items-center gap-2">
                Description
                <Badge variant="secondary" className="text-xs">
                  Optional
                </Badge>
              </Label>
              <Textarea
                id="package-desc"
                value={formData.description}
                onChange={(e) =>
                  handleFieldChange('description', e.target.value)
                }
                placeholder="Short description for managers"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Utensils className="h-4 w-4" />
                <span>Package Items</span>
              </div>
              <Button type="button" variant="outline" onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {formData.items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Menu Item</Label>
                      <Popover
                        open={openMenuKey === item.key}
                        onOpenChange={(nextOpen) =>
                          setOpenMenuKey(nextOpen ? item.key : null)
                        }
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={openMenuKey === item.key}
                            className="w-full justify-between text-sm font-normal"
                          >
                            <span className="truncate">
                              {(() => {
                                const selected = menuItemsById.get(
                                  String(item.menuItemId || '')
                                );
                                if (selected?.name) return selected.name;
                                if (item.menuItemId) {
                                  return item.name || 'Selected item';
                                }
                                return 'Manual entry';
                              })()}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[--radix-popover-trigger-width] p-0"
                          align="start"
                        >
                          <Command>
                            <CommandInput placeholder="Search menu items..." />
                            <CommandList className="max-h-64 overflow-y-auto">
                              <CommandEmpty>No menu items found.</CommandEmpty>
                              <CommandGroup
                                heading={`Menu items (${menuItemOptions.length})`}
                              >
                                <CommandItem
                                  value="manual entry"
                                  onSelect={() => {
                                    handleItemChange(
                                      item.key,
                                      'menuItemId',
                                      ''
                                    );
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      !item.menuItemId
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                    )}
                                  />
                                  Manual entry
                                </CommandItem>
                                {menuItemOptions.map((option) => (
                                  <CommandItem
                                    key={option.id}
                                    value={[option.label, option.category]
                                      .filter(Boolean)
                                      .join(' ')}
                                    onSelect={() => {
                                      handleItemChange(
                                        item.key,
                                        'menuItemId',
                                        option.id
                                      );
                                      setOpenMenuKey(null);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        String(item.menuItemId) === option.id
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      )}
                                    />
                                    <span className="truncate">
                                      {option.label}
                                    </span>
                                    {option.category ? (
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        {option.category}
                                      </span>
                                    ) : null}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Item Name</Label>
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          handleItemChange(item.key, 'name', e.target.value)
                        }
                        placeholder="Included item"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Qty per Pax</Label>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        inputMode="decimal"
                        value={item.quantityPerPax}
                        onKeyDown={blockInvalidNumberKey}
                        onChange={(e) =>
                          handleNonNegativeItemChange(
                            item.key,
                            'quantityPerPax',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="flex items-center gap-2">
                        Notes
                        <Badge variant="secondary" className="text-xs">
                          Optional
                        </Badge>
                      </Label>
                      <Input
                        value={item.notes}
                        onChange={(e) =>
                          handleItemChange(item.key, 'notes', e.target.value)
                        }
                        placeholder="Optional notes"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveItem(item.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : isEdit
                  ? 'Update Package'
                  : 'Create Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PackageFormModal;
