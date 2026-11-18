import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GlobalToolbar } from "./global-toolbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Belleezaa | Inventario",
  description: "Sistema de inventario Belleezaa conectado con Supabase",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="theme-control-bar flex min-h-12 items-center justify-end border-b px-4 sm:px-6 lg:px-8">
          <GlobalToolbar />
        </div>
        {children}
      </body>
    </html>
  );
}
