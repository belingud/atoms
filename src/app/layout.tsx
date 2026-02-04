import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atoms",
  description: "AI-powered code generation and preview",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
