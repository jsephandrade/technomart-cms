import React from 'react';
import { MoreVertical, Edit, Trash2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const UserTable = ({
  users,
  onEditUser,
  onDeactivateUser,
  onDeleteUser,
  getRoleBadgeVariant,
  getInitials,
  isAdmin = false,
}) => {
  const getRoleBadgeClass = (role) => {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'student' || normalized === 'customer') {
      return 'border-yellow-200 bg-yellow-100 text-yellow-800';
    }
    return null;
  };

  return (
    <div className="rounded-md border">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-10 px-4 text-left font-medium">User</th>
              <th className="h-10 px-4 text-left font-medium">Role</th>
              <th className="h-10 px-4 text-left font-medium">Status</th>
              <th className="h-10 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length > 0 ? (
              users.map((user) => {
                const roleValue = String(user.role || '').toLowerCase();
                const roleClass = getRoleBadgeClass(roleValue);
                return (
                  <tr
                    key={user.id}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          {user.status === 'active' && (
                            <>
                              <span
                                className="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 rounded-full border-2 border-background bg-emerald-400"
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                {user.name} is online
                              </span>
                            </>
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <Badge
                        variant={getRoleBadgeVariant(roleValue)}
                        className={cn('capitalize', roleClass)}
                      >
                        {roleValue || 'unknown'}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center">
                        <div
                          className={`mr-2 h-2.5 w-2.5 rounded-full ${
                            user.status === 'active'
                              ? 'bg-green-500'
                              : 'bg-red-500'
                          }`}
                        ></div>
                        <span className="text-sm capitalize">
                          {user.status}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onEditUser(user)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDeactivateUser(user.id)}
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            {user.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => onDeleteUser(user.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="h-24 text-center">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
