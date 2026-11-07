import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ToastProvider } from '@/contexts/ToastContext';
import { ChatUnreadProvider } from '@/contexts/ChatUnreadContext';
import { NotificationsRealtimeProvider } from '@/contexts/NotificationsRealtimeProvider';
import { MessagesRealtimeProvider } from '@/contexts/MessagesRealtimeProvider';
import { SearchPreferenceProvider } from '@/contexts/SearchPreferenceContext';
import { SearchLocationOnboarding } from '@/components/search/SearchLocationOnboarding';
import { OnboardingGate } from '@/components/auth/OnboardingGate';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Event Sharing', template: '%s | Event Sharing' },
  description: 'Find, organize, and join events.',
};

export const viewport: Viewport = { themeColor: '#fafafa' };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only rounded-md bg-white px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110]"
        >
          Skip to content
        </a>
        <ToastProvider>
          <AuthProvider>
            <SearchPreferenceProvider>
              <SearchLocationOnboarding />
              <NotificationsRealtimeProvider>
                <MessagesRealtimeProvider>
                  <ChatUnreadProvider>
                    <div className="flex min-h-screen flex-col lg:flex-row">
                      <SiteHeader />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <main
                          id="main-content"
                          tabIndex={-1}
                          className="mx-auto min-h-[calc(100dvh-61px)] w-full max-w-[1680px] flex-1 px-4 py-6 lg:min-h-0 focus:outline-none sm:px-6 lg:px-8"
                        >
                          <OnboardingGate>{children}</OnboardingGate>
                        </main>
                        <SiteFooter />
                      </div>
                    </div>
                  </ChatUnreadProvider>
                </MessagesRealtimeProvider>
              </NotificationsRealtimeProvider>
            </SearchPreferenceProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
