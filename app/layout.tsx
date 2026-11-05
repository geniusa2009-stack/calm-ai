import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SideNav, BottomNav } from "@/components/Nav";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Calm",
  description: "Personal wellbeing intelligence: learns your usual, notices shifts early, and offers support that works for you.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3f7d6e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Chrome only; every page still enforces auth itself via requireUser().
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        {user ? (
          <>
            <div className="shell">
              <SideNav />
              <main>{children}</main>
            </div>
            <BottomNav />
          </>
        ) : (
          <main style={{ margin: "0 auto" }}>{children}</main>
        )}
      </body>
    </html>
  );
}
