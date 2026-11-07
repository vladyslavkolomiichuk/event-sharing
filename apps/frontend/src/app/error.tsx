'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-5 py-20">
      <h1>Something went wrong</h1>
      <p className="text-neutral-600">Please try again.</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
