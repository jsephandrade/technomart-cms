import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Tag,
  TrendingDown,
  Ruler,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const NON_INTEGER_KEYS = new Set(['e', 'E', '+', '-', '.']);

const handleNonIntegerKeyDown = (event) => {
  if (NON_INTEGER_KEYS.has(event.key)) {
    event.preventDefault();
  }
};

const handleNonIntegerPaste = (event) => {
  const text = event.clipboardData.getData('text');
  if (/[^\d]/.test(text)) {
    event.preventDefault();
  }
};

const toDateInputValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return '';
  }
};

const EditItemModal = ({ open, onOpenChange, item, onEditItem }) => {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm();

  const nameInputRef = useRef(null);

  const categories = [
    'Grains',
    'Meat',
    'Vegetables',
    'Dairy',
    'Condiments',
    'Baking',
    'Fruits',
    'Seafood',
    'Beverages',
    'Spices',
    'Oils',
    'Frozen',
    'Canned Goods',
    'Dry Goods',
    'Snacks',
    'Packaging',
    'Cleaning Supplies',
    'Ingredients',
  ];

  const units = [
    'kg',
    'g',
    'lbs',
    'oz',
    'liters',
    'ml',
    'pieces',
    'boxes',
    'cans',
    'bottles',
    'bags',
    'cups',
  ];

  useEffect(() => {
    if (item) {
      reset(item);
      setValue('category', item.category);
      setValue('unit', item.unit);
      setValue('expiryDate', toDateInputValue(item.expiryDate));
    }
  }, [item, reset, setValue]);

  // Auto-focus on name input when modal opens
  useEffect(() => {
    if (open && nameInputRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const onSubmit = (data) => {
    if (!item) return;

    const updatedItem = {
      ...data,
      id: item.id,
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    onEditItem(updatedItem);
    onOpenChange(false);
    toast.success(`${data.name} has been updated`);
  };

  const handleCancel = () => {
    reset();
    onOpenChange(false);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto scrollbar-hide">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Edit Inventory Item
          </DialogTitle>
          <DialogDescription>
            Update the details for {item.name}. Required fields are marked with
            an asterisk (*).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span>Basic Information</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1 h-5">
                  Item Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  ref={nameInputRef}
                  {...register('name', { required: 'Item name is required' })}
                  placeholder="e.g., Rice"
                  className={cn(errors.name && 'border-destructive')}
                />
                {errors.name && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name.message}</span>
                  </div>
                )}
                {!errors.name && (
                  <p className="text-xs text-muted-foreground">
                    Enter a descriptive name for the item
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="flex items-center h-5">
                  Category
                </Label>
                <Controller
                  name="category"
                  control={control}
                  defaultValue={item.category}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Helps organize your inventory
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Stock Management Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>Stock Management</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="currentStock"
                  className="flex items-center gap-1 h-5"
                >
                  Current Stock <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="currentStock"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onKeyDown={handleNonIntegerKeyDown}
                  onPaste={handleNonIntegerPaste}
                  {...register('currentStock', {
                    required: 'Current stock is required',
                    min: { value: 0, message: 'Stock cannot be negative' },
                    validate: (value) =>
                      /^\d+$/.test(String(value ?? '')) || 'Whole numbers only',
                  })}
                  placeholder="0"
                  className={cn(errors.currentStock && 'border-destructive')}
                />
                {errors.currentStock && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.currentStock.message}</span>
                  </div>
                )}
                {!errors.currentStock && (
                  <p className="text-xs text-muted-foreground">
                    Current quantity in stock
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="minThreshold"
                  className="flex items-center gap-1 h-5"
                >
                  Min Threshold <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="minThreshold"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onKeyDown={handleNonIntegerKeyDown}
                  onPaste={handleNonIntegerPaste}
                  {...register('minThreshold', {
                    required: 'Minimum threshold is required',
                    min: {
                      value: 0,
                      message: 'Threshold cannot be negative',
                    },
                    validate: (value) =>
                      /^\d+$/.test(String(value ?? '')) || 'Whole numbers only',
                  })}
                  placeholder="0"
                  className={cn(errors.minThreshold && 'border-destructive')}
                />
                {errors.minThreshold && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.minThreshold.message}</span>
                  </div>
                )}
                {!errors.minThreshold && (
                  <p className="text-xs text-muted-foreground">
                    Alert when stock falls below this
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Additional Details Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Ruler className="h-4 w-4" />
              <span>Additional Details</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit" className="flex items-center h-5">
                  Unit
                </Label>
                <Controller
                  name="unit"
                  control={control}
                  defaultValue={item.unit}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Unit of measurement
                </p>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="supplier"
                  className="flex items-center gap-2 h-5"
                >
                  Supplier
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="supplier"
                    {...register('supplier')}
                    placeholder="e.g., Global Foods"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your supplier's name
                </p>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="expiryDate"
                  className="flex items-center gap-2 h-5"
                >
                  Expiry Date
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Input
                  id="expiryDate"
                  type="date"
                  {...register('expiryDate')}
                />
                <p className="text-xs text-muted-foreground">
                  Track perishable items
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2">
              <Package className="h-4 w-4" />
              Update Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditItemModal;
