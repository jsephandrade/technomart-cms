// src/hooks/useMenuManager.js
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { menuItems } from '@/utils/mockData';
import { comboMeals } from '@/data/comboMeals';

export default function useMenuManager() {
  const [items, setItems] = useState(() => [...menuItems, ...comboMeals]);

  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: 0,
    category: '',
    available: true,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))),
    [items]
  );

  const handleAddItem = () => {
    if (!newItem.name || !newItem.description || !newItem.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    const itemToAdd = {
      ...newItem,
      id: `P${items.length + 1}`,
      price: Number(newItem.price),
      available: newItem.available ?? true,
    };

    setItems((prev) => [...prev, itemToAdd]);
    setNewItem({
      name: '',
      description: '',
      price: 0,
      category: '',
      available: true,
    });
    setDialogOpen(false);
    toast.success('Menu item added successfully');
  };

  const handleEditItem = () => {
    if (!editingItem) return;

    setItems((prev) =>
      prev.map((item) => (item.id === editingItem.id ? editingItem : item))
    );
    setEditingItem(null);
    toast.success('Menu item updated successfully');
  };

  const handleDeleteItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    toast.success('Menu item deleted successfully');
  };

  return {
    items,
    categories,
    newItem,
    setNewItem,
    dialogOpen,
    setDialogOpen,
    editingItem,
    setEditingItem,
    handleAddItem,
    handleEditItem,
    handleDeleteItem,
  };
}
