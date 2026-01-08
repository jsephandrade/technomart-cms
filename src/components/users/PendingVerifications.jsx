import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useVerificationQueue } from '@/hooks/useVerificationQueue';
import verificationService from '@/api/services/verificationService';
import { Badge } from '@/components/ui/badge';
import TableSkeleton from '@/components/shared/TableSkeleton';
import ErrorState from '@/components/shared/ErrorState';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Check,
  X,
  Image as ImageIcon,
  MoreVertical,
  ClipboardList,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import UserManagementCard, {
  UserManagementCardDecor,
} from './UserManagementCard';
import { UsersSearch } from './UsersSearch';
import { useDebouncedValue } from '@/hooks/useDebounce';

const AUTO_REFRESH_INTERVAL = 20_000;

export const PendingVerifications = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const { requests, pagination, loading, error, refetch, approve, reject } =
    useVerificationQueue({
      status: 'pending',
      limit: 10,
      search: debouncedSearch,
    });
  const [previewId, setPreviewId] = useState(null);
  const [previewShots, setPreviewShots] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [approveId, setApproveId] = useState(null);
  const [role, setRole] = useState('staff');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const intervalId = window.setInterval(() => {
      refetch();
    }, AUTO_REFRESH_INTERVAL);

    const handleUsersUpdated = () => {
      refetch();
    };

    window.addEventListener('users.updated', handleUsersUpdated);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('users.updated', handleUsersUpdated);
    };
  }, [refetch]);

  const total = pagination?.total ?? requests.length;
  const getInitials = (name = '') =>
    name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase();

  const openPreview = async (reqId) => {
    if (previewShots.length) {
      previewShots.forEach((shot) => {
        if (shot.url) URL.revokeObjectURL(shot.url);
      });
    }
    setPreviewId(reqId);
    setPreviewShots([]);
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const list = await verificationService.listHeadshots(reqId);
      if (Array.isArray(list) && list.length > 0) {
        const results = await Promise.allSettled(
          list.map(async (shot) => {
            const blob = await verificationService.fetchHeadshotBlob(
              reqId,
              shot.id
            );
            return {
              id: shot.id,
              position: shot.position || '',
              url: URL.createObjectURL(blob),
            };
          })
        );
        const shots = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value);
        if (!shots.length) {
          throw new Error('No images available');
        }
        setPreviewShots(shots);
      } else {
        const blob = await verificationService.fetchHeadshotBlob(reqId);
        const url = URL.createObjectURL(blob);
        setPreviewShots([{ id: 'legacy', position: 'Headshot', url }]);
      }
    } catch (e) {
      setPreviewError('Unable to load headshots.');
    }
    setPreviewLoading(false);
  };
  const closePreview = () => {
    previewShots.forEach((shot) => {
      if (shot.url) URL.revokeObjectURL(shot.url);
    });
    setPreviewShots([]);
    setPreviewId(null);
    setPreviewError('');
    setPreviewLoading(false);
  };

  const onApprove = async () => {
    if (!approveId) return;
    await approve.mutateAsync({ requestId: approveId, role });
    setApproveId(null);
  };
  const onRejectRow = async (id) => {
    await reject.mutateAsync({ requestId: id, note: '' });
  };

  return (
    <UserManagementCard
      title="Pending Verifications"
      titleStyle="accent"
      titleIcon={ClipboardList}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Review new account requests and assign roles"
      decor={<UserManagementCardDecor />}
      headerContent={
        <Badge variant="secondary" className="font-normal">
          {total} pending
        </Badge>
      }
      contentClassName="space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <UsersSearch
            searchTerm={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search pending..."
          />
        </div>
      </div>
      {loading ? (
        <TableSkeleton
          headers={['User', 'Submitted', 'Headshot', 'Actions']}
          rows={5}
        />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 border rounded-md">
          <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">
            No pending requests
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Headshot</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>
                          {getInitials(req.user?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium leading-none">
                          {req.user?.name || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {req.user?.email || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {req.hasHeadshot ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPreview(req.id)}
                        className="inline-flex items-center"
                      >
                        <ImageIcon className="h-4 w-4 mr-1" /> Preview
                      </Button>
                    ) : (
                      <Badge variant="secondary">No photo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 p-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            Assign Role
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup
                              value={role}
                              onValueChange={setRole}
                            >
                              <DropdownMenuRadioItem value="staff">
                                Staff
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="faculty">
                                Faculty
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="customer">
                                Customer
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="manager">
                                Manager
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="admin">
                                Admin
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setApproveId(req.id)}>
                          <Check className="h-4 w-4 mr-2" /> Approve
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRejectRow(req.id)}>
                          <X className="h-4 w-4 mr-2" /> Reject
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Approve confirmation dialog */}
      <Dialog
        open={Boolean(approveId)}
        onOpenChange={(v) => !v && setApproveId(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Approve Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveId(null)}>
              Cancel
            </Button>
            <Button onClick={onApprove} disabled={approve.isPending}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview dialog */}
      <Dialog
        open={Boolean(previewId)}
        onOpenChange={(v) => !v && closePreview()}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Headshot Preview</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {previewLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : previewError ? (
              <div className="text-sm text-destructive">{previewError}</div>
            ) : previewShots.length ? (
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                {previewShots.map((shot, index) => (
                  <div key={shot.id || index} className="space-y-1">
                    <img
                      src={shot.url}
                      alt={shot.position || 'Headshot'}
                      className="max-h-[40vh] w-full rounded-md border object-cover"
                    />
                    {shot.position ? (
                      <div className="text-center text-xs text-muted-foreground">
                        {shot.position}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No image</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closePreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UserManagementCard>
  );
};

export default PendingVerifications;
