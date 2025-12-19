import React from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Download, Clock, ChevronDown, FileText } from 'lucide-react';
import { toast } from 'sonner';

import exportActivityLogs from '@/utils/exportActivityLogs';

const ActivityLogsCard = ({
  searchTerm,
  setSearchTerm,
  selectedLogType,
  setSelectedLogType,
  timeRange,
  setTimeRange,
  logs,
  onRowClick,
  getActionIcon,
  getActionColor,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      selectedLogType === 'all' || log.type === selectedLogType;

    return matchesSearch && matchesType;
  });

  const sortedLogs = [...filteredLogs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const MAX_VISIBLE_LOGS = 10;
  const hasMoreLogs = sortedLogs.length > MAX_VISIBLE_LOGS;
  const displayedLogs =
    !hasMoreLogs || isExpanded
      ? sortedLogs
      : sortedLogs.slice(0, MAX_VISIBLE_LOGS);
  const displayedCount = displayedLogs.length;

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '--';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }

    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const handleExportLogs = React.useCallback(() => {
    try {
      exportActivityLogs(sortedLogs);
      toast.success('Activity logs exported');
    } catch (error) {
      console.error('Failed to export activity logs', error);
      toast.error('Failed to export activity logs');
    }
  }, [sortedLogs]);

  return (
    <FeaturePanelCard
      className="w-full md:max-w-4xl mx-auto"
      title="Activity Logs"
      titleStyle="accent"
      titleIcon={FileText}
      titleAccentClassName="px-3 py-1 text-xs md:text-sm"
      titleClassName="text-xs md:text-sm"
      description="Track system and user activities"
      headerActions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleExportLogs}
          >
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      }
      contentClassName="space-y-4"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search logs..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <Select value={selectedLogType} onValueChange={setSelectedLogType}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Log Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="action">User Actions</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="security">Security</SelectItem>
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <div
          className="relative w-full overflow-hidden transition-[max-height] duration-500 ease-in-out"
          style={{ maxHeight: isExpanded ? '80rem' : '36rem' }}
        >
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium w-[55%]">
                    Action
                  </th>
                  <th className="h-10 px-4 text-left font-medium">User ID</th>
                  <th className="h-10 px-4 text-left font-medium">Timestamp</th>
                  <th className="h-10 px-4 text-left font-medium">
                    More Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedLogs.length > 0 ? (
                  displayedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => onRowClick(log)}
                    >
                      <td className="p-4 align-middle w-[55%]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`rounded-full p-1 ${getActionColor(log.type)}`}
                          >
                            {getActionIcon(log.type)}
                          </div>
                          <span className="truncate">
                            {log.action || (log.type || '').toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle whitespace-nowrap">
                        <span className="font-mono">{log.userId || '--'}</span>
                      </td>
                      <td className="p-4 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(log);
                          }}
                          aria-label={`View details for ${log.id}`}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="h-24 text-center">
                      No logs found matching your criteria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMoreLogs && !isExpanded && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/80 to-transparent" />
          )}
        </div>
      </div>

      <div className="border-t pt-3 text-xs text-muted-foreground">
        Showing {displayedCount} of {sortedLogs.length} matching logs (out of{' '}
        {logs.length} total)
      </div>
      {hasMoreLogs && (
        <div className="flex justify-start md:justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="group flex items-center gap-1"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? 'Collapse activity logs' : 'Expand activity logs'
            }
          >
            <span className="text-sm font-medium">
              {isExpanded ? 'Show Less' : 'Show All Logs'}
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

export default ActivityLogsCard;
