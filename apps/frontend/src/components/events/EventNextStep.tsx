import Link from 'next/link';
import type { EventDetail } from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';

function nextStepMessage(event: EventDetail, isAdmin: boolean): string | null {
  if (event.pendingStatus) return null;
  switch (event.status) {
    case 'DRAFT':
      return 'This event is a draft. Submit it for review when it is ready.';
    case 'MODERATION':
      return isAdmin ? 'This event is waiting for your decision.' : null;
    case 'REJECTED':
      return 'This event needs changes. Edit it, then resubmit it for review.';
    case 'APPROVED':
      return 'This event is approved. Publish it to make it visible.';
    case 'PUBLISHED':
    case 'ONGOING':
      return event.registrationStatus === 'CLOSED' &&
        event.endTime > new Date().toISOString()
        ? 'Registration is closed, so nobody can join. Open it when you are ready.'
        : null;
    default:
      return null;
  }
}

export function EventNextStep({
  event,
  isAdmin,
}: {
  event: EventDetail;
  isAdmin: boolean;
}) {
  const message = nextStepMessage(event, isAdmin);
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <p className="text-sm text-orange-950">{message}</p>
      <Button asChild size="sm">
        <Link href={`/events/${event.id}?view=settings`}>
          Go to event settings
        </Link>
      </Button>
    </div>
  );
}
