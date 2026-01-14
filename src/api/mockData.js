// Mock data for API responses
export const mockDashboardStats = {
  dailySales: 12450.75,
  monthlySales: 385692.5,
  monthlyExpenses: 254320.0,
  customerCount: 127,
  orderCount: 89,
  salesByTime: [
    { time: '8AM', amount: 850 },
    { time: '10AM', amount: 1250 },
    { time: '12PM', amount: 2100 },
    { time: '2PM', amount: 1800 },
    { time: '4PM', amount: 1650 },
    { time: '6PM', amount: 2350 },
  ],
  salesByCategory: [
    { category: 'Noodles', amount: 3200 },
    { category: 'Combo Meals', amount: 4100 },
    { category: 'Main Dish', amount: 2800 },
    { category: 'Drinks', amount: 1350 },
  ],
  popularItems: [
    { name: 'Bam-i', count: 45 },
    { name: 'Rice + Vegetable + Lumpia', count: 38 },
    { name: 'Ginaling', count: 32 },
    { name: 'Coke', count: 28 },
  ],
  recentSales: [
    { id: 'W-089', total: 85.5, date: new Date(), paymentMethod: 'cash' },
    {
      id: 'O-156',
      total: 120.0,
      date: new Date(Date.now() - 300000),
      paymentMethod: 'card',
    },
    {
      id: 'W-088',
      total: 65.75,
      date: new Date(Date.now() - 600000),
      paymentMethod: 'mobile',
    },
  ],
};

export const mockUsers = [];

// mockMenuItems removed — menu items now always come from backend DB

export const mockInventoryItems = [
  {
    id: '1',
    name: 'Canton Noodles',
    category: 'Ingredients',
    quantity: 50,
    unit: 'packs',
    minStock: 10,
    supplier: 'Local Supplier Inc.',
    lastRestocked: '2024-01-25T00:00:00Z',
    expiryDate: '2024-03-15T00:00:00Z',
  },
  {
    id: '2',
    name: 'Ground Pork',
    category: 'Meat',
    quantity: 25,
    unit: 'kg',
    minStock: 5,
    supplier: 'Fresh Meat Co.',
    lastRestocked: '2024-01-28T00:00:00Z',
    expiryDate: '2024-02-01T00:00:00Z',
  },
];

export const mockOrders = [
  {
    id: '1001',
    orderNumber: 'W-001',
    type: 'walk-in',
    status: 'pending',
    items: [
      { id: 'oi1', menuItemId: '1', name: 'Bam-i', price: 30, quantity: 2 },
      {
        id: 'oi2',
        menuItemId: '4',
        name: 'Longganisa',
        price: 15,
        quantity: 1,
      },
    ],
    subtotal: 75,
    discount: 0,
    total: 75,
    paymentMethod: null,
    timeReceived: new Date(Date.now() - 5 * 60 * 1000),
    timeCompleted: null,
    customerName: null,
  },
];

export const mockEmployees = [
  {
    id: '1',
    name: 'Maria Santos',
    position: 'Kitchen Staff',
    email: 'maria@example.com',
    phone: '+63-912-345-6789',
    hireDate: '2023-08-15T00:00:00Z',
    status: 'active',
  },
];

export const mockSchedule = [
  {
    id: '1',
    employeeId: '1',
    employeeName: 'Maria Santos',
    date: '2024-01-29',
    shift: 'morning',
    startTime: '06:00',
    endTime: '14:00',
    status: 'scheduled',
  },
];

export const mockCateringOrders = [
  {
    id: '1',
    eventName: 'Company Meeting',
    eventDate: '2024-02-05T10:00:00Z',
    eventLocation: 'Conference Room A',
    clientName: 'Tech Corp',
    clientEmail: 'events@techcorp.com',
    guestCount: 25,
    status: 'confirmed',
    items: [
      {
        menuItemId: '11',
        name: 'Rice + Vegetable + Lumpia',
        quantity: 25,
        price: 45,
      },
    ],
    total: 1125,
    notes: 'Vegetarian options required for 5 guests',
  },
];

export const mockFeedback = [
  {
    id: '1',
    customerName: 'Juan Dela Cruz',
    rating: 5,
    comment: 'Excellent food and service!',
    orderNumber: 'W-045',
    category: 'food_quality',
    status: 'new',
    createdAt: '2024-01-29T12:30:00Z',
  },
];

export const mockSalesAnalytics = {
  totalRevenue: 385692.5,
  totalOrders: 2847,
  averageOrderValue: 135.42,
  topSellingItems: [
    { name: 'Bam-i', quantity: 345, revenue: 10350 },
    { name: 'Rice + Vegetable + Lumpia', quantity: 298, revenue: 13410 },
  ],
  dailySales: [
    { date: '2024-01-22', revenue: 12450, orders: 89 },
    { date: '2024-01-23', revenue: 13200, orders: 94 },
    { date: '2024-01-24', revenue: 11800, orders: 82 },
  ],
};

export const mockNotifications = [
  {
    id: '1',
    type: 'low_stock',
    title: 'Low Stock Alert',
    message: 'Canton Noodles stock is running low (8 packs remaining)',
    isRead: false,
    createdAt: '2024-01-29T08:00:00Z',
    priority: 'high',
  },
  {
    id: '2',
    type: 'new_order',
    title: 'New Online Order',
    message: 'Order O-157 received from Maria Santos',
    isRead: false,
    createdAt: '2024-01-29T10:15:00Z',
    priority: 'medium',
  },
];

export const mockPayments = [
  {
    id: '1',
    orderId: 'W-089',
    amount: 85.5,
    method: 'cash',
    status: 'completed',
    timestamp: '2024-01-29T11:30:00Z',
    reference: null,
  },
  {
    id: '2',
    orderId: 'O-156',
    amount: 120.0,
    method: 'card',
    status: 'completed',
    timestamp: '2024-01-29T11:25:00Z',
    reference: 'TXN-456789',
  },
];
