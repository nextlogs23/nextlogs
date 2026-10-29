import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { TelegramChannelInvite, TelegramChat } from "@/components/telegram-chat";
import "./globals.css";
import "./polish.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Nextlogs — Everyday digital services", template: "%s · Nextlogs" },
  description: "Secure SMS verification, airtime, data, electricity and wallet services in one place.",
  icons: {
    icon: "/nextlogs-mark.png",
    apple: "/nextlogs-mark.png",
  },
  openGraph: {
    title: "Nextlogs",
    description: "Secure SMS verification, airtime, data, electricity and wallet services in one place.",
    images: ["/nextlogs-logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1724" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}<TelegramChannelInvite /><TelegramChat /><Toaster richColors position="top-right" /></body></html>;
}
