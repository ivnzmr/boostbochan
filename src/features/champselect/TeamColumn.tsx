import { Plus, X } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { ROLE_LABELS, type Role } from "../../lib/roles";
import { useChampion } from "../../stores/championStore";

export interface SlotView {
  champ: number;
  role: Role | null;
  roleInferred?: boolean;
  highlight?: boolean;
}

interface SlotProps {
  slot: SlotView;
  editable: boolean;
  onEdit?: () => void;
  onClear?: () => void;
}

function Slot({ slot, editable, onEdit, onClear }: SlotProps) {
  const champion = useChampion(slot.champ);
  const empty = slot.champ === 0;

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
        slot.highlight ? "border-accent bg-accent-soft" : "border-line bg-panel"
      }`}
    >
      {empty && editable ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-line text-muted hover:border-accent hover:text-accent"
          aria-label="Elegir campeón"
        >
          <Plus size={18} />
        </button>
      ) : (
        <button type="button" onClick={editable ? onEdit : undefined} className={editable ? "" : "cursor-default"}>
          <ChampIcon champ={slot.champ} size={40} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{empty ? "Sin elegir" : champion?.name ?? "…"}</p>
        <p className="text-xs text-muted">
          {slot.role ? ROLE_LABELS[slot.role] : "Rol desconocido"}
          {slot.role && slot.roleInferred && " (estimado)"}
        </p>
      </div>
      {editable && !empty && (
        <button type="button" onClick={onClear} className="text-muted hover:text-bad" aria-label="Quitar">
          <X size={16} />
        </button>
      )}
    </li>
  );
}

interface TeamColumnProps {
  title: string;
  tone: "ally" | "enemy";
  slots: readonly SlotView[];
  editable?: boolean;
  onEdit?: (index: number) => void;
  onClear?: (index: number) => void;
}

export function TeamColumn({ title, tone, slots, editable = false, onEdit, onClear }: TeamColumnProps) {
  return (
    <section>
      <h3
        className={`mb-2 text-xs font-semibold tracking-widest uppercase ${
          tone === "enemy" ? "text-bad" : "text-[#4ea8ff]"
        }`}
      >
        {title}
      </h3>
      <ul className="space-y-2">
        {slots.map((slot, index) => (
          <Slot
            key={index}
            slot={slot}
            editable={editable}
            onEdit={() => onEdit?.(index)}
            onClear={() => onClear?.(index)}
          />
        ))}
      </ul>
    </section>
  );
}
