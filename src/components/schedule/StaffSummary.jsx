import React from 'react';
import { Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  formatPhp,
  resolveEmployeeCompensation,
} from '@/lib/employeeCompensation';

export const StaffSummary = ({ employees, schedule }) => {
  const calculateWeeklyHours = (employeeId) => {
    const employeeSchedule = schedule.filter(
      (s) => s.employeeId === employeeId
    );

    return employeeSchedule.reduce((total, entry) => {
      const start = new Date(`2023-01-01 ${entry.startTime}`);
      const end = new Date(`2023-01-01 ${entry.endTime}`);
      const hours = (end - start) / (1000 * 60 * 60);
      return total + hours;
    }, 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Summary</CardTitle>
        <CardDescription>Employee overview and weekly hours</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {employees.map((employee) => {
            const weeklyHours = calculateWeeklyHours(employee.id);
            const { monthlySalary, dailyRate } =
              resolveEmployeeCompensation(employee);
            return (
              <div
                key={employee.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {employee.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{employee.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {employee.position}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {weeklyHours.toFixed(1)}h/week
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatPhp(monthlySalary)} / mo
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatPhp(dailyRate, { maximumFractionDigits: 2 })} / day
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
