import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Navbar from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TwoSure — AI Football Predictions",
  description:
    "Advanced AI-powered football predictions using multi-agent neural consensus (Gemini · Grok · Mistral).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Ambient background blobs */}
          <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="blob-purple w-[600px] h-[600px] -top-32 -left-32 animate-blob" />
            <div className="blob-cyan w-[500px] h-[500px] bottom-0 right-0 animate-blob-slow" />
          </div>

          <Navbar />
          <main className="min-h-screen pt-16">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
