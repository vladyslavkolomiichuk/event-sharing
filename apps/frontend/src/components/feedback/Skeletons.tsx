import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type RegionProps = {
  label: string;
  className?: string;
  children: React.ReactNode;
};

// Screen readers get the label, others see the shapes.
export function LoadingRegion({ label, className, children }: RegionProps) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const repeat = (count: number) => Array.from({ length: count }, (_, i) => i);

function EventCardShape() {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-5">
        <Skeleton className="h-20 w-20 rounded-xl" />
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-auto flex justify-between border-t border-neutral-200 pt-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function EventCardsSkeleton({
  label = 'Loading events',
  count = 6,
  className = 'md:grid-cols-2 xl:grid-cols-3',
}: {
  label?: string;
  count?: number;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn('grid gap-5', className)}>
      {repeat(count).map((key) => (
        <EventCardShape key={key} />
      ))}
    </LoadingRegion>
  );
}

function ResultShape() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="border-t border-neutral-200 px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function ExploreResultsSkeleton({ grid = false }: { grid?: boolean }) {
  return (
    <LoadingRegion
      label="Searching events"
      className={cn('grid gap-2', grid && 'sm:grid-cols-2 2xl:grid-cols-3')}
    >
      {repeat(4).map((key) => (
        <ResultShape key={key} />
      ))}
    </LoadingRegion>
  );
}

export function ExplorePageSkeleton() {
  return (
    <LoadingRegion
      label="Loading events"
      className="events-explore-fullscreen flex h-[calc(100dvh-61px)] flex-col gap-2 overflow-hidden p-3 lg:h-dvh"
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-24 shrink-0 rounded-xl" />
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="grid min-w-0 flex-1 content-start gap-2 overflow-hidden md:max-w-md">
          {repeat(3).map((key) => (
            <ResultShape key={key} />
          ))}
        </div>
        <Skeleton className="hidden min-w-0 flex-1 rounded-xl md:block" />
      </div>
    </LoadingRegion>
  );
}

export function RowsSkeleton({
  label,
  rows = 4,
  avatar = false,
  action = false,
  framed = false,
  className,
}: {
  label: string;
  rows?: number;
  avatar?: boolean;
  action?: boolean;
  framed?: boolean;
  className?: string;
}) {
  return (
    <LoadingRegion
      label={label}
      className={cn(
        'divide-y divide-neutral-200',
        framed && 'rounded-xl border border-neutral-200 bg-white px-5',
        className,
      )}
    >
      {repeat(rows).map((key) => (
        <div key={key} className="flex items-center gap-4 py-4">
          {avatar && <Skeleton className="size-11 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          {action && <Skeleton className="h-8 w-20 shrink-0" />}
        </div>
      ))}
    </LoadingRegion>
  );
}

export function NotificationsSkeleton() {
  return (
    <LoadingRegion label="Loading notifications" className="space-y-3">
      {repeat(3).map((key) => (
        <div
          key={key}
          className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
        >
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function FormSkeleton({
  label,
  fields = 4,
  sidebar = false,
  className,
}: {
  label: string;
  fields?: number;
  sidebar?: boolean;
  className?: string;
}) {
  const form = (
    <div className="min-w-0 space-y-5">
      <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-7">
        <Skeleton className="h-7 w-48" />
        {repeat(fields).map((key) => (
          <div key={key} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  );
  return (
    <LoadingRegion
      label={label}
      className={cn(
        sidebar && 'grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]',
        className,
      )}
    >
      {sidebar && (
        <div className="flex min-w-0 gap-2 overflow-hidden lg:flex-col">
          {repeat(4).map((key) => (
            <Skeleton key={key} className="h-11 w-24 rounded-lg lg:w-full" />
          ))}
        </div>
      )}
      {form}
    </LoadingRegion>
  );
}

export function CardSkeleton({
  label,
  lines = 2,
  className,
}: {
  label: string;
  lines?: number;
  className?: string;
}) {
  return (
    <LoadingRegion
      label={label}
      className={cn(
        'space-y-5 rounded-xl border border-neutral-200 bg-white p-7',
        className,
      )}
    >
      <Skeleton className="h-8 w-2/3" />
      {repeat(lines).map((key) => (
        <Skeleton key={key} className="h-4 w-full" />
      ))}
      <Skeleton className="h-10 w-36" />
    </LoadingRegion>
  );
}

export function TextSkeleton({
  label,
  lines = 1,
  className,
}: {
  label: string;
  lines?: number;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn('space-y-2', className)}>
      {repeat(lines).map((key) => (
        <Skeleton
          key={key}
          className={cn('h-4', key === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </LoadingRegion>
  );
}

export function EventDetailSkeleton() {
  return (
    <LoadingRegion label="Loading event" className="space-y-9">
      <div className="space-y-5 border-b border-neutral-200 pb-8">
        <div className="relative mb-10">
          <Skeleton className="h-48 w-full rounded-2xl sm:h-72" />
          <Skeleton className="absolute -bottom-8 left-5 h-20 w-20 rounded-2xl border-4 border-white sm:h-24 sm:w-24" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex min-w-0 gap-2 overflow-hidden lg:flex-col">
          {repeat(4).map((key) => (
            <Skeleton key={key} className="h-9 w-24 rounded-lg lg:w-full" />
          ))}
        </div>
        <div className="grid min-w-0 gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-8">
            {repeat(2).map((key) => (
              <div
                key={key}
                className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7"
              >
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
          <div className="space-y-4 self-start rounded-xl border border-neutral-200 bg-white p-7">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function ProfileSkeleton() {
  return (
    <LoadingRegion label="Loading profile" className="space-y-8">
      <div className="space-y-7 rounded-xl border border-neutral-200 bg-white p-8">
        <div className="flex flex-wrap items-center gap-5">
          <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {repeat(3).map((key) => (
          <EventCardShape key={key} />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function AnalyticsSkeleton() {
  return (
    <LoadingRegion label="Loading analytics" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {repeat(6).map((key) => (
          <Skeleton key={key} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {repeat(2).map((key) => (
          <Skeleton key={key} className="h-64 rounded-xl" />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function ChatMessagesSkeleton({ className }: { className?: string }) {
  return (
    <LoadingRegion
      label="Loading messages"
      className={cn('flex flex-col gap-3', className)}
    >
      {['w-2/3', 'w-1/2 self-end', 'w-3/5', 'w-2/5 self-end'].map((shape) => (
        <Skeleton key={shape} className={cn('h-12 rounded-2xl', shape)} />
      ))}
    </LoadingRegion>
  );
}

export function PageSkeleton() {
  return (
    <LoadingRegion label="Loading page" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {repeat(3).map((key) => (
          <EventCardShape key={key} />
        ))}
      </div>
    </LoadingRegion>
  );
}
