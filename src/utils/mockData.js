// Filipino menu items (NO images)
export const menuItems = [
  {
    id: '1',
    name: 'Bam-i',
    description:
      'A festive noodle dish with a combination of canton and bihon, pork, chicken, and vegetables.',
    price: 30,
    category: 'Noodles',
    available: true,
    popular: true,
  },
  {
    id: '2',
    name: 'Bihon',
    description: 'Stir-fried vermicelli rice noodles with vegetables and meat.',
    price: 20,
    category: 'Noodles',
    available: true,
    popular: true,
  },
  {
    id: '3',
    name: 'Beef loaf',
    description: 'Savory Filipino-style sandwich with beef loaf slices.',
    price: 15,
    category: 'Canned',
    available: true,
    popular: false,
  },
  {
    id: '4',
    name: 'Longganisa',
    description: 'Filipino sweet pork sausage, pan-fried to perfection.',
    price: 15,
    category: 'Main Dish',
    available: true,
    popular: false,
  },
  {
    id: '5',
    name: 'Ginaling',
    description:
      'Ground meat sautéed with vegetables, a Filipino classic viand.',
    price: 60,
    category: 'Main Dish',
    available: true,
    popular: true,
  },
  {
    id: '6',
    name: 'Menudo',
    description:
      'Pork and liver stew with potatoes, carrots, and tomato sauce.',
    price: 60,
    category: 'Main Dish',
    available: true,
    popular: true,
  },
  {
    id: '7',
    name: 'Monggos',
    description: 'Hearty mung bean stew with pork and leafy greens.',
    price: 20,
    category: 'Viand',
    available: true,
    popular: false,
  },
  {
    id: '8',
    name: 'Coke',
    description: 'Refreshing Coca-Cola soft drink.',
    price: 20,
    category: 'Drinks',
    available: true,
    popular: false,
  },
  {
    id: '9',
    name: 'Royal',
    description: 'Sweet Filipino orange soda.',
    price: 20,
    category: 'Drinks',
    available: true,
    popular: false,
  },
  {
    id: '10',
    name: 'Sprite',
    description: 'Lemon-lime flavored soda.',
    price: 20,
    category: 'Drinks',
    available: true,
    popular: false,
  },
];

// Adjust salesData to use new Filipino menu item names/ids:
export const salesData = [
  {
    id: '1',
    items: [
      { menuItemId: '1', menuItemName: 'Bam-i', quantity: 2, price: 30 },
      { menuItemId: '8', menuItemName: 'Coke', quantity: 1, price: 20 },
    ],
    total: 80,
    date: '2025-04-17T10:30:00',
    paymentMethod: 'card',
    employeeId: '1',
  },
  {
    id: '2',
    items: [
      { menuItemId: '5', menuItemName: 'Ginaling', quantity: 1, price: 60 },
      { menuItemId: '10', menuItemName: 'Sprite', quantity: 1, price: 20 },
    ],
    total: 80,
    date: '2025-04-17T12:45:00',
    paymentMethod: 'cash',
    employeeId: '2',
  },
  {
    id: '3',
    items: [
      { menuItemId: '6', menuItemName: 'Menudo', quantity: 2, price: 60 },
      { menuItemId: '9', menuItemName: 'Royal', quantity: 1, price: 20 },
    ],
    total: 140,
    date: '2025-04-17T13:15:00',
    paymentMethod: 'mobile',
    employeeId: '1',
  },
  {
    id: '4',
    items: [
      { menuItemId: '1', menuItemName: 'Bam-i', quantity: 1, price: 30 },
      { menuItemId: '8', menuItemName: 'Coke', quantity: 1, price: 20 },
      { menuItemId: '9', menuItemName: 'Royal', quantity: 1, price: 20 },
    ],
    total: 70,
    date: '2025-04-16T11:30:00',
    paymentMethod: 'card',
    employeeId: '3',
  },
  {
    id: '5',
    items: [
      { menuItemId: '5', menuItemName: 'Ginaling', quantity: 2, price: 60 },
    ],
    total: 120,
    date: '2025-04-16T14:20:00',
    paymentMethod: 'cash',
    employeeId: '2',
  },
];

export const employees = [
  {
    id: '1',
    name: 'John Smith',
    position: 'Manager',
    contact: 'john.smith@example.com',
    avatar: '/placeholder.svg',
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    position: 'Chef',
    contact: 'sarah.johnson@example.com',
    avatar: '/placeholder.svg',
  },
  {
    id: '3',
    name: 'Michael Brown',
    position: 'Cashier',
    contact: 'michael.brown@example.com',
    avatar: '/placeholder.svg',
  },
  {
    id: '4',
    name: 'Jessica Williams',
    position: 'Server',
    contact: 'jessica.williams@example.com',
    avatar: '/placeholder.svg',
  },
];

export const scheduleData = [
  {
    id: '1',
    employeeId: '1',
    employeeName: 'John Smith',
    day: 'Monday',
    startTime: '08:00',
    endTime: '16:00',
  },
  {
    id: '2',
    employeeId: '2',
    employeeName: 'Sarah Johnson',
    day: 'Monday',
    startTime: '10:00',
    endTime: '18:00',
  },
  {
    id: '3',
    employeeId: '3',
    employeeName: 'Michael Brown',
    day: 'Monday',
    startTime: '12:00',
    endTime: '20:00',
  },
  {
    id: '4',
    employeeId: '1',
    employeeName: 'John Smith',
    day: 'Tuesday',
    startTime: '08:00',
    endTime: '16:00',
  },
  {
    id: '5',
    employeeId: '2',
    employeeName: 'Sarah Johnson',
    day: 'Tuesday',
    startTime: '10:00',
    endTime: '18:00',
  },
  {
    id: '6',
    employeeId: '4',
    employeeName: 'Jessica Williams',
    day: 'Tuesday',
    startTime: '12:00',
    endTime: '20:00',
  },
];

export const feedbackData = [
  {
    id: '1',
    customerName: 'Alex Martin',
    rating: 5,
    comment: 'Great food and excellent service!',
    date: '2025-04-16T14:30:00',
    resolved: true,
  },
  {
    id: '2',
    customerName: 'Taylor Wilson',
    rating: 4,
    comment: 'Food was delicious, but the wait was a bit long.',
    date: '2025-04-16T12:15:00',
    resolved: false,
  },
  {
    id: '3',
    customerName: 'Jordan Lee',
    rating: 3,
    comment: 'Average experience. The salad could use more dressing.',
    date: '2025-04-15T13:45:00',
    resolved: false,
  },
  {
    id: '4',
    customerName: 'Casey Thompson',
    rating: 5,
    comment: "Best burger I've had in a long time!",
    date: '2025-04-15T15:20:00',
    resolved: true,
  },
];

export const dashboardStats = {
  dailySales: 27437.5, // Converted to Philippine Peso
  monthlySales: 781625.0, // Converted to Philippine Peso
  customerCount: 127,
  popularItems: [
    { name: 'Classic Burger', count: 42 },
    { name: 'Grilled Chicken Sandwich', count: 38 },
    { name: 'French Fries', count: 35 },
    { name: 'Chocolate Brownie', count: 28 },
  ],
  recentSales: salesData.slice(0, 3),
  salesByCategory: [
    { category: 'Main Course', amount: 427137.5 }, // Converted to Philippine Peso
    { category: 'Sides', amount: 117840.0 }, // Converted to Philippine Peso
    { category: 'Desserts', amount: 92262.5 }, // Converted to Philippine Peso
    { category: 'Beverages', amount: 87765.0 }, // Converted to Philippine Peso
    { category: 'Salads', amount: 56620.0 }, // Converted to Philippine Peso
  ],
  salesByTime: [
    { time: '8am-10am', amount: 42275.0 }, // Converted to Philippine Peso
    { time: '10am-12pm', amount: 87812.5 }, // Converted to Philippine Peso
    { time: '12pm-2pm', amount: 162737.5 }, // Converted to Philippine Peso
    { time: '2pm-4pm', amount: 96632.5 }, // Converted to Philippine Peso
    { time: '4pm-6pm', amount: 142265.0 }, // Converted to Philippine Peso
    { time: '6pm-8pm', amount: 249902.5 }, // Converted to Philippine Peso
  ],
};
