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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Layers, Tag } from 'lucide-react';

const AddComboMealDialog = ({ open, onOpenChange, items = [], onCreate }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cat, setCat] = useState('Combo Meals');
  const [sel1, setSel1] = useState('');
  const [sel2, setSel2] = useState('');
  const [sel3, setSel3] = useState('');
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
      setSubmitted(false);
      setCreating(false);
      return;
    }

    setSubmitted(false);
    setCreating(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [open]);

  const options = useMemo(
    () => (items || []).map((i) => ({ id: i.id, label: i.name })),
    [items]
  );

  const summary = useMemo(() => {
    const labels = [sel1, sel2, sel3]
      .map((id) => options.find((o) => o.id === id)?.label)
      .filter(Boolean);
    return labels.join(' + ');
  }, [sel1, sel2, sel3, options]);

  const handlePriceChange = (event) => {
    const value = event.target.value;
    const cleaned = value.replace(/[eE]/g, '');
    setPrice(cleaned === '' ? '' : cleaned);
  };

  const blockExponentInput = (event) => {
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  };

  const chosenIds = useMemo(
    () => [sel1, sel2, sel3].filter(Boolean),
    [sel1, sel2, sel3]
  );
  const selectionError = submitted && chosenIds.length === 0;

  const handleCreate = async () => {
    if (creating) return;
    setSubmitted(true);
    if (chosenIds.length === 0) return;
    const payload = {
      name: name.trim() || `Combo: ${summary}`,
      description: summary ? `Includes ${summary}` : 'Combo meal',
      price: Number(price) || 0,
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
                  value={price}
                  onChange={handlePriceChange}
                  onKeyDown={blockExponentInput}
                  placeholder="0.00"
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  Set the combo price in PHP (₱).
                </p>
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
                <Select
                  value={sel1}
                  onValueChange={setSel1}
                  disabled={creating}
                >
                  <SelectTrigger
                    className={cn(selectionError && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select a menu item" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 h-5">
                  Item 2
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Select
                  value={sel2}
                  onValueChange={setSel2}
                  disabled={creating}
                >
                  <SelectTrigger
                    className={cn(selectionError && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select a menu item" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-2 h-5">
                  Item 3
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Select
                  value={sel3}
                  onValueChange={setSel3}
                  disabled={creating}
                >
                  <SelectTrigger
                    className={cn(selectionError && 'border-destructive')}
                  >
                    <SelectValue placeholder="Select a menu item" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
