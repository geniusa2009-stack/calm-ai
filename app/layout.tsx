import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SideNav, BottomNav } from "@/components/Nav";
import { NotificationBridge } from "@/components/NotificationBridge";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PushSync } from "@/components/PushSync";
import { currentUser } from "@/lib/session";
import { getSettings } from "@/lib/db";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttr } from "@/lib/theme";

export const metadata: Metadata = {
  // Unique page titles (WCAG 2.4.2): each page sets its own, e.g. "Patterns · Calm".
  title: { default: "Calm", template: "%s · Calm" },
  description: "Personal wellbeing intelligence: learns your usual, notices shifts early, and offers support that works for you.",
  applicationName: "Calm",
  appleWebApp: { capable: true, title: "Calm", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  viewportFit: "cover", // lets env(safe-area-inset-*) work on notched iPhones
  interactiveWidget: "resizes-content", // on-screen keyboard resizes the layout instead of covering inputs
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
        <ServiceWorkerRegistration />
        {user ? (
          <>
            <div className="shell">
              <SideNav />
              <main id="main" tabIndex={-1}>{children}</main>
            </div>
            <BottomNav />
            <PushSync enabled={notify} />
            {notify && <NotificationBridge />}
          </>
        ) : (
          <main id="main" tabIndex={-1} className="bare">{children}</main>
        )}
      </body>
    </html>
  );
}
