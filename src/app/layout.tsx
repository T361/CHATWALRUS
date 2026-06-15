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
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&display=swap"
          rel="stylesheet"
        />
        {/* Apply saved theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('cw-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
