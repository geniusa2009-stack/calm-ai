import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SideNav, BottomNav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Calm",
  description: "Personal wellbeing intelligence: learns your usual, notices shifts early, and offers support that works for you.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3f7d6e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <SideNav />
          <main>{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
