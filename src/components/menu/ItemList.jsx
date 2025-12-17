// src/components/menu/ItemList.jsx
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Edit,
  Archive,
  RotateCcw,
  Image as ImageIcon,
  Clock,
  Layers,
} from 'lucide-react';

const formatArchivedOn = (value) => {
  if (!value) return '';
  try {
    const dt = typeof value === 'string' ? new Date(value) : value;
    if (!dt || Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(dt);
  } catch {
    return '';
  }
};

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

const ItemList = ({
  items = [],
  onEdit,
  onArchive = () => {},
  mode = 'active',
  onRestore = () => {},
}) => {
  const [brokenImages, setBrokenImages] = useState({});

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-10 text-center text-sm text-muted-foreground">
        {mode === 'archived'
          ? 'No archived menu items yet.'
          : 'Nothing here yet. Try adding your first menu item.'}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {items.map((item, index) => {
        const imageSrc = resolveImageSrc(item);
        const brokenKey = item?.id ?? item?.name ?? index;
        const showImage = Boolean(imageSrc) && !brokenImages[brokenKey];
        const category = item.category || item.categoryName || 'Uncategorized';
        const availabilityBadge =
          mode === 'archived'
            ? {
                label: 'Archived',
                className:
                  'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
              }
            : item.available
              ? {
                  label: 'Available',
                  className:
                    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
                }
              : {
                  label: 'Unavailable',
                  className:
                    'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
                };
        const archivedOn =
          mode === 'archived' ? formatArchivedOn(item.archivedAt) : '';

        return (
          <div
            key={item.id}
            className="group relative flex flex-col gap-4 border-b border-border/60 bg-background/60 px-4 py-4 transition hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
          >
            {/* subtle gradient accent */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary/60 via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative shrink-0 self-start">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-md opacity-0 transition group-hover:opacity-100" />
              {showImage ? (
                <img
                  src={imageSrc}
                  alt={item.name}
                  className="relative h-16 w-16 rounded-xl border border-border/60 object-cover shadow-sm transition duration-300 group-hover:scale-[1.03]"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [brokenKey]: true }))
                  }
                />
              ) : (
                <div className="relative flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted text-muted-foreground transition duration-300 group-hover:scale-[1.03]">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-base font-semibold text-foreground">
                  {item.name}
                </p>
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${availabilityBadge.className}`}
                >
                  {availabilityBadge.label}
                </Badge>
              </div>

              {item.description ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/70">
                  No description provided.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium text-foreground">
                  <Layers className="h-3 w-3" />
                  {category}
                </span>
                {item.preparationTime ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                    <Clock className="h-3 w-3" />
                    Prep: {item.preparationTime} mins
                  </span>
                ) : null}
                {archivedOn ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                    Archived on {archivedOn}
                  </span>
                ) : null}
                {Array.isArray(item.ingredients) &&
                item.ingredients.length > 0 ? (
                  <span className="hidden truncate rounded-full bg-muted px-2 py-1 font-medium sm:inline">
                    {item.ingredients.length} ingredient
                    {item.ingredients.length > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:flex-col sm:items-end sm:justify-center sm:text-right">
              <span className="text-lg font-semibold text-primary">
                ₱{Number(item.price).toFixed(2)}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full border-border/70 transition hover:border-primary hover:text-primary"
                  onClick={() => onEdit(item)}
                  aria-label={`Edit ${item.name}`}
                  title={`Edit ${item.name}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                {mode === 'archived' ? (
                  <Button
                    variant="default"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => onRestore(item)}
                    aria-label={`Restore ${item.name}`}
                    title={`Restore ${item.name}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => onArchive(item.id)}
                    aria-label={`Archive ${item.name}`}
                    title={`Archive ${item.name}`}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {index !== items.length - 1 ? (
              <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent opacity-60" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ItemList;
