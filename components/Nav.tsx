"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "./ui/Dialog";

type L = { href: string; label: string; ico: string };
const GROUPS: { label: string | null; links: L[] }[] = [
  { label: null, links: [
    { href: "/", label: "Today", ico: "◎" },
    { href: "/check-in", label: "Check in", ico: "＋" },
    { href: "/support", label: "Support", ico: "≈" },
  ] },
  { label: "Understand", links: [
    { href: "/patterns", label: "Patterns", ico: "∿" },
    { href: "/memory", label: "Memory", ico: "❖" },
    { href: "/lab", label: "What-If Lab", ico: "⚗" },
  ] },
  { label: "People", links: [
    { href: "/companion", label: "Companion", ico: "✎" },
    { href: "/circle", label: "Circle & help", ico: "♡" },
  ] },
  { label: null, links: [{ href: "/settings", label: "Settings", ico: "⚙" }] },
];
export const LINKS = GROUPS.flatMap((g) => g.links);
const MOBILE_PRIMARY = ["/", "/check-in", "/support", "/patterns"];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="side" aria-label="Main">
      <Link href="/" className="brand"><span className="brand-dot" aria-hidden /> Calm</Link>
      {GROUPS.map((g, gi) => (
        <div key={gi} role="group" aria-label={g.label ?? undefined} style={g.label === null && gi > 0 ? { marginTop: 16 } : undefined}>
          {g.label && <div className="nav-group" aria-hidden>{g.label}</div>}
          {g.links.map((l) => {
            const a = isActive(path, l.href);
            return (
              <Link key={l.href} href={l.href} className={`nav-link ${a ? "active" : ""}`} aria-current={a ? "page" : undefined}>
                <span className="nav-ico" aria-hidden>{l.ico}</span>{l.label}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="side-foot">Calm is a wellbeing tool, not medical care. In an emergency, call your local emergency number.</div>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const primary = LINKS.filter((l) => MOBILE_PRIMARY.includes(l.href));
  const rest = LINKS.filter((l) => !MOBILE_PRIMARY.includes(l.href));
  const moreActive = rest.some((l) => isActive(path, l.href));
  return (
    <>
      <nav className="bottom-nav" aria-label="Main">
        {primary.map((l) => {
          const a = isActive(path, l.href);
          return (
            <Link key={l.href} href={l.href} className={a ? "active" : ""} aria-current={a ? "page" : undefined}>
              <span className="ico" aria-hidden>{l.ico}</span>{l.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} style={moreActive ? { color: "var(--accent)" } : undefined}>
          <span className="ico" aria-hidden>⋯</span>More
        </button>
      </nav>
      <Dialog open={open} onClose={() => setOpen(false)} title="More" variant="sheet">
        <div className="more-list">
          {rest.map((l) => {
            const a = isActive(path, l.href);
            return (
              <Link key={l.href} href={l.href} className={a ? "active" : ""} aria-current={a ? "page" : undefined} onClick={() => setOpen(false)}>
                <span aria-hidden>{l.ico}</span>{l.label}
              </Link>
            );
          })}
        </div>
        <p className="faint" style={{ margin: 0 }}>Calm is a wellbeing tool, not medical care. In an emergency, call your local emergency number.</p>
      </Dialog>
    </>
  );
}
