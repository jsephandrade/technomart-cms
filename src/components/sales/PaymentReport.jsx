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
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const COLORS = ['#0088fe', '#00c49f', '#ffbb28', '#ff8042'];

const PaymentReport = ({ paymentMethodData, payments }) => {
  const getTotalAmount = (status = 'all') => {
    return payments
      .filter((payment) => status === 'all' || payment.status === status)
      .reduce((total, payment) => {
        if (payment.status === 'refunded') return total;
        return total + payment.amount;
      }, 0)
      .toFixed(2);
  };

  const generatePaymentReport = () => {
    const doc = new jsPDF();
    const currentDate = new Date().toLocaleDateString();

    // Header
    doc.setFontSize(20);
    doc.text('Payment Analytics Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${currentDate}`, 20, 30);

    // Payment Summary
    doc.setFontSize(16);
    doc.text('Payment Method Summary', 20, 50);

    const mostPopular = paymentMethodData[0];
    const digitalPayments =
      (paymentMethodData.find((p) => p.name === 'Card')?.value || 0) +
      (paymentMethodData.find((p) => p.name === 'Mobile')?.value || 0);
    const totalPayments = paymentMethodData.reduce(
      (acc, p) => acc + p.value,
      0
    );
    const digitalPercentage = Math.round(
      (digitalPayments / totalPayments) * 100
    );
    const cashPercentage = Math.round(
      ((paymentMethodData.find((p) => p.name === 'Cash')?.value || 0) /
        totalPayments) *
        100
    );

    doc.setFontSize(12);
    doc.text(`Most Popular: ${mostPopular?.name}`, 20, 65);
    doc.text(`Total: ₱${mostPopular?.value.toFixed(2)}`, 20, 75);
    doc.text(`Digital Payments: ${digitalPercentage}%`, 20, 85);
    doc.text(`Cash Transactions: ${cashPercentage}%`, 20, 95);

    // Payment Breakdown Table
    doc.text('Payment Method Breakdown', 20, 115);
    const paymentTable = paymentMethodData.map((item) => [
      item.name,
      `₱${item.value.toFixed(2)}`,
      `${Math.round((item.value / totalPayments) * 100)}%`,
    ]);

    doc.autoTable({
      startY: 125,
      head: [['Payment Method', 'Amount', 'Percentage']],
      body: paymentTable,
    });

    doc.save('payment-analytics-report.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Payment Analytics</h3>
        <Button onClick={generatePaymentReport} className="gap-2">
          <Download className="h-4 w-4" />
          Generate PDF Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Payment Method Distribution</CardTitle>
            <CardDescription>How customers prefer to pay</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentMethodData}
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
                  {paymentMethodData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
            <CardDescription>
              Total transactions and amounts by status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="font-medium">Completed Payments</span>
                <span className="text-green-600 font-bold">
                  ₱{getTotalAmount('completed')}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="font-medium">Failed Payments</span>
                <span className="text-red-600 font-bold">
                  ₱{getTotalAmount('failed')}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="font-medium">Refunded Payments</span>
                <span className="text-orange-600 font-bold">
                  ₱{getTotalAmount('refunded')}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border-t-2 border-primary/20">
                <span className="font-bold">Total Revenue</span>
                <span className="text-primary font-bold text-lg">
                  ₱{getTotalAmount('all')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentReport;
