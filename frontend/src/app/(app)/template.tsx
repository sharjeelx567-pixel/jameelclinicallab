/**
 * Page entrance for every protected route: fade, rise and un-blur. Pure CSS with
 * `animation-fill-mode: backwards`, so no transform/filter stays on the page afterwards
 * (sticky headers and fixed dialogs keep working). Remounts on each navigation.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
