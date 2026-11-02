'use client';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-5 py-20">
      <Notice message="Something went wrong. Please try again." tone="error" />
      <h1>Something went wrong.</h1>
      <p className="text-neutral-600">Please try again.</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
