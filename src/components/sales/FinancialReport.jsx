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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const FinancialReport = ({
  dailySalesData,
  monthlyComparison,
  peakHoursData,
}) => {
  const generateFinancialReport = () => {
    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString();

    // Header
    doc.setFontSize(20);
    doc.text('Financial Analytics Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${currentDate}`, 20, 30);

    // Financial Summary
    doc.setFontSize(16);
    doc.text('Financial Summary', 20, 50);

    const totalSales = dailySalesData.reduce(
      (acc, sale) => acc + sale.total,
      0
    );
    const totalOrders = dailySalesData.length;
    const avgOrderValue = totalSales / totalOrders;

    doc.setFontSize(12);
    doc.text(`Total Sales: ₱${totalSales.toFixed(2)}`, 20, 65);
    doc.text(`Total Orders: ${totalOrders}`, 20, 75);
    doc.text(`Average Order Value: ₱${avgOrderValue.toFixed(2)}`, 20, 85);
    doc.text(`Monthly Growth: +23%`, 20, 95);

    // Daily Sales Table
    doc.text('Daily Sales Breakdown', 20, 115);
    const dailySalesTable = dailySalesData.map((item) => [
      item.date,
      `₱${item.total.toFixed(2)}`,
    ]);

    doc.autoTable({
      startY: 125,
      head: [['Date', 'Sales Amount']],
      body: dailySalesTable,
    });

    doc.save('financial-analytics-report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Financial Analytics</h3>
        <Button onClick={generateFinancialReport} className="gap-2">
          <Download className="h-4 w-4" />
          Generate PDF Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales</CardTitle>
            <CardDescription>Sales data for the last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailySalesData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--chart-primary))"
                  activeDot={{
                    r: 8,
                  }}
                  name="Sales (₱)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Performance</CardTitle>
            <CardDescription>6-month sales and order trends</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlyComparison}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="hsl(var(--chart-primary))"
                  strokeWidth={2}
                  name="Sales (₱)"
                />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  name="Total Orders"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Peak Hours Analysis</CardTitle>
          <CardDescription>Busiest times and revenue patterns</CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={peakHoursData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="hsl(var(--chart-primary))"
                strokeWidth={2}
                name="Sales (₱)"
              />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="hsl(var(--secondary))"
                strokeWidth={2}
                name="Orders"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialReport;
