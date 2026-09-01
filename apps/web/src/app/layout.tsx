import type { Metadata } from "next";
import { Inter, Outfit, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/providers/AuthProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SWRProvider } from "@/providers/SWRProvider";

import Script from "next/script";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });



export const metadata: Metadata = {
  title: "DevOps.lab | The Engineering Learning Platform",
  description: "A production-grade platform for mastering DevOps at scale.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body
        className={`${outfit.variable} ${inter.variable} ${space.variable} ${jetbrains.variable} font-sans text-foreground antialiased min-h-screen flex flex-col bg-background`}
      >
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('devopslab-theme');
                  var isLight = stored === 'light' || (!stored && window.matchMedia('(prefers-color-scheme: light)').matches);
                  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
                  if (isLight) {
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <SWRProvider>
          <AuthProvider>
            <Navbar />
            <main className="flex-1 w-full flex flex-col">{children}</main>
            <Footer />
          </AuthProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
