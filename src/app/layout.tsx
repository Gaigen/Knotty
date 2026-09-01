import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME, APP_DESCRIPTION } from '@/lib/branding';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — трекер задач с графом`,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${geistSans.variable} font-sans antialiased bg-background text-foreground`}>
        <AppProviders>{children}</AppProviders>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
