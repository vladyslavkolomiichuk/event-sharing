import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="space-y-5 py-20">
      <p className="text-sm font-medium text-neutral-500">404</p>
      <h1>Page not found</h1>
      <p className="text-neutral-600">The page you requested does not exist.</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
