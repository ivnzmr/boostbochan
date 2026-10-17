import { ROLES, ROLE_LABELS, type Role } from "../lib/roles";

interface RoleTabsProps {
  value: Role;
  onChange: (role: Role) => void;
}

export function RoleTabs({ value, onChange }: RoleTabsProps) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-1">
      {ROLES.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => onChange(role)}
          className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
            value === role ? "bg-accent text-white" : "text-muted hover:text-text"
          }`}
        >
          {ROLE_LABELS[role]}
        </button>
      ))}
    </div>
  );
}
