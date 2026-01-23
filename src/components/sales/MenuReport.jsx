import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const COLORS = ['#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8884d8'];

const MenuReport = ({
  topSellingItemsData,
  lowestSellingItemsData,
  menuItems,
}) => {
  const generateMenuReport = () => {
    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString();

    // Header
    doc.setFontSize(20);
    doc.text('Menu Analytics Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${currentDate}`, 20, 30);

    // Menu Performance Summary
    doc.setFontSize(16);
    doc.text('Menu Performance Summary', 20, 50);

    doc.setFontSize(12);
    doc.text(`Best Performer: ${topSellingItemsData[0]?.name}`, 20, 65);
    doc.text(`Revenue: ₱${topSellingItemsData[0]?.value.toFixed(2)}`, 20, 75);
    doc.text(`Needs Attention: ${lowestSellingItemsData[0]?.name}`, 20, 85);
    doc.text(`Total Menu Items: ${menuItems.length}`, 20, 95);

    // Top Selling Items Table
    doc.text('Top Selling Items', 20, 115);
    const topItemsTable = topSellingItemsData.map((item) => [
      item.name,
      `₱${item.value.toFixed(2)}`,
    ]);

    doc.autoTable({
      startY: 125,
      head: [['Item Name', 'Revenue']],
      body: topItemsTable,
    });

    // Lowest Selling Items Table
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.text('Lowest Selling Items', 20, finalY);
    const lowestItemsTable = lowestSellingItemsData.map((item) => [
      item.name,
      `₱${item.value.toFixed(2)}`,
    ]);

    doc.autoTable({
      startY: finalY + 10,
      head: [['Item Name', 'Revenue']],
      body: lowestItemsTable,
    });

    doc.save('menu-analytics-report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Menu Analytics</h3>
        <Button onClick={generateMenuReport} className="gap-2">
          <Download className="h-4 w-4" />
          Generate PDF Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Items</CardTitle>
            <CardDescription>
              Best performing menu items by revenue
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topSellingItemsData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="value"
                  fill="hsl(var(--chart-primary))"
                  name="Revenue (₱)"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menu Item Distribution</CardTitle>
            <CardDescription>
              Revenue distribution across top items
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topSellingItemsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {topSellingItemsData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items Needing Attention</CardTitle>
          <CardDescription>
            Lowest performing menu items that may need promotion or review
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={lowestSellingItemsData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="value"
                fill="hsl(var(--destructive))"
                name="Revenue (₱)"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default MenuReport;
