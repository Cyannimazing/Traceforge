import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TraceForge Engine - Token investigation",
  icons: { icon: [{ url: '/brand/traceforge-icon.svg?v=tf2', type: 'image/svg+xml' }, { url: '/brand/favicon-32.png?v=tf2', sizes: '32x32', type: 'image/png' }], apple: '/brand/apple-touch-icon.png?v=tf2' },
  description:
    "Reconstruct the story behind a token. Explore funding, early buyers, wallet connections, and transaction evidence with a clear holder table.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
