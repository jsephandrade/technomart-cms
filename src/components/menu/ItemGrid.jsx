// src/components/menu/ItemGrid.jsx
import React from 'react';
import ItemCard from './ItemCard';

const ItemGrid = ({
  items = [],
  onEdit,
  onArchive = () => {},
  onRestore = () => {},
  onHardDeleteRequest,
  mode = 'active',
  showCategory = false,
  density = 'comfortable',
}) => {
  const isCompact = density === 'compact';
  return (
    <div
      className={`grid grid-cols-1 ${
        isCompact
          ? 'gap-2 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 md:gap-2 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5 2xl:grid-cols-6'
          : 'gap-3 sm:grid-cols-2 sm:gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5 2xl:grid-cols-6'
      }`}
    >
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={showCategory ? item : { ...item }}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
          onHardDeleteRequest={onHardDeleteRequest}
          mode={mode}
          density={density}
        />
      ))}
    </div>
  );
};

export default ItemGrid;
