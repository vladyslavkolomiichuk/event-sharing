import type { EventStatus } from '@event-sharing/contracts';
import { Badge } from '@/components/ui/badge';

const colors: Record<EventStatus, string> = {
  DRAFT: 'border-neutral-300 bg-neutral-50 text-neutral-700',
  MODERATION: 'border-amber-300 bg-amber-50 text-amber-900',
  REJECTED: 'border-red-300 bg-red-50 text-red-900',
  APPROVED: 'border-blue-300 bg-blue-50 text-blue-900',
  PUBLISHED: 'border-blue-300 bg-blue-50 text-blue-900',
  ONGOING: 'border-blue-300 bg-blue-50 text-blue-900',
  COMPLETED: 'border-green-300 bg-green-50 text-green-900',
  CANCELLED: 'border-red-300 bg-red-50 text-red-900',
  ARCHIVED: 'border-neutral-300 bg-neutral-50 text-neutral-700',
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <Badge className={colors[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
