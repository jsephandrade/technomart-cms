import React, { useMemo } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  BellOff,
  CheckCircle2,
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const resolveAlertUser = (alert) => {
  const raw =
    alert?.user ||
    alert?.userEmail ||
    alert?.actor ||
    alert?.actorEmail ||
    alert?.meta?.user ||
    alert?.meta?.email ||
    alert?.meta?.actor ||
    '';
  if (raw) return raw;
  const fallback =
    alert?.details || alert?.description || alert?.title || alert?.action || '';
  const match = String(fallback).match(EMAIL_REGEX);
  return match?.[0] || '';
};

const normalizeUserForSeverity = (value, severityLevel) => {
  if (!value) return value;
  if (severityLevel < 2) return value;
  const raw = String(value).trim();
  const match = raw.match(/email=([^,;\s]+)/i);
  if (match?.[1]) return match[1];
  if (raw.toLowerCase().startsWith('email=')) {
    return raw.slice(6).trim();
  }
  return value;
};

const resolveStatusKey = (alert) => {
  const raw = String(alert?.status || alert?.state || '').toLowerCase();
  if (['muted', 'snoozed'].includes(raw)) return 'muted';
  if (['acknowledged', 'ack', 'resolved'].includes(raw)) {
    return 'acknowledged';
  }
  return '';
};

const getAlertTimestamp = (alert) => {
  const value =
    alert?.timestamp ||
    alert?.time ||
    alert?.createdAt ||
    alert?.created_at ||
    alert?.meta?.timestamp;
  if (!value) return 0;
  const dt = new Date(value);
  const time = dt.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const buildAlertGroupKey = (severityKey, userValue, titleValue) => {
  const userKey = String(userValue || 'unknown')
    .trim()
    .toLowerCase();
  const titleKey = String(titleValue || 'security alert')
    .trim()
    .toLowerCase();
  return `${severityKey}:${userKey}:${titleKey}`;
};

const SecurityAlertsCard = ({
  securityAlerts,
  onBlockIP,
  onDismiss,
  onAcknowledge,
  onEscalate,
  onMute,
  headerActions,
}) => {
  const normalizedAlerts = useMemo(() => {
    const list = Array.isArray(securityAlerts) ? securityAlerts : [];
    return list.map((alert) => ({
      ...alert,
      severity: alert?.severity || alert?.type || 'info',
      status: alert?.status || alert?.state || '',
    }));
  }, [securityAlerts]);

  const groupedAlerts = useMemo(() => {
    const groups = new Map();
    const ordered = [];

    normalizedAlerts.forEach((alert) => {
      const severity = resolveSeverity(alert);
      const userValue = resolveAlertUser(alert);
      const titleValue =
        alert?.title || alert?.action || alert?.code || 'Security alert';
      const key = buildAlertGroupKey(severity.key, userValue, titleValue);
      let group = groups.get(key);

      if (!group) {
        group = {
          key,
          baseAlert: alert,
          count: 0,
          latestTs: getAlertTimestamp(alert),
          hasMuted: false,
          hasAcknowledged: false,
        };
        groups.set(key, group);
        ordered.push(group);
      }

      group.count += 1;
      const statusKey = resolveStatusKey(alert);
      if (statusKey === 'muted') {
        group.hasMuted = true;
      }
      if (statusKey === 'acknowledged') {
        group.hasAcknowledged = true;
      }

      const ts = getAlertTimestamp(alert);
      if (ts > group.latestTs) {
        group.latestTs = ts;
        group.baseAlert = alert;
      }
    });

    return ordered.map((group) => {
      const statusKey = group.hasMuted
        ? 'muted'
        : group.hasAcknowledged
          ? 'acknowledged'
          : resolveStatusKey(group.baseAlert);
      return {
        ...group.baseAlert,
        status: statusKey || group.baseAlert.status || '',
        groupCount: group.count,
      };
    });
  }, [normalizedAlerts]);

  const displayedAlerts = groupedAlerts;
  const displayedCount = displayedAlerts.length;

  return (
    <FeaturePanelCard
      className="w-full shadow-none hover:shadow-none lg:shadow-sm lg:hover:shadow-md"
      title="Security Alerts"
      titleStyle="accent"
      titleIcon={ShieldAlert}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Important security notifications"
      headerActions={headerActions}
      decorClassName="hidden lg:block"
      contentClassName="space-y-4"
    >
      <div className="relative w-full max-h-[28rem] overflow-y-auto scrollbar-hide">
        <div className="space-y-3">
          {displayedAlerts.length > 0 ? (
            displayedAlerts.map((alert) => {
              const severity = resolveSeverity(alert);
              const status = resolveStatus(alert);
              const Icon = severity.icon;
              const isAcknowledged = status?.key === 'acknowledged';
              const userValue = resolveAlertUser(alert);
              const groupCount = alert.groupCount || 1;
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
                  value: normalizeUserForSeverity(userValue, severity.level),
                },
                {
                  label: 'When',
                  value: formatTimestamp(
                    alert.timestamp ||
                      alert.time ||
                      alert.createdAt ||
                      alert.created_at ||
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
                            {groupCount > 1 ? (
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
                                {groupCount}
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">
                              {alert.title || 'Security alert'}
                            </h4>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isAcknowledged ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled
                            aria-label="Acknowledged"
                            className="bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100 disabled:bg-emerald-600 disabled:text-white"
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
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {displayedCount} security alerts
      </div>
    </FeaturePanelCard>
  );
};

export default SecurityAlertsCard;
