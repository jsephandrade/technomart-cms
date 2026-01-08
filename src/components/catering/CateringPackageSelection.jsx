import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, AlertCircle, CheckCircle2 } from 'lucide-react';

const formatQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
};

const CateringPackageSelection = ({
  packages = [],
  selectedPackageId,
  onSelectPackage,
  searchTerm,
  setSearchTerm,
  eventName,
  attendees,
  isSaving = false,
}) => {
  const filteredPackages = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return packages;
    return (packages || []).filter((pkg) => {
      const name = String(pkg?.name || '').toLowerCase();
      const description = String(pkg?.description || '').toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }, [packages, searchTerm]);

  return (
    <div className="h-full flex flex-col">
      <div className="pb-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Package Selection</h3>
            <p className="text-sm text-muted-foreground">
              {eventName} - {attendees} attendees
            </p>
          </div>
          <Badge variant="outline">Catering</Badge>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search packages..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredPackages.length > 0 ? (
          filteredPackages.map((pkg) => {
            const isSelected = String(selectedPackageId) === String(pkg.id);
            const items = Array.isArray(pkg.items) ? pkg.items : [];
            const visibleItems = items.slice(0, 6);
            const extraCount = Math.max(0, items.length - visibleItems.length);
            return (
              <Card
                key={pkg.id}
                className={`border transition-all ${
                  isSelected
                    ? 'border-primary shadow-md'
                    : 'hover:border-primary/40'
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{pkg.name}</CardTitle>
                      {pkg.description ? (
                        <CardDescription>{pkg.description}</CardDescription>
                      ) : null}
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      PHP {Number(pkg.pricePerPax || 0).toFixed(2)} / pax
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Min: {pkg.minPax || 1} pax</span>
                    {pkg.maxPax ? <span>Max: {pkg.maxPax} pax</span> : null}
                  </div>
                  {items.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Includes
                      </p>
                      <div className="space-y-1">
                        {visibleItems.map((item) => (
                          <div
                            key={item.id || item.name}
                            className="flex items-center justify-between text-sm"
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
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No items listed yet.
                    </p>
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                  <Button
                    type="button"
                    className="w-full"
                    variant={isSelected ? 'secondary' : 'default'}
                    onClick={() => onSelectPackage?.(pkg)}
                    disabled={isSaving}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Selected
                      </>
                    ) : (
                      'Select Package'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })
        ) : (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">No packages found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CateringPackageSelection;
