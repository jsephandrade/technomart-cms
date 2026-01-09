import React, { useMemo, useState } from 'react';
import UserManagementCard from '@/components/users/UserManagementCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  ClipboardCheck,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  ok: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  under: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
  over: 'border border-destructive/30 bg-destructive/10 text-destructive',
  idle: 'border border-border/60 bg-muted text-muted-foreground',
};

const NON_INTEGER_KEYS = new Set(['e', 'E', '+', '-', '.']);

const handleNonIntegerKeyDown = (event) => {
  if (NON_INTEGER_KEYS.has(event.key)) {
    event.preventDefault();
  }
};

const handleNonIntegerPaste = (event) => {
  const text = event.clipboardData.getData('text');
  if (/[^\d]/.test(text)) {
    event.preventDefault();
  }
};

const toRoleKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const sanitizeTargets = (targets) => {
  const map = new Map();
  (targets || []).forEach((entry) => {
    const role = String(entry?.role || '').trim();
    const key = toRoleKey(role);
    const target = Math.max(0, Number.parseInt(entry?.target, 10) || 0);
    if (!role || !key || target <= 0) return;
    map.set(key, { role, target });
  });
  return Array.from(map.values());
};

const TeamCompositionCard = ({
  daysOfWeek = [],
  targetsByDay = {},
  countsByDay = {},
  roleLabelMap = {},
  roleOptions = [],
  canManage = false,
  onUpdateTargets,
  onAutoBuildRoster,
  autoBuildBusy = false,
  exceptionRequests = [],
  onClearException,
  onClearAllExceptions,
}) => {
  const [editingDay, setEditingDay] = useState('');
  const [draftTargets, setDraftTargets] = useState([]);

  const activeDays = useMemo(
    () =>
      (daysOfWeek || []).filter(
        (day) => String(day || '').toLowerCase() !== 'sunday'
      ),
    [daysOfWeek]
  );

  const exceptionList = useMemo(() => {
    const list = Array.isArray(exceptionRequests) ? exceptionRequests : [];
    const toEpoch = (value) => {
      if (typeof value === 'number') return value;
      const parsed = Date.parse(value || '');
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return [...list].sort(
      (a, b) => toEpoch(b?.requestedAt) - toEpoch(a?.requestedAt)
    );
  }, [exceptionRequests]);

  const openEditor = (day) => {
    const normalized = String(day || '');
    setEditingDay(normalized);
    setDraftTargets(
      Array.isArray(targetsByDay?.[normalized])
        ? targetsByDay[normalized].map((entry) => ({
            role: entry.role || '',
            target: Number(entry.target || 0),
          }))
        : []
    );
  };

  const closeEditor = () => {
    setEditingDay('');
    setDraftTargets([]);
  };

  const handleUpdateDraft = (index, field, value) => {
    setDraftTargets((prev) => {
      const next = [...prev];
      const current = { ...(next[index] || { role: '', target: 0 }) };
      if (field === 'target') {
        const sanitized = Number.parseInt(value, 10);
        current.target = Number.isFinite(sanitized)
          ? Math.max(0, sanitized)
          : 0;
      } else {
        current[field] = value;
      }
      next[index] = current;
      return next;
    });
  };

  const handleSaveTargets = () => {
    if (!editingDay || typeof onUpdateTargets !== 'function') {
      closeEditor();
      return;
    }
    const cleaned = sanitizeTargets(draftTargets);
    onUpdateTargets(editingDay, cleaned);
    closeEditor();
  };

  return (
    <>
      <UserManagementCard
        title="Team Composition Targets"
        titleStyle="accent"
        titleIcon={Users}
        description="Define daily role caps so the system prevents duplicate roles per day."
        headerActions={
          canManage ? (
            <Button
              size="sm"
              className="gap-2"
              onClick={onAutoBuildRoster}
              disabled={autoBuildBusy}
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Auto-build roster
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {activeDays.map((day) => {
            const targets = Array.isArray(targetsByDay?.[day])
              ? targetsByDay[day]
              : [];
            const counts = countsByDay?.[day] || {};
            const targetKeys = new Set(
              targets.map((entry) => toRoleKey(entry.role))
            );
            const extras = Object.entries(counts).filter(
              ([roleKey]) => !targetKeys.has(roleKey)
            );
            const summaryLabel = targets.length
              ? `${targets.length} roles tracked`
              : 'No targets set';

            return (
              <div
                key={day}
                className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{day}</p>
                    <p className="text-xs text-muted-foreground">
                      {summaryLabel}
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(day)}
                    >
                      Edit targets
                    </Button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {targets.length ? (
                    targets.map((entry) => {
                      const roleKey = toRoleKey(entry.role);
                      const count = counts?.[roleKey] ?? 0;
                      const target = Number(entry.target || 0);
                      const status =
                        count > target
                          ? 'over'
                          : count < target
                            ? 'under'
                            : 'ok';
                      return (
                        <Badge
                          key={`${day}-${roleKey}`}
                          className={cn(
                            'text-[11px] uppercase tracking-wide',
                            STATUS_STYLES[status] || STATUS_STYLES.idle
                          )}
                        >
                          {entry.role}: {count}/{target}
                        </Badge>
                      );
                    })
                  ) : (
                    <Badge className={cn('text-[11px]', STATUS_STYLES.idle)}>
                      Set targets to enable scheduling
                    </Badge>
                  )}
                </div>

                {extras.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Untracked roles scheduled:{' '}
                      {extras
                        .map(([roleKey, count]) => {
                          const label = roleLabelMap?.[roleKey] || roleKey;
                          return `${label} (${count})`;
                        })
                        .join(', ')}
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {exceptionList.length ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span className="font-semibold">
                  Pending exception requests ({exceptionList.length})
                </span>
              </div>
              {canManage && exceptionList.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-amber-900 hover:text-amber-900"
                  onClick={onClearAllExceptions}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {exceptionList.slice(0, 4).map((request) => (
                <div
                  key={request.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-white/60 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold">
                      {request.day} - {request.role}
                    </p>
                    <p className="text-[11px] text-amber-900/80">
                      {request.message}
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-amber-900 hover:text-amber-900"
                      onClick={() => onClearException?.(request.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">Clear exception</span>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </UserManagementCard>

      <Dialog
        open={Boolean(editingDay)}
        onOpenChange={(open) => !open && closeEditor()}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Set team composition for {editingDay}</DialogTitle>
            <DialogDescription>
              Define how many teammates per role are allowed for this day.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {draftTargets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
                No roles added yet. Add at least one role to enforce daily
                limits.
              </div>
            ) : null}

            <div className="space-y-3">
              {draftTargets.map((entry, index) => (
                <div
                  key={`${editingDay}-${index}`}
                  className="grid gap-3 sm:grid-cols-[1.4fr_0.7fr_auto]"
                >
                  <div className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide">
                      Role
                    </Label>
                    <Input
                      value={entry.role || ''}
                      onChange={(event) =>
                        handleUpdateDraft(index, 'role', event.target.value)
                      }
                      placeholder="e.g., Chef"
                      list={`role-options-${editingDay}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide">
                      Target
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={entry.target ?? 0}
                      onKeyDown={handleNonIntegerKeyDown}
                      onPaste={handleNonIntegerPaste}
                      onChange={(event) =>
                        handleUpdateDraft(index, 'target', event.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDraftTargets((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Remove role</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() =>
                setDraftTargets((prev) => [...prev, { role: '', target: 1 }])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add role
            </Button>

            <datalist id={`role-options-${editingDay}`}>
              {(roleOptions || []).map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            <Button onClick={handleSaveTargets}>Save targets</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TeamCompositionCard;
