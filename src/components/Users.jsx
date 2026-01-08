import React, { useState, useEffect } from 'react';
import UserManagementCard, {
  UserManagementCardDecor,
} from '@/components/users/UserManagementCard';
import { Button } from '@/components/ui/button';
import {
  UserPlus,
  Users as UsersIcon,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { AddUserModal } from './users/AddUserModal';
import { EditUserModal } from './users/EditUserModal';
import { RoleConfigModal } from './users/RoleConfigModal';
import { UserTable } from './users/UserTable';
import { RoleManagement } from './users/RoleManagement';
import { ActiveUsersList } from './users/ActiveUsersList';
// Header handled via UserManagementCard props
import { UsersSearch } from './users/UsersSearch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Footer rendered inline for UserManagementCard
import { useUserManagement, useRoles } from '@/hooks/useUserManagement';
import { PendingVerifications } from './users/PendingVerifications';
import { useDebouncedValue } from '@/hooks/useDebounce';
import TableSkeleton from '@/components/shared/TableSkeleton';
import ErrorState from '@/components/shared/ErrorState';
import { useAuth } from '@/components/AuthContext';

const Users = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  const debouncedSearch = useDebouncedValue(searchTerm, 350);

  // Keep internal state as '' for “no filter” to keep the hook simple
  const [roleFilter, setRoleFilter] = useState('');

  const {
    users,
    pagination,
    loading,
    fetching,
    error,
    refetch,
    createUser,
    updateUser,
    deleteUser,
    updateUserStatus,
  } = useUserManagement({
    search: debouncedSearch,
    // IMPORTANT: send '' (not a sentinel) to the hook/api
    role: roleFilter,
  });

  useEffect(() => {
    const handleUsersUpdated = () => {
      refetch?.();
    };
    window?.addEventListener?.('users.updated', handleUsersUpdated);
    return () => {
      window?.removeEventListener?.('users.updated', handleUsersUpdated);
    };
  }, [refetch]);

  const {
    roles,
    loading: rolesLoading,
    error: rolesError,
    updateRoleConfig,
  } = useRoles();

  const { hasAnyRole } = useAuth();
  const showVerifyQueue = hasAnyRole(['admin', 'manager']);
  const isAdmin = hasAnyRole(['admin']);

  const nonPendingUsers = Array.isArray(users)
    ? users.filter((u) => u.status !== 'pending')
    : [];

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'manager':
        return 'default';
      case 'staff':
        return 'secondary';
      case 'faculty':
        return 'outline';
      case 'student':
      case 'customer':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  const handleAddUser = async (newUser) => {
    await createUser.mutateAsync(newUser);
    if (newUser?.sendInvite && newUser?.email && !newUser?.password) {
      try {
        const { authService } = await import('@/api/services/authService');
        await authService.forgotPassword(newUser.email);
      } catch {}
    }
  };

  const handleUpdateUser = async (updatedUser) => {
    await updateUser.mutateAsync({
      userId: updatedUser.id,
      updates: updatedUser,
    });
  };

  const handleDeleteUser = async (userId) => {
    await deleteUser.mutateAsync(userId);
  };

  const handleDeactivateUser = async (userId) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const status = user.status === 'active' ? 'deactivated' : 'active';
    await updateUserStatus.mutateAsync({ userId, status });
  };

  const handleConfigureRole = (role) => {
    setSelectedRole(role);
    setShowRoleModal(true);
  };

  const handleUpdateRole = async (updatedRole) => {
    await updateRoleConfig.mutateAsync(updatedRole);
  };

  const userManagementCard = (
    <UserManagementCard
      title="User Management"
      titleStyle="accent"
      titleIcon={UsersIcon}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Manage system users and access"
      decor={<UserManagementCardDecor />}
      headerActions={
        hasAnyRole(['admin']) ? (
          <Button
            size="sm"
            className="flex gap-1"
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            Add User
          </Button>
        ) : null
      }
      contentClassName="space-y-4"
    >
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 min-w-[220px]">
          <UsersSearch
            searchTerm={searchTerm}
            onChange={(value) => setSearchTerm(value)}
          />
        </div>

        {/* Role filter using a sentinel value "_all" for the "All" item */}
        <div className="w-full sm:w-[220px]">
          <Select
            // Show "_all" when roleFilter is '' so the All item is selected
            value={roleFilter === '' ? '_all' : roleFilter}
            // Map "_all" back to '' so the hook gets a clean empty filter
            onValueChange={(v) => setRoleFilter(v === '_all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="faculty">Faculty</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || fetching ? (
        <TableSkeleton
          headers={['User', 'Role', 'Status', 'Actions']}
          rows={5}
        />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <UserTable
          users={nonPendingUsers}
          onEditUser={(user) => {
            setSelectedUser(user);
            setShowEditModal(true);
          }}
          onDeactivateUser={handleDeactivateUser}
          onDeleteUser={handleDeleteUser}
          getRoleBadgeVariant={getRoleBadgeVariant}
          getInitials={getInitials}
          isAdmin={isAdmin}
        />
      )}
      <div className="border-t pt-3 text-xs text-muted-foreground">
        Showing {nonPendingUsers.length} of{' '}
        {pagination?.total ?? nonPendingUsers.length} users
      </div>
    </UserManagementCard>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-2">
        {showVerifyQueue ? (
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="users">User Management</TabsTrigger>
              <TabsTrigger value="pending">Pending Verifications</TabsTrigger>
            </TabsList>
            <TabsContent value="users" className="mt-0">
              {userManagementCard}
            </TabsContent>
            <TabsContent value="pending" className="mt-0">
              <PendingVerifications />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">{userManagementCard}</div>
        )}
      </div>

      <div className="space-y-4">
        {rolesLoading ? (
          <UserManagementCard
            title="Role Management"
            titleStyle="accent"
            titleIcon={ShieldCheck}
            titleAccentClassName="px-3 py-1 text-xs md:text-sm"
            titleClassName="text-xs md:text-sm"
            description="Configure user roles and permissions"
            contentClassName="space-y-4"
            decor={<UserManagementCardDecor />}
          >
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="w-full">
                    <div className="h-4 w-40 bg-muted rounded mb-2" />
                    <div className="h-3 w-60 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </UserManagementCard>
        ) : rolesError ? (
          <UserManagementCard
            title="Role Management"
            titleStyle="accent"
            titleIcon={ShieldCheck}
            titleAccentClassName="px-3 py-1 text-xs md:text-sm"
            titleClassName="text-xs md:text-sm"
            description="Configure user roles and permissions"
            decor={<UserManagementCardDecor />}
          >
            <ErrorState message={rolesError} />
          </UserManagementCard>
        ) : (
          <RoleManagement roles={roles} onConfigureRole={handleConfigureRole} />
        )}

        {loading ? (
          <UserManagementCard
            title="Active Users"
            titleStyle="accent"
            titleIcon={UserCheck}
            titleAccentClassName="px-3 py-1 text-xs md:text-sm"
            titleClassName="text-xs md:text-sm"
            description="Currently active system users"
            decor={<UserManagementCardDecor />}
          >
            <div className="flex flex-wrap gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="h-6 w-6 rounded-full bg-muted" />
                  <div className="h-4 w-16 bg-muted rounded" />
                </div>
              ))}
            </div>
          </UserManagementCard>
        ) : (
          <ActiveUsersList
            users={nonPendingUsers.filter((u) => u.status === 'active')}
            getInitials={getInitials}
          />
        )}
      </div>

      <AddUserModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onAddUser={handleAddUser}
      />

      <EditUserModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        user={selectedUser}
        onUpdateUser={handleUpdateUser}
      />

      <RoleConfigModal
        open={showRoleModal}
        onOpenChange={setShowRoleModal}
        role={selectedRole}
        onUpdateRole={handleUpdateRole}
      />
    </div>
  );
};

export default Users;
