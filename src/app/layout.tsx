import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatWalrus Engagement Dashboard",
  description: "Internal customer success dashboard for tracking Thinkific learning progress, learner engagement, and company health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
