import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function PlannedService({
  eyebrow,
  title,
  description,
  service,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  service: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-9">
      <div className="max-w-3xl space-y-4">
        <p className="text-sm font-medium text-neutral-500">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="text-lg leading-8 text-neutral-600">{description}</p>
      </div>
      <div className="max-w-3xl rounded-xl border border-neutral-200 bg-white p-8">
        <Badge>Planned service</Badge>
        <h2 className="mt-5">{service} is coming next.</h2>
        <p className="mt-3 leading-7 text-neutral-600">
          This page is ready for the {service.toLowerCase()} API. Live data and
          actions will appear after the service is implemented.
        </p>
        {children}
        <Button asChild variant="outline" className="mt-6">
          <Link href="/events">Browse events</Link>
        </Button>
      </div>
    </div>
  );
}
