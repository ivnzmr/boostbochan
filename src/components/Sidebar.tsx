import { BarChart3, Home, Settings, Swords, type LucideIcon } from "lucide-react";

export type Page = "home" | "champselect" | "tierlist" | "settings";

interface NavItem {
  page: Page;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { page: "home", label: "Inicio", icon: Home },
  { page: "champselect", label: "Selección de campeón", icon: Swords },
  { page: "tierlist", label: "Tier list", icon: BarChart3 },
  { page: "settings", label: "Ajustes", icon: Settings },
];

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-line bg-rail py-4">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-black text-white">
        BB
      </div>
      {NAV_ITEMS.map(({ page, label, icon: Icon }) => {
        const active = current === page;
        return (
          <button
            key={page}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onNavigate(page)}
            className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-panel-2 hover:text-text"
            }`}
          >
            {active && <span className="absolute -left-[14px] h-6 w-1 rounded-r bg-accent" />}
            <Icon size={20} />
            <span className="pointer-events-none absolute left-14 z-50 rounded-md bg-panel-2 px-2 py-1 text-xs whitespace-nowrap text-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
