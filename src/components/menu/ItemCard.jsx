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

const resolveImageSrc = (item) => {
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
};

const resolveIngredientEntries = (item) => {
  if (!item) return [];
  const raw = item.ingredients || item.ingredientIds || item.ingredient_ids;
  return Array.isArray(raw) ? raw : [];
};

const resolveIngredientIds = (item) =>
  resolveIngredientEntries(item)
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'object') {
        return (
          entry.id ||
          entry.menuItemId ||
          entry.itemId ||
          entry.menu_item_id ||
          null
        );
      }
      return entry;
    })
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value));

const resolveIngredientImages = (item, imageById) =>
  resolveIngredientEntries(item)
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'object') {
        const direct = resolveImageSrc(entry);
        if (direct) return direct;
        const id =
          entry.id ||
          entry.menuItemId ||
          entry.itemId ||
          entry.menu_item_id ||
          null;
        if (id === null || id === undefined) return null;
        return imageById.get(String(id)) || null;
      }
      return imageById.get(String(entry)) || null;
    })
    .filter(Boolean);

const ItemCard = ({
  item,
  allItems = [],
  mode = 'active',
  onEdit,
  onArchive = () => {},
  onRestore = () => {},
  onHardDeleteRequest,
}) => {
  const [imageError, setImageError] = useState(false);
  const [brokenImages, setBrokenImages] = useState({});
  const isArchived = mode === 'archived';

  const imageById = useMemo(() => {
    const map = new Map();
    (allItems || []).forEach((entry) => {
      if (entry?.id === undefined || entry?.id === null) return;
      const src = resolveImageSrc(entry);
      if (src) map.set(String(entry.id), src);
    });
    return map;
  }, [allItems]);

  const imageSrc = useMemo(() => {
    return resolveImageSrc(item);
  }, [item]);

  const ingredientIds = useMemo(() => resolveIngredientIds(item), [item]);
  const ingredientImages = useMemo(
    () => resolveIngredientImages(item, imageById),
    [item, imageById]
  );

  useEffect(() => {
    // Reset broken-state when a new image URL arrives so fresh uploads render
    setImageError(false);
    setBrokenImages({});
  }, [imageSrc, ingredientImages]);

  const markBroken = (src) => {
    if (!src) return;
    setBrokenImages((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
  };

  const baseImage =
    imageSrc && !imageError && !brokenImages[String(imageSrc)]
      ? imageSrc
      : null;
  const safeIngredientImages = ingredientImages.filter(
    (src) => src && !brokenImages[String(src)]
  );
  const collageSources = safeIngredientImages.slice(0, 3);
  if (collageSources.length === 0 && baseImage) {
    collageSources.push(baseImage);
  }
  const collageSlots = [...collageSources];
  while (collageSlots.length < 3) collageSlots.push(null);
  const showCollage = ingredientIds.length > 0;
  const heroImage = collageSources[0] || baseImage;
  const showHero = Boolean(heroImage);

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
      {showHero && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-30 scale-110"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      )}

      {/* Subtle dark overlay for contrast */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-0" />

      {/* Decorative top gradient line */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60 z-10" />

      <div className="relative z-10">
        <CardHeader className="p-4 pb-0 space-y-3">
          <div className="relative rounded-lg border border-border/40 bg-background/60 backdrop-blur-sm shadow-inner">
            {showCollage ? (
              <div className="grid h-28 w-full grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg">
                {collageSlots.map((src, slotIndex) => (
                  <div
                    key={`${item.id || item.name}-${slotIndex}`}
                    className={`relative overflow-hidden ${
                      slotIndex === 0 ? 'row-span-2' : ''
                    }`}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        onError={() => markBroken(src)}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/50 text-muted-foreground">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : baseImage ? (
              <img
                src={baseImage}
                alt={item.name}
                className="h-28 w-full rounded-lg object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted/50 text-muted-foreground">
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
            <CardTitle className="text-l font-semibold leading-tight text-foreground line-clamp-2">
              {item.name}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Starting at
              </p>
              <p className="text-2xl font-semibold text-primary">
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
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onEdit(item)}
            >
              <Edit className="h-3 w-3 mr-1" /> Edit
            </Button>
            {isArchived ? (
              <>
                <Button
                  variant="default"
                  size="icon"
                  className="h-8 w-8"
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
                    className="h-8 w-8"
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
                className="h-8 w-8"
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
