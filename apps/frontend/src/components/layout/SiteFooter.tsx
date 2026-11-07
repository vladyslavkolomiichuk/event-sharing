import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 py-7 text-sm text-neutral-500">
      <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-5 sm:px-8">
        <span>Event Sharing</span>
        <span>Find, organize, and join events.</span>
        <Link
          className="inline-flex items-center underline pointer-coarse:min-h-11"
          href="/privacy"
        >
          Privacy policy
        </Link>
      </div>
    </footer>
  );
}
