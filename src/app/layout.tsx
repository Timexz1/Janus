import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n/context";
import { AuthProvider } from "@/lib/supabase/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Janus — US Stock Tax Tracker",
  description:
    "บันทึกการเทรดหุ้นสหรัฐฯ ผ่าน Webull / Dime คำนวณต้นทุน FIFO และประมาณการภาษีเงินได้ไทย",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <Nav />
              <main className="mx-auto w-full max-w-[1900px] flex-1 px-3 py-5 sm:px-5 lg:px-8 2xl:px-10 min-[2400px]:max-w-[calc(100vw-320px)] min-[3400px]:max-w-[3120px]">
                {children}
              </main>
              <Footer />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
