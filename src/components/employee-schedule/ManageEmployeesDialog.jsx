import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Users } from 'lucide-react';
import {
  CANTEEN_ROLE_OPTIONS,
  mergeRoleOptions,
  resolveRoleLabel,
} from '@/lib/canteenRoles';

const ManageEmployeesDialog = ({
  open,
  onOpenChange,
  employeeList = [],
  managedEmployee,
  setManagedEmployee = () => {},
  onUpdateEmployee,
  showTrigger = true,
}) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const roleOptions = useMemo(
    () =>
      mergeRoleOptions(
        CANTEEN_ROLE_OPTIONS,
        employeeList.map((employee) => employee.position)
      ),
    [employeeList]
  );
  const [roleQuery, setRoleQuery] = useState('');
  const filteredRoleOptions = useMemo(() => {
    const query = (roleQuery || '').trim().toLowerCase();
    if (!query) return roleOptions;
    return roleOptions.filter((role) => role.toLowerCase().includes(query));
  }, [roleOptions, roleQuery]);

  const normalizedEmployee = managedEmployee || {
    id: '',
    name: '',
    position: '',
    hireDate: '',
    contact: '',
    status: 'active',
  };

  useEffect(() => {
    if (!open) {
      setSelectedEmployeeId('');
      return;
    }

    if (selectedEmployeeId) return;

    if (normalizedEmployee.id) {
      setSelectedEmployeeId(String(normalizedEmployee.id));
      return;
    }

    const firstEmployee = employeeList[0];
    if (firstEmployee) {
      setSelectedEmployeeId(String(firstEmployee.id));
      setManagedEmployee({
        id: firstEmployee.id,
        name: firstEmployee.name || '',
        position: firstEmployee.position || '',
        hireDate: firstEmployee.hireDate || '',
        contact: firstEmployee.contact || '',
        status: firstEmployee.status || 'active',
      });
    } else {
      setManagedEmployee({
        id: '',
        name: '',
        position: '',
        hireDate: '',
        contact: '',
        status: 'active',
      });
    }
  }, [
    open,
    employeeList,
    normalizedEmployee.id,
    selectedEmployeeId,
    setManagedEmployee,
  ]);

  const handleSelectEmployee = (value) => {
    setSelectedEmployeeId(value);
    const employee = employeeList.find(
      (item) => String(item.id) === String(value)
    );
    if (employee) {
      setManagedEmployee({
        id: employee.id,
        name: employee.name || '',
        position: employee.position || '',
        hireDate: employee.hireDate || '',
        contact: employee.contact || '',
        status: employee.status || 'active',
      });
    } else {
      setManagedEmployee({
        id: '',
        name: '',
        position: '',
        hireDate: '',
        contact: '',
        status: 'active',
      });
    }
  };

  const handleFieldChange = (field, value) => {
    setManagedEmployee((prev) => ({
      ...(typeof prev === 'object' && prev !== null
        ? prev
        : {
            id: '',
            name: '',
            position: '',
            hireDate: '',
            contact: '',
            status: 'active',
          }),
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (!normalizedEmployee.id || typeof onUpdateEmployee !== 'function') {
      return;
    }
    onUpdateEmployee(normalizedEmployee);
  };

  const hasEmployees = employeeList.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Users size={16} /> Manage Employees
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>
            Update employee information that powers schedules and attendance.
          </DialogDescription>
        </DialogHeader>
        {hasEmployees ? (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employee" className="text-right">
                Employee
              </Label>
              <Select
                value={selectedEmployeeId}
                onValueChange={handleSelectEmployee}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {employeeList.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name} ({employee.position || 'No position'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={normalizedEmployee.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="position" className="text-right">
                Position / Role
              </Label>
              <Select
                value={resolveRoleLabel(
                  normalizedEmployee.position,
                  roleOptions
                )}
                onValueChange={(value) => handleFieldChange('position', value)}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-3">
                    <Input
                      value={roleQuery}
                      onChange={(event) => setRoleQuery(event.target.value)}
                      placeholder="Search roles..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {(filteredRoleOptions || []).map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                    {!filteredRoleOptions.length ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No roles match.
                      </div>
                    ) : null}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hireDate" className="text-right">
                Hire Date
              </Label>
              <Input
                id="hireDate"
                type="date"
                value={normalizedEmployee.hireDate || ''}
                onChange={(e) => handleFieldChange('hireDate', e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="contact" className="text-right">
                Contact
              </Label>
              <Input
                id="contact"
                value={normalizedEmployee.contact || ''}
                onChange={(e) => handleFieldChange('contact', e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
        ) : (
          <div className="py-6 text-sm text-muted-foreground">
            No employees available to edit. Add employee records from the admin
            panel first.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasEmployees || !normalizedEmployee.id}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageEmployeesDialog;
