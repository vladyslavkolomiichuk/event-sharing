import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ToastProvider } from '@/contexts/ToastContext';
import { ChatUnreadProvider } from '@/contexts/ChatUnreadContext';
import { NotificationsRealtimeProvider } from '@/contexts/NotificationsRealtimeProvider';
import { MessagesRealtimeProvider } from '@/contexts/MessagesRealtimeProvider';
import { SearchPreferenceProvider } from '@/contexts/SearchPreferenceContext';
import { SearchLocationOnboarding } from '@/components/search/SearchLocationOnboarding';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Event Sharing',
  description: 'Find, organize, and join events.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthProvider>
            <SearchPreferenceProvider>
              <SearchLocationOnboarding />
              <NotificationsRealtimeProvider>
                <MessagesRealtimeProvider>
                  <ChatUnreadProvider>
                    <div className="min-h-screen lg:flex">
                      <SiteHeader />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
                          {children}
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
