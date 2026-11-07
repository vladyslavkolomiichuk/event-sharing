import { useEffect } from 'react';

const WARNING = 'Leave this page? Your unsaved changes will be lost.';

function leavesPage(link: HTMLAnchorElement): boolean {
  const target = new URL(link.href, window.location.href);
  return (
    link.target !== '_blank' &&
    !link.hasAttribute('download') &&
    (target.pathname !== window.location.pathname ||
      target.search !== window.location.search)
  );
}

// Warns on reload, closing the tab, and following in-app links.
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warnOnUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const confirmLink = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      const link = (event.target as Element).closest('a[href]');
      if (!(link instanceof HTMLAnchorElement) || !leavesPage(link)) return;
      if (!window.confirm(WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warnOnUnload);
    // The capture phase runs before the Next.js link handler.
    document.addEventListener('click', confirmLink, true);
    return () => {
      window.removeEventListener('beforeunload', warnOnUnload);
      document.removeEventListener('click', confirmLink, true);
    };
  }, [dirty]);
}
