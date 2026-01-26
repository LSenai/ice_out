import type { Metadata } from "next";
import { Anton, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";

const displayFont = Anton({
  variable: "--font-display",
  weight: ["400"],
  subsets: ["latin"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ICE OUT — Community Vigilance Network",
  description:
    "Real-time community reporting of ICE/federal agent activity with anonymous validation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
