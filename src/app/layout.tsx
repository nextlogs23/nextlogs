import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "DMB Logs Portal — Everyday digital services", template: "%s · DMB Logs Portal" },
  description: "Secure SMS verification, airtime, data, electricity and wallet services in one place.",
  icons: {
    icon: "/dmb-logins-logo.png",
    apple: "/dmb-logins-logo.png",
  },
  openGraph: {
    title: "DMB Logs Portal",
    description: "Secure SMS verification, airtime, data, electricity and wallet services in one place.",
    images: ["/dmb-logins-logo.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Toaster richColors position="top-right" /></body></html>;
}
