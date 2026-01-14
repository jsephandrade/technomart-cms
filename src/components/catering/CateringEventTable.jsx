import React from 'react';
import {
  CalendarDays,
  Clock,
  Users,
  MoreVertical,
  ClipboardCheck,
  Utensils,
  Trash2,
  X,
  CheckCircle2,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const CateringEventTable = ({
  events,
  onViewDetails,
  onMenuItems,
  onCancelEvent,
  onRemoveEvent,
  onRescheduleEvent,
  listType = 'upcoming',
}) => {
  const showRescheduleAction = listType === 'past' || listType === 'cancelled';

  const getPaymentStatusBadge = (event) => {
    const paymentStatus =
      event?.paymentStatus || event?.payment_status || 'unpaid';
    const depositPaid = event?.depositPaid || event?.deposit_paid;

    if (paymentStatus === 'paid') {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Fully Paid
        </Badge>
      );
    }

    if (depositPaid || paymentStatus === 'partial') {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Wallet className="h-3 w-3 mr-1" />
          Partially Paid
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="bg-amber-50 text-amber-700 border-amber-200"
      >
        Unpaid
      </Badge>
    );
  };

  return (
    <div className="rounded-md border">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-10 px-4 text-left font-medium">Event</th>
              <th className="h-10 px-4 text-left font-medium hidden md:table-cell">
                Client
              </th>
              <th className="h-10 px-4 text-left font-medium">Date & Time</th>
              <th className="h-10 px-4 text-left font-medium hidden md:table-cell">
                Guests
              </th>
              <th className="h-10 px-4 text-left font-medium hidden lg:table-cell">
                Payment Status
              </th>
              <th className="h-10 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => onViewDetails?.(event)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onViewDetails?.(event);
                  }
                }}
              >
                <td className="p-4 align-middle font-medium">{event.name}</td>
                <td className="p-4 align-middle hidden md:table-cell">
                  {event.client}
                </td>
                <td className="p-4 align-middle whitespace-nowrap">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      <span>{event.dateLabel || event.date}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{event.time}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle hidden md:table-cell">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{event.attendees}</span>
                  </div>
                </td>
                <td className="p-4 align-middle hidden lg:table-cell whitespace-nowrap">
                  {getPaymentStatusBadge(event)}
                </td>
                <td
                  className="p-4 align-middle text-right"
                  onClick={(cellEvent) => cellEvent.stopPropagation()}
                  onKeyDown={(cellEvent) => cellEvent.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onViewDetails(event)}>
                        <ClipboardCheck className="mr-2 h-4 w-4" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMenuItems(event)}>
                        <Utensils className="mr-2 h-4 w-4" /> Select Package
                      </DropdownMenuItem>
                      {showRescheduleAction && (
                        <DropdownMenuItem
                          onClick={() =>
                            onRescheduleEvent && onRescheduleEvent(event)
                          }
                        >
                          <RotateCcw className="mr-2 h-4 w-4" /> Reschedule
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {event.status === 'cancelled' ? (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onRemoveEvent && onRemoveEvent(event)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Remove Event
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onCancelEvent(event)}
                        >
                          <X className="mr-2 h-4 w-4" /> Cancel Event
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
