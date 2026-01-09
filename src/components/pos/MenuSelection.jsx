import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Search,
  AlertCircle,
  Image as ImageIcon,
  ShoppingCart,
} from 'lucide-react';
import { usePaxForItem } from '@/hooks/usePaxTracker';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';

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

const MenuSelection = ({
  categories,
  activeCategory,
  setActiveCategory,
  searchTerm,
  setSearchTerm,
  onAddToOrder,
  occupyFullWidth = false,
  mobileOrderCount = 0,
  onOpenMobileOrder = null,
}) => {
  const getFilteredItems = () => {
    if (searchTerm.trim()) {
      const allItems = [];
      categories.forEach((category) => {
        category.items
          .filter(
            (item) =>
              item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              item.description.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .forEach((item) => {
            allItems.push({ ...item, categoryName: category.name });
          });
      });
      return allItems;
    }

    return (
      categories
        .find((cat) => cat.id === activeCategory)
        ?.items.map((item) => ({ ...item, categoryName: '' })) || []
    );
  };

  const filteredItems = getFilteredItems();

  const imageById = useMemo(() => {
    const map = new Map();
    (categories || []).forEach((category) => {
      (category.items || []).forEach((entry) => {
        if (entry?.id === undefined || entry?.id === null) return;
        const src = resolveImageSrc(entry);
        if (src) map.set(String(entry.id), src);
      });
    });
    return map;
  }, [categories]);

  const ItemCard = ({ item, showCategoryBadge = false }) => {
    const imageSrc = resolveImageSrc(item);
    const ingredientIds = resolveIngredientIds(item);
    const ingredientImages = resolveIngredientImages(item, imageById);
    const [brokenImages, setBrokenImages] = useState({});
    const categoryLabel = item.categoryName || item.category || '';
    const isUnavailable = item.available === false;
    const paxInfo = usePaxForItem(item.id);
    const hasEstimatedPax =
      paxInfo && typeof paxInfo.estimated === 'number' && paxInfo.estimated > 0;
    const estimatedPax = hasEstimatedPax
      ? Math.max(0, Math.floor(paxInfo.estimated))
      : null;
    const remainingPax =
      hasEstimatedPax && typeof paxInfo.remaining === 'number'
        ? Math.max(0, Math.floor(paxInfo.remaining))
        : null;
    const paxRemainingValue =
      remainingPax !== null ? remainingPax : estimatedPax;

    const markBroken = (src) => {
      if (!src) return;
      setBrokenImages((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
    };

    const baseImage =
      imageSrc && !brokenImages[String(imageSrc)] ? imageSrc : null;
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

    const handleActivate = (event) => {
      if (isUnavailable) return;
      if (event?.type === 'keydown') {
        event.preventDefault();
      }
      onAddToOrder(item, {
        collageImages: showCollage ? collageSources : [],
        ingredients: ingredientIds,
        heroImage,
      });
    };

    return (
      <Card
        role="button"
        tabIndex={isUnavailable ? -1 : 0}
        onClick={handleActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleActivate(event);
          }
        }}
        className={`group relative h-full w-full min-w-0 overflow-hidden border border-border/50 shadow-sm transition-all duration-300 sm:min-w-[11.5rem] ${
          isUnavailable
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary/60'
        }`}
        aria-disabled={isUnavailable}
      >
        {heroImage && (
          <div
            className="absolute inset-0 z-0 bg-cover bg-center blur-sm opacity-30 scale-110"
            style={{ backgroundImage: `url(${heroImage})` }}
            aria-hidden="true"
          />
        )}
        <div
          className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-0"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60 z-10"
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col">
          <CardHeader className="p-4 pb-0">
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
                          <ImageIcon className="h-5 w-5" aria-hidden="true" />
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
                  onError={() => markBroken(baseImage)}
                />
              ) : (
                <div className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted/50 text-muted-foreground">
                  <ImageIcon className="h-7 w-7" aria-hidden="true" />
                  <span className="text-xs font-medium">
                    No Image Available
                  </span>
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2 left-2">
                <Badge
                  variant={isUnavailable ? 'destructive' : 'outline'}
                  className={`backdrop-blur-sm text-[10px] font-semibold uppercase tracking-wide ${
                    isUnavailable
                      ? ''
                      : 'bg-[#CDECC7] text-[#1E5B36] border-transparent'
                  }`}
                >
                  {isUnavailable ? 'Unavailable' : 'Available'}
                </Badge>
              </div>
            </div>
            <div className="mt-3">
              <CardTitle className="text-base font-semibold leading-tight text-foreground line-clamp-2 sm:text-lg">
                {item.name}
              </CardTitle>
              {hasEstimatedPax && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    variant={
                      paxRemainingValue === 0 ? 'destructive' : 'outline'
                    }
                    className="rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-wide"
                  >
                    {paxRemainingValue === 0
                      ? 'Sold out'
                      : `${paxRemainingValue} / ${estimatedPax} pax left`}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col p-4 pt-1">
            <div>
              <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[10px]">
                Starting at
              </p>
              <div className="flex items-baseline gap-1 text-primary">
                <span className="text-base font-semibold sm:text-lg">
                  ₱{Number(item.price).toFixed(2)}
                </span>
              </div>
              {showCategoryBadge && categoryLabel ? (
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-[9px] font-medium bg-[#FFF3BF] text-[#5C4300] border-transparent sm:text-[10px]"
                  >
                    {categoryLabel}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardContent>

          <CardFooter className="mt-auto p-4 pt-0">
            <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground sm:text-xs">
              <div className="flex items-center gap-2">
                <span>
                  {isUnavailable
                    ? 'Currently unavailable'
                    : 'Tap to add to order'}
                </span>
                {!showCategoryBadge && categoryLabel ? (
                  <Badge
                    variant="outline"
                    className="max-w-[7rem] rounded-full px-2 py-[2px] text-[9px] font-medium bg-[#FFF3BF] text-[#5C4300] border-transparent sm:text-[10px]"
                  >
                    <span className="block truncate">{categoryLabel}</span>
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardFooter>
        </div>
      </Card>
    );
  };

  const columnClass = occupyFullWidth ? 'md:col-span-3' : 'md:col-span-2';

  const mobileOrderButton =
    typeof onOpenMobileOrder === 'function' ? (
      <button
        type="button"
        onClick={onOpenMobileOrder}
        className="relative inline-flex h-10 w-12 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:hidden"
        aria-label={
          mobileOrderCount > 0
            ? `View current order (${mobileOrderCount} item${
                mobileOrderCount === 1 ? '' : 's'
              })`
            : 'View current order'
        }
      >
        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
        {mobileOrderCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-h-[1.1rem] min-w-[1.1rem] rounded-full bg-destructive px-1 text-[11px] font-semibold leading-[1.1rem] text-destructive-foreground">
            {mobileOrderCount > 99 ? '99+' : mobileOrderCount}
          </span>
        )}
      </button>
    ) : null;

  return (
    <div className={`col-span-1 ${columnClass}`}>
      <FeaturePanelCard
        className="flex h-full flex-col"
        contentClassName="flex flex-1 flex-col overflow-hidden space-y-0"
        badgeIcon={ShoppingCart}
        badgeText="Point of Sale"
        description="Select menu items to add to order"
        headerContent={
          <div className="pt-2">
            <div className="flex w-full items-center gap-2">
              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search menu items..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {mobileOrderButton}
            </div>
          </div>
        }
      >
        {categories.length === 0 ? (
          <div className="grid flex-1 place-items-center text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p>No menu items available. Add items in Menu Management.</p>
            </div>
          </div>
        ) : searchTerm.trim() ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                Search results for "{searchTerm}"
              </h3>
              <div className="grid grid-cols-1 justify-center gap-4 sm:grid-cols-[repeat(auto-fit,minmax(10.75rem,10.75rem))] sm:gap-3 md:justify-start md:gap-4 lg:gap-5">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <ItemCard
                      key={`${item.categoryName}-${item.id}`}
                      item={item}
                      showCategoryBadge
                    />
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center">
                    <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      No menu items found matching "{searchTerm}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Tabs
            defaultValue={categories[0]?.id || ''}
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="flex flex-1 flex-col"
          >
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
              <div className="border-b md:flex-shrink-0 md:border-b-0 md:border-r">
                <TabsList className="!h-auto w-full !justify-start overflow-x-auto overflow-y-hidden !p-0 md:!h-full md:w-fit md:flex-col md:!items-stretch md:overflow-y-auto md:overflow-x-hidden md:!p-1">
                  {categories.map((category) => (
                    <TabsTrigger
                      key={category.id}
                      value={category.id}
                      className="!px-4 !py-2 md:!justify-start md:!px-3 md:!py-2 transition-colors data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground"
                    >
                      <span className="block truncate">{category.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="flex flex-1 flex-col overflow-hidden">
                {categories.map((category) => {
                  const categoryItems = Array.isArray(category.items)
                    ? category.items
                    : [];
                  const showBadge =
                    category.id === 'all' || category.id === 'All';
                  return (
                    <TabsContent
                      key={category.id}
                      value={category.id}
                      className="!mt-0 flex-1 overflow-y-auto p-0"
                    >
                      <div className="grid grid-cols-1 justify-center gap-4 p-3 sm:grid-cols-[repeat(auto-fit,minmax(10.75rem,10.75rem))] sm:gap-3 md:justify-start md:gap-4 lg:gap-5">
                        {categoryItems.length > 0 ? (
                          categoryItems.map((item) => (
                            <ItemCard
                              key={item.id}
                              item={item}
                              showCategoryBadge={showBadge}
                            />
                          ))
                        ) : (
                          <div className="col-span-full py-12 text-center">
                            <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                            <p className="text-muted-foreground">
                              No items in this category
                            </p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  );
                })}
              </div>
            </div>
          </Tabs>
        )}
      </FeaturePanelCard>
    </div>
  );
};

export default MenuSelection;
