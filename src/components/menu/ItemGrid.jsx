// src/components/menu/ItemGrid.jsx
import React from 'react';
import ItemCard from './ItemCard';

const ItemGrid = ({
  items = [],
  allItems = [],
  onEdit,
  onArchive = () => {},
  onRestore = () => {},
  onHardDeleteRequest,
  mode = 'active',
  showCategory = false,
}) => {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 sm:gap-2 lg:gap-4">
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={showCategory ? item : { ...item }}
          allItems={allItems}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
          onHardDeleteRequest={onHardDeleteRequest}
          mode={mode}
        />
      ))}
    </div>
  );
};

export default ItemGrid;
