// src/components/menu/AddItemDialog.jsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Loader2, PlusCircle } from 'lucide-react';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> Add Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Menu Item</DialogTitle>
          <DialogDescription>
            Add a new item to your canteen menu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Input
              id="description"
              value={newItem.description}
              onChange={(e) =>
                setNewItem({ ...newItem, description: e.target.value })
              }
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="price" className="text-right">
              Price
            </Label>
            <Input
              id="price"
              type="number"
              value={newItem.price}
              onChange={(e) =>
                setNewItem({
                  ...newItem,
                  price: parseFloat(e.target.value) || 0,
                })
              }
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              Category
            </Label>
            <div className="col-span-3 flex gap-2">
              <Select
                value={newItem.category}
                onValueChange={(value) =>
                  setNewItem({ ...newItem, category: value })
                }
              >
                <SelectTrigger className="flex-1">
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
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="available" className="text-right">
              Available
            </Label>
            <Switch
              id="available"
              checked={newItem.available}
              onCheckedChange={(checked) =>
                setNewItem({ ...newItem, available: checked })
              }
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="image-file" className="text-right">
              Upload Image
            </Label>
            <div className="col-span-3 space-y-2">
              <Input
                id="image-file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full cursor-pointer"
              />
              {(newItem.imageUrl || newItem.imageFile) && (
                <div className="rounded-lg border bg-muted p-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    Preview
                  </div>
                  <img
                    src={newItem.imageUrl}
                    alt={newItem.name || 'Preview'}
                    className="h-32 w-full rounded-md object-cover"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveImage}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={onAdd} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Adding...' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddItemDialog;
