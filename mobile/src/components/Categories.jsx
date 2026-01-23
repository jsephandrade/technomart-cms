import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import CategoryItem from './CategoryItem';

const categories = [
  {
    id: '1',
    title: 'Combo Meals',
    image: require('../../assets/choices/combo.png'),
  },
  { id: '2', title: 'Meals', image: require('../../assets/choices/meals.png') },
  {
    id: '3',
    title: 'Snacks',
    image: require('../../assets/choices/snacks.png'),
  },
  {
    id: '4',
    title: 'Drinks',
    image: require('../../assets/choices/drinks.png'),
  },
];

export default function Categories() {
  return (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <CategoryItem
          image={item.image}
          title={item.title}
          onPress={() => alert(`Selected: ${item.title}`)}
        />
      )}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
});
