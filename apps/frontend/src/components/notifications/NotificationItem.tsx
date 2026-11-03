import type { InAppNotification } from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';

export function NotificationItem({
  item,
  busy,
  onOpen,
  onRemove,
}: {
  item: InAppNotification;
  busy: boolean;
  onOpen: (item: InAppNotification) => void;
  onRemove: (item: InAppNotification) => void;
}) {
  return (
    <article
      className={`rounded-xl border ${item.readAt ? 'border-neutral-200 bg-white' : 'border-neutral-900 bg-neutral-50'}`}
    >
      <a
        href={item.href}
        className="block rounded-t-xl p-5 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-black"
        onClick={(event) => {
          event.preventDefault();
          onOpen(item);
        }}
      >
        <h3 className="font-semibold">{item.title}</h3>
        <p className="mt-2 text-sm text-neutral-700">{item.body}</p>
        <p className="mt-2 text-xs text-neutral-500">
          {new Date(item.createdAt).toLocaleString('en-US')}
        </p>
        <span className="mt-3 inline-block text-sm font-semibold underline">
          Open notification
        </span>
      </a>
      <div className="border-t border-neutral-200 px-5 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`Delete notification: ${item.title}`}
          onClick={() => onRemove(item)}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
