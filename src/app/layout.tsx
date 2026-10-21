import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DMB Logs Portal — Everyday digital services", template: "%s · DMB Logs Portal" },
  description: "Secure SMS verification, airtime, data, electricity and wallet services in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Toaster richColors position="top-right" /></body></html>;
}
