import React, { useState, useEffect, useMemo } from 'react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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

  const permissionGroups = useMemo(() => {
    const groupLabels = {
      all: 'All Access',
      account: 'Account',
      inventory: 'Inventory',
      order: 'Orders',
      payment: 'Payments',
      profile: 'Profile',
      schedule: 'Schedule',
      attendance: 'Attendance',
      leave: 'Leave',
      reports: 'Reports',
      notification: 'Notifications',
      menu: 'Menu',
      catering: 'Catering',
      employees: 'Employees',
      verify: 'Verification',
    };
    const groupOrder = [
      'all',
      'account',
      'inventory',
      'order',
      'payment',
      'reports',
      'menu',
      'catering',
      'employees',
      'schedule',
      'attendance',
      'leave',
      'notification',
      'profile',
      'verify',
    ];

    const groups = new Map();
    availablePermissions.forEach((permission) => {
      const key =
        permission === 'all'
          ? 'all'
          : (permission.split('.')[0] || 'other').toLowerCase();
      const label = groupLabels[key] || 'Other';
      if (!groups.has(key)) {
        groups.set(key, { key, label, permissions: [] });
      }
      groups.get(key).permissions.push(permission);
    });

    const sorted = Array.from(groups.values()).map((group) => ({
      ...group,
      permissions: group.permissions.sort((a, b) =>
        permissionLabel(a).localeCompare(permissionLabel(b))
      ),
    }));

    const orderIndex = (key) => {
      const idx = groupOrder.indexOf(key);
      return idx === -1 ? groupOrder.length + 1 : idx;
    };

    sorted.sort((a, b) => {
      const diff = orderIndex(a.key) - orderIndex(b.key);
      if (diff !== 0) return diff;
      return a.label.localeCompare(b.label);
    });

    return sorted;
  }, [availablePermissions]);

  const handlePermissionChange = (permission, checked) => {
    const isChecked = checked === true;
    setFormData((prev) => {
      if (permission === 'all') {
        return {
          ...prev,
          permissions: isChecked ? ['all'] : [],
        };
      }
      const next = new Set(prev.permissions);
      if (next.has('all')) next.delete('all');
      if (isChecked) {
        next.add(permission);
      } else {
        next.delete(permission);
      }
      return { ...prev, permissions: Array.from(next) };
    });
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
      <DialogContent className="scrollbar-hide max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
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
              <Accordion type="multiple" className="w-full">
                {permissionGroups.map((group) => (
                  <AccordionItem key={group.key} value={group.key}>
                    <AccordionTrigger className="text-left text-sm">
                      {group.label}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-2">
                        {group.permissions.map((permission) => (
                          <div
                            key={permission}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={permission}
                              checked={formData.permissions.includes(
                                permission
                              )}
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
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
