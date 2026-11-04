import Link from 'next/link';
import type { ChatMessage } from '@event-sharing/contracts';

export function ChatMessageBubble({
  message,
  own,
}: {
  message: ChatMessage;
  own: boolean;
}) {
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <article
        className={`max-w-[88%] rounded-xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%] ${own ? 'rounded-tr-sm border border-orange-100 bg-orange-50' : 'rounded-tl-sm bg-white'}`}
      >
        {!own && (
          <Link
            href={`/users/${message.senderId}`}
            className="mb-1 block font-semibold text-orange-800 hover:underline"
          >
            {message.senderName}
          </Link>
        )}
        <p className="whitespace-pre-wrap break-words leading-5">
          {message.body}
        </p>
        <time className="mt-1 block text-right text-[10px] text-neutral-500">
          {new Date(message.createdAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </time>
      </article>
    </div>
  );
}
