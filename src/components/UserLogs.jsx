import { useState, useEffect } from 'react';
import {
  FileText,
  ShieldAlert,
  UserCog,
  LogIn,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ActivityLogsCard from './user-logs/ActivityLogsCard';
import SecurityAlertsCard from './user-logs/SecurityAlertsCard';
import LogSummaryCard from './user-logs/LogSummaryCard';
import LogDetailsDialog from './user-logs/LogDetailsDialog';
import { useLogs } from '@/hooks/useLogs';
import { muteUserFor24Hours } from '@/lib/mutedUsers';

const DEMO_ALERTS_STORAGE_KEY = 'ui.demoSecurityAlerts';
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const buildDemoAlerts = () => {
  const now = Date.now();
  return [
    {
      id: 'demo-critical-1',
      type: 'critical',
      severity: 'critical',
      title: 'Privilege escalation detected',
      description: 'Admin permissions granted outside of approval flow.',
      source: 'Access Control',
      ip: '203.0.113.14',
      user: 'ops@technomart.local',
      code: 'SEC-102',
      count: 1,
      timestamp: new Date(now - 6 * 60_000).toISOString(),
    },
    {
      id: 'demo-critical-2',
      type: 'critical',
      severity: 'critical',
      title: 'Multiple failed MFA attempts',
      description: 'Repeated MFA failures for a privileged user account.',
      source: 'Auth Service',
      ip: '198.51.100.22',
      user: 'admin@technomart.local',
      code: 'AUTH-401',
      count: 7,
      timestamp: new Date(now - 28 * 60_000).toISOString(),
    },
    {
      id: 'demo-warning-1',
      type: 'warning',
      severity: 'warning',
      title: 'Password expiring soon',
      description: '3 user passwords will expire within 7 days.',
      source: 'User Directory',
      code: 'USR-204',
      count: 3,
      timestamp: new Date(now - 2 * 60 * 60_000).toISOString(),
    },
  ];
};

const loadDemoAlerts = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatMuteUntil = (timestamp) => {
  if (!timestamp) return '';
  try {
    const dt = new Date(timestamp);
    if (Number.isNaN(dt.getTime())) return String(timestamp);
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(timestamp);
  }
};

const extractAlertEmail = (alert) => {
  const candidates = [
    alert?.user,
    alert?.userEmail,
    alert?.actor,
    alert?.actorEmail,
    alert?.meta?.user,
    alert?.meta?.email,
    alert?.meta?.actor,
    alert?.details,
    alert?.description,
    alert?.title,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = String(candidate).match(EMAIL_REGEX);
    if (match?.[0]) return match[0];
  }
  return '';
};

const UserLogs = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogType, setSelectedLogType] = useState('all');
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedLog, setSelectedLog] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { logs, filters, setFilters, alerts, summary } = useLogs({
    timeRange: '24h',
    limit: 100,
  });
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState([]);
  const [demoAlerts, setDemoAlerts] = useState([]);
  const [useDemoAlerts, setUseDemoAlerts] = useState(false);

  useEffect(() => {
    const stored = loadDemoAlerts();
    if (stored.length > 0) {
      setDemoAlerts(stored);
      setUseDemoAlerts(true);
    }
  }, []);

  useEffect(() => {
    const sourceAlerts = useDemoAlerts ? demoAlerts : alerts;
    const nextAlerts = (sourceAlerts || [])
      .filter((alert) => !dismissedAlertIds.includes(alert.id))
      .map((alert) => {
        if (acknowledgedAlertIds.includes(alert.id)) {
          return { ...alert, status: 'acknowledged' };
        }
        return alert;
      });
    setSecurityAlerts(nextAlerts);
  }, [
    alerts,
    dismissedAlertIds,
    acknowledgedAlertIds,
    useDemoAlerts,
    demoAlerts,
  ]);

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

  const recordAcknowledgedAlert = (alertId) => {
    setAcknowledgedAlertIds((prev) =>
      prev.includes(alertId) ? prev : [...prev, alertId]
    );
  };

  const handleBlockIP = (alertId) => {
    toast.success('IP Address Blocked', {
      description: 'The suspicious IP address has been blocked successfully.',
    });
    recordDismissedAlert(alertId);
    setAcknowledgedAlertIds((prev) =>
      prev.filter((entry) => entry !== alertId)
    );
    setSecurityAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const handleDismissAlert = (alertId) => {
    recordDismissedAlert(alertId);
    setAcknowledgedAlertIds((prev) =>
      prev.filter((entry) => entry !== alertId)
    );
    setSecurityAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    toast.success('Alert Dismissed', {
      description: 'Security alert has been dismissed.',
    });
  };

  const handleAcknowledgeAlert = (alert) => {
    if (!alert?.id) return;
    recordAcknowledgedAlert(alert.id);
    setSecurityAlerts((prev) =>
      prev.map((entry) =>
        entry.id === alert.id ? { ...entry, status: 'acknowledged' } : entry
      )
    );
    toast.success('Alert Acknowledged', {
      description: 'Security alert marked as reviewed.',
    });
  };

  const handleInvestigateAlert = (alert) => {
    toast('Investigation Started', {
      description: `Investigation queued for ${alert?.title || 'this alert'}.`,
    });
  };

  const handleEscalateAlert = (alert) => {
    toast('Alert Escalated', {
      description: `Escalation created for ${alert?.title || 'this alert'}.`,
    });
  };

  const handleMuteAlert = (alert) => {
    const userEmail = extractAlertEmail(alert);
    if (!userEmail) return;
    const mutedUntil = muteUserFor24Hours(userEmail);
    setSecurityAlerts((prev) =>
      prev.map((entry) =>
        entry.id === alert?.id ? { ...entry, status: 'muted' } : entry
      )
    );
    toast.success('User Muted for 24 Hours', {
      description: mutedUntil
        ? `${userEmail} is muted until ${formatMuteUntil(mutedUntil)}.`
        : `${userEmail} is muted for 24 hours.`,
    });
  };

  const handleSeedDemoAlerts = () => {
    const seeded = buildDemoAlerts();
    setDemoAlerts(seeded);
    setUseDemoAlerts(true);
    setDismissedAlertIds([]);
    setAcknowledgedAlertIds([]);
    try {
      window.localStorage.setItem(
        DEMO_ALERTS_STORAGE_KEY,
        JSON.stringify(seeded)
      );
    } catch {}
    toast.success('Demo Alerts Seeded', {
      description: 'Security alerts are now using demo data.',
    });
  };

  const handleClearDemoAlerts = () => {
    setDemoAlerts([]);
    setUseDemoAlerts(false);
    setDismissedAlertIds([]);
    setAcknowledgedAlertIds([]);
    try {
      window.localStorage.removeItem(DEMO_ALERTS_STORAGE_KEY);
    } catch {}
    toast.success('Demo Alerts Cleared', {
      description: 'Security alerts returned to live data.',
    });
  };

  const handleRowClick = (log) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  return (
    <div className="grid w-full gap-4 max-w-[640px] sm:max-w-[720px] mx-auto md:mx-0 md:max-w-none lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
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

      <div className="space-y-4">
        <SecurityAlertsCard
          securityAlerts={securityAlerts}
          headerActions={
            useDemoAlerts ? (
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={handleClearDemoAlerts}
              >
                <Trash2 className="h-4 w-4" />
                Clear demo
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={handleSeedDemoAlerts}
              >
                <Sparkles className="h-4 w-4" />
                Seed demo data
              </Button>
            )
          }
          onBlockIP={handleBlockIP}
          onDismiss={handleDismissAlert}
          onAcknowledge={handleAcknowledgeAlert}
          onInvestigate={handleInvestigateAlert}
          onEscalate={handleEscalateAlert}
          onMute={handleMuteAlert}
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
