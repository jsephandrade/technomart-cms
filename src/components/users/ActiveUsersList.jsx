import React from 'react';
import { UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import UserManagementCard, {
  UserManagementCardDecor,
} from './UserManagementCard';

export const ActiveUsersList = ({ users, getInitials }) => {
  return (
    <UserManagementCard
      title="Active Users"
      titleStyle="accent"
      titleIcon={UserCheck}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Currently active system users"
      decor={<UserManagementCardDecor />}
      contentClassName="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        {users.map(
          (user, index) =>
            index < 5 && (
              <div key={user.id} className="flex items-center gap-1">
                <div className="relative">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  {user.status === 'active' && (
                    <>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-400"
                        aria-hidden="true"
                      />
                      <span className="sr-only">{user.name} is online</span>
                    </>
                  )}
                </div>
                <Badge variant="outline" className="flex gap-1 items-center">
                  <UserCheck className="h-3 w-3" />
                  {user.name.split(' ')[0]}
                </Badge>
              </div>
            )
        )}
      </div>
    </UserManagementCard>
  );
};
