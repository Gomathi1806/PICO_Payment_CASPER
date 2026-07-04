import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pico | Micropayments for Creators",
  description: "Sell small wins for small prices. The X402 powered link-in-bio tool.",
};

import { Providers } from "./providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <main className="container">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
