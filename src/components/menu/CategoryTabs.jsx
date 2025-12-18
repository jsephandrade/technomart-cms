// src/components/menu/CategoryTabs.jsx
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
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
import {
  Archive,
  CircleSlash,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import ItemGrid from './ItemGrid';
import ItemList from './ItemList';
import EditCategoryDialog from './EditCategoryDialog';

const MAX_VISIBLE_MENU_CATEGORIES = 8;

const CategoryTabs = ({
  items = [],
  categories = [],
  categoryRows = [],
  onEdit = () => {},
  onArchive = () => {},
  onCategoryUpdated = () => {},
  archivedItems = [],
  archivedLoading = false,
  onRestore = () => {},
  onHardDelete = () => {},
}) => {
  const [activeView, setActiveView] = useState('grid');
  const [archivedView, setArchivedView] = useState('list');
  const [activeTab, setActiveTab] = useState('all');
  const [editingCategory, setEditingCategory] = useState(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [hardDeleting, setHardDeleting] = useState(false);
  const hardDeletingRef = useRef(false);
  const tabsListRef = useRef(null);
  const [tabsListMaxWidth, setTabsListMaxWidth] = useState(null);
  const [tabsHasOverflow, setTabsHasOverflow] = useState(false);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);
  const showArchived = activeTab === 'archived';
  const showUnavailable = activeTab === 'unavailable';
  const view = showArchived ? archivedView : activeView;
  const tabTriggerClasses =
    'min-w-fit cursor-pointer select-none whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm';

  const unavailableItems = useMemo(
    () => (items || []).filter((item) => item?.available === false),
    [items]
  );

  const categoryMetaByName = useMemo(() => {
    const map = new Map();
    (categoryRows || []).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const name = String(
        row?.name || row?.label || row?.title || row?.slug || ''
      ).trim();
      if (!name) return;
      map.set(name.toLowerCase(), {
        id: row?.id || row?.slug || name,
        name,
        description: row?.description || '',
        sortOrder: row?.sortOrder ?? row?.sort_order ?? 0,
      });
    });
    return map;
  }, [categoryRows]);

  const openEditCategory = useCallback(
    (event, categoryName) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const meta = categoryMetaByName.get(
        String(categoryName || '')
          .trim()
          .toLowerCase()
      );
      if (!meta) return;
      setEditingCategory(meta);
    },
    [categoryMetaByName]
  );

  const handleCategoryUpdated = useCallback(
    (updated) => {
      const previousName = editingCategory?.name || '';
      const nextName = String(updated?.name || '').trim();
      if (previousName && nextName && activeTab === previousName) {
        setActiveTab(nextName);
      }
      onCategoryUpdated?.(updated);
    },
    [activeTab, editingCategory, onCategoryUpdated]
  );

  const setHardDeletingSafe = useCallback((value) => {
    hardDeletingRef.current = Boolean(value);
    setHardDeleting(Boolean(value));
  }, []);

  const requestHardDelete = useCallback((item) => {
    setHardDeleteTarget(item || null);
  }, []);

  const handleConfirmHardDelete = useCallback(async () => {
    if (!hardDeleteTarget?.id || hardDeletingRef.current) return;
    setHardDeletingSafe(true);
    try {
      await onHardDelete?.(hardDeleteTarget);
      setHardDeleteTarget(null);
    } catch {
      // Caller handles toast; keep dialog open for retry.
    } finally {
      setHardDeletingSafe(false);
    }
  }, [hardDeleteTarget, onHardDelete, setHardDeletingSafe]);

  const handleTabsListWheel = useCallback((event) => {
    const el = tabsListRef.current;
    if (!el) return;
    if (event.shiftKey) return;

    const canScroll = el.scrollWidth > el.clientWidth;
    if (!canScroll) return;

    const deltaX = event.deltaX || 0;
    const deltaY = event.deltaY || 0;
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    if (!delta) return;

    el.scrollLeft += delta;
    event.preventDefault();
  }, []);

  const updateTabsScrollButtons = useCallback(() => {
    const el = tabsListRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = overflow && el.scrollLeft > 0;
    const right = overflow && el.scrollLeft < maxScrollLeft - 1;
    setTabsHasOverflow(overflow);
    setTabsCanScrollLeft(left);
    setTabsCanScrollRight(right);
  }, []);

  const scrollTabsList = useCallback((direction) => {
    const el = tabsListRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientWidth * 0.7));
    const left = direction === 'left' ? -step : step;
    try {
      el.scrollBy({ left, behavior: 'smooth' });
    } catch {
      el.scrollLeft += left;
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;

    if ((categories || []).length <= MAX_VISIBLE_MENU_CATEGORIES) {
      setTabsListMaxWidth(null);
      return undefined;
    }

    const calculateMaxWidth = () => {
      const el = tabsListRef.current;
      if (!el) return;

      // Radix tabs triggers use role="tab" (even when using asChild).
      const tabs = Array.from(el.querySelectorAll('[role="tab"]')).filter(
        (node) => node.offsetParent !== null && node.offsetWidth > 0
      );

      // Show "All Items" + up to MAX_VISIBLE_MENU_CATEGORIES category tabs.
      const targetIndex = Math.min(
        MAX_VISIBLE_MENU_CATEGORIES,
        tabs.length - 1
      );
      const target = tabs[targetIndex];
      if (!target) {
        setTabsListMaxWidth(null);
        return;
      }

      const styles = window.getComputedStyle(el);
      const padRight = parseFloat(styles.paddingRight || '0') || 0;
      const rightEdge = target.offsetLeft + target.offsetWidth + padRight;
      setTabsListMaxWidth(Math.ceil(rightEdge));
    };

    calculateMaxWidth();
    window.addEventListener('resize', calculateMaxWidth);
    return () => window.removeEventListener('resize', calculateMaxWidth);
  }, [categories]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const el = tabsListRef.current;
    if (!el) return undefined;

    const handle = () => updateTabsScrollButtons();
    updateTabsScrollButtons();

    el.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      el.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, [categories, tabsListMaxWidth, updateTabsScrollButtons]);

  const renderItems = (list, mode = 'active') =>
    view === 'grid' ? (
      <ItemGrid
        items={list}
        onEdit={onEdit}
        onArchive={onArchive}
        onHardDeleteRequest={requestHardDelete}
        mode={mode}
        onRestore={mode === 'archived' ? onRestore : undefined}
      />
    ) : (
      <ItemList
        items={list}
        onEdit={onEdit}
        onArchive={onArchive}
        onHardDeleteRequest={requestHardDelete}
        mode={mode}
        onRestore={mode === 'archived' ? onRestore : undefined}
      />
    );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          className="relative w-full flex-1 min-w-0"
          style={
            tabsListMaxWidth ? { maxWidth: `${tabsListMaxWidth}px` } : undefined
          }
        >
          <TabsList
            ref={tabsListRef}
            onWheel={handleTabsListWheel}
            className={`flex h-auto w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide sm:gap-2 ${
              tabsHasOverflow ? 'pl-9 pr-9' : ''
            }`}
          >
            <TabsTrigger value="all" className={tabTriggerClasses}>
              All Items
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                className={`${tabTriggerClasses} justify-between gap-2 pr-1`}
                asChild
              >
                <div>
                  <span className="truncate">{category}</span>
                  {categoryMetaByName.has(
                    String(category || '')
                      .trim()
                      .toLowerCase()
                  ) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-0 border"
                      aria-label={`Edit ${category} category`}
                      title={`Edit ${category}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => openEditCategory(event, category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TabsTrigger>
            ))}
            <TabsTrigger value="archived" className="hidden">
              Archived
            </TabsTrigger>
            <TabsTrigger value="unavailable" className="hidden">
              Unavailable
            </TabsTrigger>
          </TabsList>

          {tabsHasOverflow ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 backdrop-blur hover:bg-muted"
                onClick={() => scrollTabsList('left')}
                disabled={!tabsCanScrollLeft}
                aria-label="Scroll categories left"
                title="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 backdrop-blur hover:bg-muted"
                onClick={() => scrollTabsList('right')}
                disabled={!tabsCanScrollRight}
                aria-label="Scroll categories right"
                title="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => {
              if (!v) return;
              if (showArchived) {
                setArchivedView(v);
              } else {
                setActiveView(v);
              }
            }}
            variant="outline"
            size="sm"
            aria-label="View mode"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant={showUnavailable ? 'default' : 'outline'}
            size="icon"
            onClick={() =>
              setActiveTab((prev) =>
                prev === 'unavailable' ? 'all' : 'unavailable'
              )
            }
            aria-pressed={showUnavailable}
            aria-label={
              showUnavailable
                ? 'Show all menu items'
                : 'Show unavailable menu items'
            }
            title={
              showUnavailable ? 'Show all menu items' : 'Show unavailable items'
            }
          >
            <CircleSlash className="h-4 w-4" />
          </Button>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="icon"
            onClick={() =>
              setActiveTab((prev) => (prev === 'archived' ? 'all' : 'archived'))
            }
            aria-pressed={showArchived}
            aria-label={
              showArchived
                ? 'Show active menu items'
                : 'Show archived menu items'
            }
            title={
              showArchived ? 'Show active menu items' : 'Show archived items'
            }
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!showArchived && (
        <>
          <TabsContent value="all" className="mt-6">
            {view === 'grid' ? (
              <ItemGrid
                items={items}
                onEdit={onEdit}
                onArchive={onArchive}
                showCategory
              />
            ) : (
              <ItemList
                items={items}
                onEdit={onEdit}
                onArchive={onArchive}
                showCategory
              />
            )}
          </TabsContent>

          <TabsContent value="unavailable" className="mt-6 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Unavailable Items</h3>
                <p className="text-sm text-muted-foreground">
                  Items currently marked as unavailable.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('all')}
                className="self-start md:self-auto"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Back to All Items
              </Button>
            </div>

            {unavailableItems.length > 0 ? (
              renderItems(unavailableItems)
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/40 p-8 text-center text-sm text-muted-foreground">
                No unavailable menu items.
              </div>
            )}
          </TabsContent>

          {categories.map((category) => (
            <TabsContent key={category} value={category} className="mt-6">
              {renderItems(items.filter((i) => i.category === category))}
            </TabsContent>
          ))}
        </>
      )}

      <TabsContent value="archived" className="mt-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Archived Items</h3>
            <p className="text-sm text-muted-foreground">
              Restore menu items to make them available again.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('all')}
            className="self-start md:self-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Back to Active Items
          </Button>
        </div>
        {archivedLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : archivedItems && archivedItems.length > 0 ? (
          renderItems(archivedItems, 'archived')
        ) : (
          <div className="rounded-md border border-dashed border-muted-foreground/40 p-8 text-center text-sm text-muted-foreground">
            No archived menu items yet.
          </div>
        )}
      </TabsContent>

      <EditCategoryDialog
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onUpdated={handleCategoryUpdated}
      />

      <AlertDialog
        open={Boolean(hardDeleteTarget)}
        onOpenChange={(open) => {
          if (open) return;
          if (hardDeletingRef.current) return;
          setHardDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-semibold text-foreground">
                {hardDeleteTarget?.name || 'this item'}
              </span>{' '}
              from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setHardDeleteTarget(null)}
              disabled={hardDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                handleConfirmHardDelete();
              }}
              disabled={hardDeleting}
            >
              {hardDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
};

export default CategoryTabs;
