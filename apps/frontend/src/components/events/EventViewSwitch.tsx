import { Button } from '@/components/ui/button';

export function EventViewSwitch({
  view,
  onChange,
}: {
  view: 'list' | 'map';
  onChange: (view: 'list' | 'map') => void;
}) {
  return (
    <div
      className="flex gap-2 lg:hidden"
      role="group"
      aria-label="Explore view"
    >
      <Button
        type="button"
        variant={view === 'list' ? 'default' : 'outline'}
        onClick={() => onChange('list')}
      >
        List
      </Button>
      <Button
        type="button"
        variant={view === 'map' ? 'default' : 'outline'}
        onClick={() => onChange('map')}
      >
        Map
      </Button>
    </div>
  );
}
