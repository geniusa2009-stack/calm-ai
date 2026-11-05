import type { ReactNode } from "react";

/** Consistent page header used by every screen. */
export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon = "◌", title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="empty-ico" aria-hidden>{icon}</div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export type Tone = "info" | "success" | "warn" | "error";

/** Inline feedback. Errors are announced assertively, everything else politely. */
export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="notice-body">
        {title && <span className="notice-title">{title}</span>}
        {children}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r }: { h?: number | string; w?: number | string; r?: number }) {
  return <div className="skeleton" aria-hidden style={{ height: h, width: w, borderRadius: r }} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}
