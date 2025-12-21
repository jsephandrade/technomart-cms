import React from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogIn, UserCog, ShieldAlert, Settings, BarChart } from 'lucide-react';

const StatBox = ({ icon: Icon, label, value, color }) => (
  <div className="rounded-lg border p-3 flex flex-col items-center">
    <Icon className={`h-8 w-8 mb-1 ${color}`} />
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const LogSummaryCard = ({ summary }) => {
  const today = summary?.today || {
    login: 0,
    action: 0,
    security: 0,
    system: 0,
  };
  const week = summary?.week || today;
  const month = summary?.month || week;
  return (
    <FeaturePanelCard
      className="w-full"
      title="Log Summary"
      titleStyle="accent"
      titleIcon={BarChart}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Activity overview"
      contentClassName="pt-2"
    >
      <Tabs defaultValue="today">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="month">This Month</TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <StatBox
                icon={LogIn}
                label="Logins"
                value={today.login}
                color="text-blue-500"
              />
              <StatBox
                icon={UserCog}
                label="Actions"
                value={today.action}
                color="text-green-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <StatBox
                icon={ShieldAlert}
                label="Security"
                value={today.security}
                color="text-red-500"
              />
              <StatBox
                icon={Settings}
                label="System"
                value={today.system}
                color="text-gray-500"
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="week" className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              icon={LogIn}
              label="Logins"
              value={week.login}
              color="text-blue-500"
            />
            <StatBox
              icon={UserCog}
              label="Actions"
              value={week.action}
              color="text-green-500"
            />
            <StatBox
              icon={ShieldAlert}
              label="Security"
              value={week.security}
              color="text-red-500"
            />
            <StatBox
              icon={Settings}
              label="System"
              value={week.system}
              color="text-gray-500"
            />
          </div>
        </TabsContent>
        <TabsContent value="month" className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              icon={LogIn}
              label="Logins"
              value={month.login}
              color="text-blue-500"
            />
            <StatBox
              icon={UserCog}
              label="Actions"
              value={month.action}
              color="text-green-500"
            />
            <StatBox
              icon={ShieldAlert}
              label="Security"
              value={month.security}
              color="text-red-500"
            />
            <StatBox
              icon={Settings}
              label="System"
              value={month.system}
              color="text-gray-500"
            />
          </div>
        </TabsContent>
      </Tabs>
    </FeaturePanelCard>
  );
};

export default LogSummaryCard;
