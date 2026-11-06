import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SideNav, BottomNav } from "@/components/Nav";
import { NotificationBridge } from "@/components/NotificationBridge";
import { currentUser } from "@/lib/session";
import { getSettings } from "@/lib/db";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttr } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Calm",
  description: "Personal wellbeing intelligence: learns your usual, notices shifts early, and offers support that works for you.",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f3ee" }, { media: "(prefers-color-scheme: dark)", color: "#111716" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Chrome only; every page still enforces auth itself via requireUser().
  const user = await currentUser();
  const settings = user ? getSettings(user.id) : null;
  const notify = settings?.notifyEnabled ?? false;
  // Theme is rendered on the server, so the first paint is already correct (no flash):
  // the account's choice when signed in, otherwise this device's last choice.
  const theme = settings ? settings.theme : parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={themeAttr(theme)} suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {user ? (
          <>
            <div className="shell">
              <SideNav />
              <main id="main" tabIndex={-1}>{children}</main>
            </div>
            <BottomNav />
            {notify && <NotificationBridge />}
          </>
        ) : (
          <main id="main" tabIndex={-1} className="bare">{children}</main>
        )}
      </body>
    </html>
  );
}
