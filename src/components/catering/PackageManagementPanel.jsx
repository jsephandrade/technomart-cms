import React, { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Edit, Archive, CheckCircle } from 'lucide-react';

const formatNumber = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toFixed(2);
};

const formatQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
};

const PackageManagementPanel = ({
  packages = [],
  isLoading = false,
  error = null,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onRetry,
  onCreate,
  onEdit,
  onToggleActive,
  canManage = false,
  showCreateButton = true,
}) => {
  const [confirmState, setConfirmState] = useState(null);

  const filteredPackages = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return packages;
    return packages.filter((pkg) => {
      const name = String(pkg?.name || '').toLowerCase();
      const description = String(pkg?.description || '').toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }, [packages, searchTerm]);

  const handleRequestToggle = (pkg) => {
    setConfirmState({
      pkg,
      nextActive: !pkg.active,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search packages..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {canManage && showCreateButton ? (
          <Button onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" /> Create Package
          </Button>
        ) : null}
      </div>

      <Tabs value={statusFilter} onValueChange={onStatusChange}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Available
          </TabsTrigger>
          <TabsTrigger value="inactive" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Archive
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">
          Loading packages...
        </div>
      ) : error ? (
        <div className="py-10 text-center text-muted-foreground">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <p>No packages found.</p>
          {canManage && showCreateButton ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onCreate}
            >
              Create Package
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPackages.map((pkg) => {
            const items = Array.isArray(pkg.items) ? pkg.items : [];
            const visibleItems = items.slice(0, 4);
            const extraCount = Math.max(0, items.length - visibleItems.length);
            return (
              <Card key={pkg.id} className="border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{pkg.name}</CardTitle>
                      {pkg.description ? (
                        <p className="text-xs text-muted-foreground">
                          {pkg.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={pkg.active ? 'default' : 'secondary'}
                      className={`flex items-center gap-1 ${
                        pkg.active ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      {pkg.active ? (
                        <>
                          <CheckCircle className="h-3 w-3" />
                          Available
                        </>
                      ) : (
                        <>
                          <Archive className="h-3 w-3" />
                          Archived
                        </>
                      )}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>PHP {formatNumber(pkg.pricePerPax)} / pax</span>
                    <span>Min {pkg.minPax || 1} pax</span>
                    {pkg.maxPax ? <span>Max {pkg.maxPax} pax</span> : null}
                  </div>
                  {items.length ? (
                    <div className="space-y-1 text-sm">
                      {visibleItems.map((item) => (
                        <div
                          key={item.id || item.name}
                          className="flex items-center justify-between"
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatQuantity(item.quantityPerPax)} / pax
                          </span>
                        </div>
                      ))}
                      {extraCount > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          +{extraCount} more items
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No items added yet.
                    </p>
                  )}

                  {canManage ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(pkg)}
                      >
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button
                        variant={pkg.active ? 'destructive' : 'default'}
                        size="sm"
                        onClick={() => handleRequestToggle(pkg)}
                        className="flex items-center gap-2"
                      >
                        {pkg.active ? (
                          <>
                            <Archive className="h-4 w-4" />
                            Archive
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            Available
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={Boolean(confirmState)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState?.nextActive
                ? 'Make package available?'
                : 'Archive package?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState?.nextActive
                ? 'This package will be available for catering selection again.'
                : 'This package will be hidden from catering selection.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmState) {
                  onToggleActive?.(confirmState.pkg, confirmState.nextActive);
                  setConfirmState(null);
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PackageManagementPanel;
