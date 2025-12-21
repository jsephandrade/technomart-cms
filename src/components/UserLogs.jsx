import { useState, useEffect } from 'react';
import { FileText, ShieldAlert, UserCog, LogIn, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ActivityLogsCard from './user-logs/ActivityLogsCard';
import SecurityAlertsCard from './user-logs/SecurityAlertsCard';
import LogSummaryCard from './user-logs/LogSummaryCard';
import LogDetailsDialog from './user-logs/LogDetailsDialog';
import { useLogs } from '@/hooks/useLogs';

const UserLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogType, setSelectedLogType] = useState('all');
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const { logs, filters, setFilters, alerts, summary } = useLogs({
    timeRange: '24h',
    limit: 100,
  });
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);

  useEffect(() => {
    const nextAlerts = (alerts || []).filter(
      (alert) => !dismissedAlertIds.includes(alert.id)
    );
    setSecurityAlerts(nextAlerts);
  }, [alerts, dismissedAlertIds]);

  // Sync UI controls to backend filters
  useEffect(() => {
    setFilters({
      ...filters,
      type: selectedLogType === 'all' ? '' : selectedLogType,
      timeRange,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLogType, timeRange]);

  useEffect(() => {
    const h = setTimeout(
      () => setFilters({ ...filters, search: searchTerm }),
      300
    );
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const getActionIcon = (type) => {
    switch (type) {
      case 'login':
        return <LogIn className="h-4 w-4" />;
      case 'security':
        return <ShieldAlert className="h-4 w-4" />;
      case 'system':
        return <Settings className="h-4 w-4" />;
      case 'action':
        return <UserCog className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getActionColor = (type) => {
    switch (type) {
      case 'login':
        return 'bg-blue-100 text-blue-800';
      case 'security':
        return 'bg-red-100 text-red-800';
      case 'system':
        return 'bg-gray-100 text-gray-800';
      case 'action':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const recordDismissedAlert = (alertId) => {
    setDismissedAlertIds((prev) =>
      prev.includes(alertId) ? prev : [...prev, alertId]
    );
  };

  const handleBlockIP = (alertId) => {
    toast({
      title: 'IP Address Blocked',
      description: 'The suspicious IP address has been blocked successfully.',
    });
    recordDismissedAlert(alertId);
    setSecurityAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const handleDismissAlert = (alertId) => {
    recordDismissedAlert(alertId);
    setSecurityAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    toast({
      title: 'Alert Dismissed',
      description: 'Security alert has been dismissed.',
    });
  };

  const handleRowClick = (log) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  return (
    <div className="grid w-full gap-4 max-w-[640px] sm:max-w-[720px] mx-auto md:mx-0 md:max-w-none md:grid-cols-3">
      <div className="space-y-4 md:col-span-2">
        <ActivityLogsCard
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedLogType={selectedLogType}
          setSelectedLogType={setSelectedLogType}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          logs={logs.map((l) => ({
            ...l,
            timestamp:
              typeof l.timestamp === 'string'
                ? l.timestamp
                : new Date(l.timestamp).toLocaleString(),
          }))}
          onRowClick={handleRowClick}
          getActionIcon={getActionIcon}
          getActionColor={getActionColor}
        />
      </div>

      <div className="space-y-4 md:col-span-1">
        <SecurityAlertsCard
          securityAlerts={securityAlerts}
          onBlockIP={handleBlockIP}
          onDismiss={handleDismissAlert}
        />

        <LogSummaryCard summary={summary} />
      </div>

      <LogDetailsDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        selectedLog={selectedLog}
        getActionIcon={getActionIcon}
        getActionColor={getActionColor}
      />
    </div>
  );
};

export default UserLogs;
