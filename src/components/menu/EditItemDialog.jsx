// src/components/menu/EditItemDialog.jsx
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
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

const EditItemDialog = ({ item, setItem, onSave, onClose }) => {
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

  const clearImage = () => {
    if (item.imageUrl && item.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.imageUrl);
    }
    setItem({ ...item, imageFile: null, imageUrl: '' });
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Menu Item</DialogTitle>
          <DialogDescription>Make changes to the menu item.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-name" className="text-right">
              Name
            </Label>
            <Input
              id="edit-name"
              value={item.name}
              onChange={(e) => setItem({ ...item, name: e.target.value })}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-description" className="text-right">
              Description
            </Label>
            <Input
              id="edit-description"
              value={item.description}
              onChange={(e) =>
                setItem({ ...item, description: e.target.value })
              }
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-price" className="text-right">
              Price
            </Label>
            <Input
              id="edit-price"
              type="number"
              value={item.price}
              onChange={(e) =>
                setItem({ ...item, price: parseFloat(e.target.value) || 0 })
              }
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-category" className="text-right">
              Category
            </Label>
            <Input
              id="edit-category"
              value={item.category}
              onChange={(e) => setItem({ ...item, category: e.target.value })}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-available" className="text-right">
              Available
            </Label>
            <Switch
              id="edit-available"
              checked={item.available}
              onCheckedChange={(checked) =>
                setItem({ ...item, available: checked })
              }
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-image-file" className="text-right">
              Upload Image
            </Label>
            <div className="col-span-3 space-y-2">
              <Input
                id="edit-image-file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full cursor-pointer"
              />
              {(item.imageUrl || item.image || item.imageFile) && (
                <div className="rounded-lg border bg-muted p-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    Preview
                  </div>
                  <img
                    src={item.imageUrl || item.image}
                    alt={item.name || 'Preview'}
                    className="h-32 w-full rounded-md object-cover"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" size="sm" onClick={clearImage}>
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave?.(item)}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditItemDialog;
