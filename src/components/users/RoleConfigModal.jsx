import React, { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PERMISSION_CODES, permissionLabel } from '@/lib/permissions';

export const RoleConfigModal = ({ open, onOpenChange, role, onUpdateRole }) => {
  const normalizePermissions = (roleValue, permissions = []) =>
    roleValue === 'admin'
      ? permissions
      : permissions.filter((permission) => permission !== 'all');

  const [formData, setFormData] = useState({
    label: role?.label || '',
    description: role?.description || '',
    permissions: normalizePermissions(role?.value, role?.permissions || []),
  });

  useEffect(() => {
    setFormData({
      label: role?.label || '',
      description: role?.description || '',
      permissions: normalizePermissions(role?.value, role?.permissions || []),
    });
  }, [role]);

  const availablePermissions =
    role?.value === 'admin'
      ? PERMISSION_CODES
      : PERMISSION_CODES.filter((permission) => permission !== 'all');

  const handlePermissionChange = (permission, checked) => {
    if (checked) {
      setFormData({
        ...formData,
        permissions: [...formData.permissions, permission],
      });
    } else {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter((p) => p !== permission),
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (role && formData.label && formData.description) {
      onUpdateRole({
        ...role,
        label: formData.label,
        description: formData.description,
        permissions: formData.permissions,
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure Role: {role?.label}</DialogTitle>
          <DialogDescription>
            Manage role permissions and settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="label">Role Name</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="Enter role name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter role description"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                {availablePermissions.map((permission) => (
                  <div key={permission} className="flex items-center space-x-2">
                    <Checkbox
                      id={permission}
                      checked={formData.permissions.includes(permission)}
                      onCheckedChange={(checked) =>
                        handlePermissionChange(permission, checked)
                      }
                    />
                    <Label
                      htmlFor={permission}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {permissionLabel(permission)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save Configuration</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
