// src/components/menu/EditItemDialog.jsx
import React, { useRef } from 'react';
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
  const fileInputRef = useRef(null);

  if (!item) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setItem({ ...item, imageFile: file, imageUrl: previewUrl });
  };

  const clearImage = () => {
    setItem({ ...item, imageFile: undefined, imageUrl: '' });
  };

  const triggerFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
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
              disabled={item.archived}
              onCheckedChange={(checked) =>
                setItem({ ...item, available: checked })
              }
            />
          </div>

          {item.archived ? (
            <p className="col-span-4 text-sm text-amber-600">
              Restore this item before marking it available.
            </p>
          ) : null}

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right">Image</Label>
            <div className="col-span-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-md border bg-muted">
                  {item.imageUrl || item.image ? (
                    <img
                      src={item.imageUrl || item.image}
                      alt={item.name || 'Preview'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={triggerFilePicker}>
                    {item.imageUrl || item.image
                      ? 'Change Image'
                      : 'Upload Image'}
                  </Button>
                  {(item.imageUrl || item.image || item.imageFile) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearImage}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                id="edit-image-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
          {/* --- /Image controls --- */}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditItemDialog;
