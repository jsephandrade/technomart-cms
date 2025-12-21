import React from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldAlert, ChevronDown } from 'lucide-react';

const SecurityAlertsCard = ({ securityAlerts, onBlockIP, onDismiss }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const MAX_VISIBLE_ALERTS = 10;

  const hasMoreAlerts = securityAlerts.length > MAX_VISIBLE_ALERTS;
  const displayedAlerts =
    !hasMoreAlerts || isExpanded
      ? securityAlerts
      : securityAlerts.slice(0, MAX_VISIBLE_ALERTS);
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
            displayedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-3 flex gap-3 ${
                  alert.type === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 mt-0.5 ${
                    alert.type === 'critical'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                />
                <div className="flex-1">
                  <h4
                    className={`font-medium ${
                      alert.type === 'critical'
                        ? 'text-red-900'
                        : 'text-amber-900'
                    }`}
                  >
                    {alert.title}
                  </h4>
                  <p
                    className={`text-sm ${
                      alert.type === 'critical'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {alert.description}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {alert.type === 'critical' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onBlockIP(alert.id)}
                      >
                        Block IP
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDismiss(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            ))
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
        Showing {displayedCount} of {securityAlerts.length} security alerts
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
