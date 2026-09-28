import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { Navbar } from "@/components/nav/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
});

export const metadata: Metadata = {
  title: "VibeCheck — Know me without the talking.",
  description:
    "Have a fun conversation that builds your personal blueprint, then turn it into a bold, shareable Vibecheck Story.",
};

// resizes-content: on browsers that support it (mainly Chrome/Android), the
// on-screen keyboard shrinks the layout viewport (and dvh with it) instead
// of overlaying it — so a `h-dvh` box actually gets shorter as the keyboard
// opens, rather than the keyboard covering the bottom of it. Browsers that
// don't support this value ignore it; BuilderView's visualViewport listener
// is the fallback for those.
export const viewport: Viewport = {
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
