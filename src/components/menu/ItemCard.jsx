// src/components/menu/ItemCard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Archive,
  Edit,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
} from 'lucide-react';

const ItemCard = ({
  item,
  mode = 'active',
  onEdit,
  onArchive = () => {},
  onRestore = () => {},
  onHardDeleteRequest,
  density = 'comfortable',
}) => {
  const [imageError, setImageError] = useState(false);
  const isArchived = mode === 'archived';
  const isCompact = density === 'compact';

  const imageSrc = useMemo(() => {
    if (!item) return null;
    const candidates = [
      item.image,
      item.imageUrl,
      item.image_url,
      item.photo,
      item.picture,
      item.thumbnail,
      item.img,
      item?.image?.url,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c;
    }
    return null;
  }, [item]);

  useEffect(() => {
    // Reset broken-state when a new image URL arrives so fresh uploads render
    setImageError(false);
  }, [imageSrc]);

  const showImage = Boolean(imageSrc) && !imageError;
  const badge = isArchived
    ? {
        label: 'Archived',
        variant: 'outline',
        className: 'bg-slate-100 text-slate-600 border-transparent',
      }
    : item.available
      ? {
          label: 'Available',
          variant: 'outline',
          className: 'bg-[#CDECC7] text-[#1E5B36] border-transparent',
        }
      : {
          label: 'Unavailable',
          variant: 'destructive',
          className: '',
        };

  return (
    <Card className="group relative h-full overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
      {/* Blurry background image */}
      {showImage && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-30 scale-110"
          style={{ backgroundImage: `url(${imageSrc})` }}
        />
      )}

      {/* Subtle dark overlay for contrast */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-0" />

      {/* Decorative top gradient line */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60 z-10" />

      <div className="relative z-10">
        <CardHeader
          className={isCompact ? 'p-3 pb-0 space-y-2' : 'p-4 pb-0 space-y-3'}
        >
          <div className="relative rounded-lg border border-border/40 bg-background/60 backdrop-blur-sm shadow-inner">
            {showImage ? (
              <img
                src={imageSrc}
                alt={item.name}
                className={`w-full rounded-lg object-cover transition-transform duration-500 group-hover:scale-[1.02] ${
                  isCompact ? 'h-20' : 'h-28'
                }`}
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted/50 text-muted-foreground ${
                  isCompact ? 'h-20' : 'h-28'
                }`}
              >
                <ImageIcon className="h-7 w-7" />
                <span className="text-xs font-medium">No Image Available</span>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-2">
              <Badge
                variant={badge.variant}
                className={`backdrop-blur-sm text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}
              >
                {badge.label}
              </Badge>
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle
              className={`font-semibold leading-tight text-foreground line-clamp-2 ${
                isCompact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
              }`}
            >
              {item.name}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent
          className={isCompact ? 'p-3 pt-2 space-y-2' : 'p-4 pt-3 space-y-3'}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Starting at
              </p>
              <p
                className={`font-semibold text-primary ${
                  isCompact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
                }`}
              >
                ₱{Number(item.price).toFixed(2)}
              </p>
            </div>
            {item.category && (
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[11px] font-medium bg-[#FFF3BF] text-[#5C4300] border-transparent"
              >
                {item.category}
              </Badge>
            )}
          </div>
          <div
            className={`flex items-center justify-end gap-2 ${
              isCompact ? 'pt-1' : 'pt-2'
            }`}
          >
            <Button
              variant="outline"
              size="sm"
              className={isCompact ? 'h-7 px-2 text-xs' : 'h-8 px-2 text-xs'}
              onClick={() => onEdit(item)}
            >
              <Edit className="h-3 w-3 mr-1" /> Edit
            </Button>
            {isArchived ? (
              <>
                <Button
                  variant="default"
                  size="icon"
                  className={isCompact ? 'h-7 w-7' : 'h-8 w-8'}
                  onClick={() => onRestore(item)}
                  aria-label={`Restore ${item.name}`}
                  title={`Restore ${item.name}`}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                {typeof onHardDeleteRequest === 'function' ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    className={isCompact ? 'h-7 w-7' : 'h-8 w-8'}
                    onClick={() => onHardDeleteRequest(item)}
                    aria-label={`Delete ${item.name} permanently`}
                    title={`Delete ${item.name} permanently`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                variant="destructive"
                size="icon"
                className={isCompact ? 'h-7 w-7' : 'h-8 w-8'}
                onClick={() => onArchive(item.id)}
                aria-label={`Archive ${item.name}`}
                title={`Archive ${item.name}`}
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
};

export default ItemCard;
