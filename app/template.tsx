/** Re-mounts on every navigation, giving each page a short, calm entrance (fade-only under reduced motion). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
