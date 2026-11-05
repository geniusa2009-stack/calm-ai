"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const LINKS = [
  { href: "/", label: "Today", ico: "◎" },
  { href: "/check-in", label: "Check in", ico: "＋" },
  { href: "/support", label: "Support", ico: "≈" },
  { href: "/patterns", label: "Patterns", ico: "∿" },
  { href: "/memory", label: "Memory", ico: "❖" },
  { href: "/lab", label: "What-If Lab", ico: "⚗" },
  { href: "/companion", label: "Companion", ico: "✎" },
  { href: "/circle", label: "Circle & help", ico: "♡" },
  { href: "/settings", label: "Settings", ico: "⚙" },
];
const MOBILE = ["/", "/check-in", "/support", "/patterns", "/settings"];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="side" aria-label="Main">
      <Link href="/" className="brand"><span className="brand-dot" aria-hidden /> Calm</Link>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`nav-link ${isActive(path, l.href) ? "active" : ""}`} aria-current={isActive(path, l.href) ? "page" : undefined}>
          <span className="nav-ico" aria-hidden>{l.ico}</span>{l.label}
        </Link>
      ))}
      <div className="side-foot">Calm is a wellbeing tool, not medical care. In an emergency, call your local emergency number.</div>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Main">
      {LINKS.filter((l) => MOBILE.includes(l.href)).map((l) => (
        <Link key={l.href} href={l.href} className={isActive(path, l.href) ? "active" : ""}>
          <span aria-hidden style={{ fontSize: "1.1rem" }}>{l.ico}</span>{l.label}
        </Link>
      ))}
    </nav>
  );
}
