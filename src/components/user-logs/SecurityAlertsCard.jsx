import React, { useMemo } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  BellOff,
  CheckCircle2,
  ChevronDown,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

const resolveSeverity = (alert) => {
  const raw = String(alert?.severity || alert?.type || '').toLowerCase();
  const normalized = raw || 'info';
  if (['critical', 'high', 'urgent'].includes(normalized)) {
    return {
      key: normalized === 'high' ? 'high' : 'critical',
      label: normalized === 'high' ? 'High' : 'Critical',
      badgeClass: 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200/70',
      containerClass: 'border-red-200/80 bg-red-50/70',
      iconClass: 'text-red-600',
      icon: ShieldAlert,
      level: 3,
    };
  }
  if (['warning', 'warn', 'medium'].includes(normalized)) {
    return {
      key: 'warning',
      label: 'Warning',
      badgeClass:
        'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70',
      containerClass: 'border-amber-200/80 bg-amber-50/70',
      iconClass: 'text-amber-600',
      icon: AlertTriangle,
      level: 2,
    };
  }
  return {
    key: 'info',
    label: 'Info',
    badgeClass:
      'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200/70',
    containerClass: 'border-slate-200/80 bg-slate-50/70',
    iconClass: 'text-slate-600',
    icon: ShieldCheck,
    level: 1,
  };
};

const resolveStatus = (alert) => {
  const raw = String(alert?.status || alert?.state || '').toLowerCase();
  if (['acknowledged', 'ack', 'resolved'].includes(raw)) {
    return {
      key: 'acknowledged',
      label: 'Acknowledged',
      badgeClass:
        'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200/70',
    };
  }
  if (['muted', 'snoozed'].includes(raw)) {
    return {
      key: 'muted',
      label: 'Muted',
      badgeClass:
        'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/70',
    };
  }
  return null;
};

const formatTimestamp = (value) => {
  if (!value) return '';
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const SecurityAlertsCard = ({
  securityAlerts,
  onBlockIP,
  onDismiss,
  onAcknowledge,
  onInvestigate,
  onEscalate,
  onMute,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const MAX_VISIBLE_ALERTS = 10;

  const normalizedAlerts = useMemo(() => {
    const list = Array.isArray(securityAlerts) ? securityAlerts : [];
    return list.map((alert) => ({
      ...alert,
      severity: alert?.severity || alert?.type || 'info',
      status: alert?.status || alert?.state || '',
    }));
  }, [securityAlerts]);

  const safeAlerts = Array.isArray(securityAlerts) ? securityAlerts : [];
  const hasMoreAlerts = safeAlerts.length > MAX_VISIBLE_ALERTS;
  const displayedAlerts =
    !hasMoreAlerts || isExpanded
      ? normalizedAlerts
      : normalizedAlerts.slice(0, MAX_VISIBLE_ALERTS);
  const displayedCount = displayedAlerts.length;

  return (
    <FeaturePanelCard
      className="w-full"
      title="Security Alerts"
      titleStyle="accent"
      titleIcon={ShieldAlert}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Important security notifications"
      contentClassName="space-y-4"
    >
      <div
        className="relative w-full overflow-hidden transition-[max-height] duration-500 ease-in-out"
        style={{ maxHeight: isExpanded ? '60rem' : '28rem' }}
      >
        <div className="space-y-3">
          {displayedAlerts.length > 0 ? (
            displayedAlerts.map((alert) => {
              const severity = resolveSeverity(alert);
              const status = resolveStatus(alert);
              const Icon = severity.icon;
              const isAcknowledged = status?.key === 'acknowledged';
              const meta = [
                {
                  label: 'Source',
                  value:
                    alert.source ||
                    alert.module ||
                    alert.category ||
                    alert?.meta?.source ||
                    '',
                },
                {
                  label: 'IP',
                  value: alert.ip || alert.ipAddress || alert?.meta?.ip || '',
                },
                {
                  label: 'User',
                  value:
                    alert.user ||
                    alert.userEmail ||
                    alert.actor ||
                    alert?.meta?.user ||
                    '',
                },
                {
                  label: 'When',
                  value: formatTimestamp(
                    alert.timestamp ||
                      alert.time ||
                      alert.createdAt ||
                      alert?.meta?.timestamp
                  ),
                },
                {
                  label: 'Occurrences',
                  value:
                    alert.count ||
                    alert.occurrences ||
                    alert?.meta?.count ||
                    '',
                },
              ].filter((entry) => entry.value);

              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-4 ${severity.containerClass}`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={`rounded-lg border border-white/40 bg-white/70 p-2 ${severity.iconClass}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${severity.badgeClass}`}
                            >
                              {severity.label}
                            </span>
                            {status ? (
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${status.badgeClass}`}
                              >
                                {status.label}
                              </span>
                            ) : null}
                            {alert.code ? (
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border/60">
                                {alert.code}
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">
                              {alert.title || 'Security alert'}
                            </h4>
                            {alert.description ? (
                              <p className="text-sm text-muted-foreground">
                                {alert.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isAcknowledged ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled
                            aria-label="Acknowledged"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            <span className="hidden lg:inline">
                              Acknowledged
                            </span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAcknowledge?.(alert)}
                            aria-label="Acknowledge"
                          >
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            <span className="hidden lg:inline">
                              Acknowledge
                            </span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDismiss?.(alert.id)}
                          aria-label="Dismiss"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          <span className="hidden lg:inline">Dismiss</span>
                        </Button>
                      </div>
                    </div>

                    {meta.length > 0 ? (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {meta.map((entry) => (
                          <span
                            key={`${alert.id}-${entry.label}`}
                            className="rounded-full bg-white/70 px-2 py-1 ring-1 ring-inset ring-border/60"
                          >
                            {entry.label}: {entry.value}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {severity.level >= 2 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onInvestigate?.(alert)}
                          aria-label="Investigate"
                        >
                          <Search className="mr-2 h-4 w-4" />
                          <span className="hidden lg:inline">Investigate</span>
                        </Button>
                      ) : null}
                      {severity.level >= 3 ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => onEscalate?.(alert)}
                          aria-label="Escalate"
                        >
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          <span className="hidden lg:inline">Escalate</span>
                        </Button>
                      ) : null}
                      {severity.level >= 3 ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onBlockIP?.(alert.id)}
                          aria-label="Block IP"
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          <span className="hidden lg:inline">Block IP</span>
                        </Button>
                      ) : null}
                      {severity.level >= 2 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onMute?.(alert)}
                          aria-label="Mute 24h"
                        >
                          <BellOff className="mr-2 h-4 w-4" />
                          <span className="hidden lg:inline">Mute 24h</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No security alerts. All clear!
            </div>
          )}
        </div>
        {hasMoreAlerts && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background via-background/80 to-transparent" />
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {displayedCount} of {safeAlerts.length} security alerts
      </div>

      {hasMoreAlerts && (
        <div className="flex justify-start md:justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="group flex items-center gap-1"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? 'Collapse security alerts' : 'Expand security alerts'
            }
          >
            <span className="text-sm font-medium">
              {isExpanded ? 'Show Less' : 'Show All Alerts'}
            </span>
            <span className="rounded-full border border-border bg-background p-1 transition-transform duration-300 ease-in-out group-hover:translate-y-0.5">
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </span>
          </Button>
        </div>
      )}
    </FeaturePanelCard>
  );
};

export default SecurityAlertsCard;
