// src/components/menu/AddComboMealDialog.jsx
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
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { AlertCircle, Check, ChevronsUpDown, Layers, Tag } from 'lucide-react';

const AddComboMealDialog = ({ open, onOpenChange, items = [], onCreate }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cat, setCat] = useState('Combo Meals');
  const [sel1, setSel1] = useState('');
  const [sel2, setSel2] = useState('');
  const [sel3, setSel3] = useState('');
  const [item1Open, setItem1Open] = useState(false);
  const [item2Open, setItem2Open] = useState(false);
  const [item3Open, setItem3Open] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setPrice('');
      setCat('Combo Meals');
      setSel1('');
      setSel2('');
      setSel3('');
      setItem1Open(false);
      setItem2Open(false);
      setItem3Open(false);
      setSubmitted(false);
      setCreating(false);
      return;
    }

    setSubmitted(false);
    setCreating(false);
    setItem1Open(false);
    setItem2Open(false);
    setItem3Open(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [open]);

  const options = useMemo(() => {
    const isComboMeal = (item) => {
      if (!item) return false;
      const category = String(
        item.category || item.categoryName || item.category_label || ''
      ).toLowerCase();
      if (category.includes('combo')) return true;
      const type = String(
        item.type || item.itemType || item.kind || ''
      ).toLowerCase();
      if (type.includes('combo')) return true;
      if (
        item.isCombo ||
        item.is_combo ||
        item.is_combo_meal ||
        item.isComboMeal ||
        item.combo
      ) {
        return true;
      }
      const ingredients =
        item.ingredients || item.ingredientIds || item.ingredient_ids;
      return Array.isArray(ingredients) && ingredients.length > 0;
    };

    return (items || [])
      .filter((item) => !isComboMeal(item))
      .map((item) => ({
        id: item.id,
        label: item.name || 'Unnamed item',
        category: item.category || item.categoryName || '',
      }))
      .filter((option) => option.id !== undefined && option.id !== null);
  }, [items]);

  const summary = useMemo(() => {
    const labels = [sel1, sel2, sel3]
      .map((id) => options.find((o) => o.id === id)?.label)
      .filter(Boolean);
    return labels.join(' + ');
  }, [sel1, sel2, sel3, options]);

  const handlePriceChange = (event) => {
    const value = event.target.value;
    if (!/^\d*\.?\d*$/.test(value)) return;
    setPrice(value);
  };

  const blockExponentInput = (event) => {
    if (
      event.key === 'e' ||
      event.key === 'E' ||
      event.key === '-' ||
      event.key === '+'
    ) {
      event.preventDefault();
    }
  };

  const chosenIds = useMemo(
    () => [sel1, sel2, sel3].filter(Boolean),
    [sel1, sel2, sel3]
  );
  const selectionError = submitted && chosenIds.length === 0;
  const trimmedPrice = price.trim();
  const parsedPrice = trimmedPrice === '' ? Number.NaN : Number(trimmedPrice);
  const priceError =
    submitted &&
    (trimmedPrice === '' || !Number.isFinite(parsedPrice) || parsedPrice < 0);

  const handleCreate = async () => {
    if (creating) return;
    setSubmitted(true);
    if (chosenIds.length === 0) return;
    if (
      trimmedPrice === '' ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice < 0
    ) {
      return;
    }
    const payload = {
      name: name.trim() || `Combo: ${summary}`,
      description: summary ? `Includes ${summary}` : 'Combo meal',
      price: parsedPrice,
      category: cat || 'Combo Meals',
      available: true,
      ingredients: chosenIds,
      preparationTime: 0,
    };
    setCreating(true);
    try {
      await onCreate?.(payload);
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Add Combo Meal
          </DialogTitle>
          <DialogDescription>
            Build a combo by selecting up to three menu items. At least one item
            is required.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
          className="space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Combo Details</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="combo-name"
                  className="flex items-center gap-2 h-5"
                >
                  Name
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Input
                  id="combo-name"
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    summary ? `Combo: ${summary}` : 'e.g., Lunch Set'
                  }
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to auto-generate the name from selected items.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="combo-price" className="flex items-center h-5">
                  Price
                </Label>
                <Input
                  id="combo-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={price}
                  onChange={handlePriceChange}
                  onKeyDown={blockExponentInput}
                  placeholder="0.00"
                  disabled={creating}
                />
                {priceError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Price is required and cannot be negative.</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Set the combo price in PHP (₱).
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="combo-category" className="flex items-center h-5">
                Category
              </Label>
              <Input
                id="combo-category"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                placeholder="Combo Meals"
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground">
                Default is “Combo Meals” — change if you want a custom tab.
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span>Included Items</span>
              <span className="text-destructive">*</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center h-5">Item 1</Label>
                <Popover open={item1Open} onOpenChange={setItem1Open}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={item1Open}
                      className={cn(
                        'w-full justify-between text-sm font-normal',
                        selectionError && !sel1 && 'border-destructive'
                      )}
                      disabled={creating}
                    >
                      <span className="truncate">
                        {options.find((o) => o.id === sel1)?.label ||
                          'Select a menu item'}
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
                          heading={`Available items (${options.length})`}
                        >
                          {options.map((option) => {
                            const selected = option.id === sel1;
                            return (
                              <CommandItem
                                key={option.id}
                                value={[option.label, option.category]
                                  .filter(Boolean)
                                  .join(' ')}
                                onSelect={() => {
                                  setSel1(option.id);
                                  setItem1Open(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="truncate">{option.label}</span>
                                {option.category ? (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {option.category}
                                  </span>
                                ) : null}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 h-5">
                  Item 2
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Popover open={item2Open} onOpenChange={setItem2Open}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={item2Open}
                      className={cn(
                        'w-full justify-between text-sm font-normal',
                        selectionError && !sel2 && 'border-destructive'
                      )}
                      disabled={creating}
                    >
                      <span className="truncate">
                        {options.find((o) => o.id === sel2)?.label ||
                          'Select a menu item'}
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
                          heading={`Available items (${options.length})`}
                        >
                          {options.map((option) => {
                            const selected = option.id === sel2;
                            return (
                              <CommandItem
                                key={option.id}
                                value={[option.label, option.category]
                                  .filter(Boolean)
                                  .join(' ')}
                                onSelect={() => {
                                  setSel2(option.id);
                                  setItem2Open(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="truncate">{option.label}</span>
                                {option.category ? (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {option.category}
                                  </span>
                                ) : null}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-2 h-5">
                  Item 3
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Popover open={item3Open} onOpenChange={setItem3Open}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={item3Open}
                      className={cn(
                        'w-full justify-between text-sm font-normal',
                        selectionError && !sel3 && 'border-destructive'
                      )}
                      disabled={creating}
                    >
                      <span className="truncate">
                        {options.find((o) => o.id === sel3)?.label ||
                          'Select a menu item'}
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
                          heading={`Available items (${options.length})`}
                        >
                          {options.map((option) => {
                            const selected = option.id === sel3;
                            return (
                              <CommandItem
                                key={option.id}
                                value={[option.label, option.category]
                                  .filter(Boolean)
                                  .join(' ')}
                                onSelect={() => {
                                  setSel3(option.id);
                                  setItem3Open(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selected ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="truncate">{option.label}</span>
                                {option.category ? (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {option.category}
                                  </span>
                                ) : null}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {selectionError ? (
              <div className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span>Please select at least one menu item.</span>
              </div>
            ) : summary ? (
              <p className="text-xs text-muted-foreground">
                Preview:{' '}
                <span className="font-medium text-foreground">{summary}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select items to see a preview summary.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Combo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddComboMealDialog;
