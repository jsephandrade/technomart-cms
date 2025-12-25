import React from 'react';
import { Edit, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserManagementCard, {
  UserManagementCardDecor,
} from './UserManagementCard';

export const RoleManagement = ({ roles, onConfigureRole }) => {
  return (
    <UserManagementCard
      title="Role Management"
      titleStyle="accent"
      titleIcon={ShieldCheck}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Configure user roles and permissions"
      decor={<UserManagementCardDecor />}
      contentClassName="space-y-4"
    >
      <div className="space-y-4">
        {roles.map((role) => (
          <div
            key={role.value}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div>
              <h4 className="font-medium capitalize">{role.label}</h4>
              <p className="text-xs text-muted-foreground">
                {role.description}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConfigureRole(role)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </UserManagementCard>
  );
};
