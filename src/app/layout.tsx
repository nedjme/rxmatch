import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s — RxMatch',
    default: 'RxMatch',
  },
  description: 'Lecture intelligente d\'ordonnances pour pharmacies et laboratoires',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="fr">
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              classNames: {
                toast: 'font-sans text-sm',
              },
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
