import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useChampionStore } from "../stores/championStore";

interface ChampionPickerProps {
  onPick: (champ: number) => void;
  onClose: () => void;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function ChampionPicker({ onPick, onClose }: ChampionPickerProps) {
  const champions = useChampionStore((state) => state.champions);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return [...champions.values()]
      .filter((c) => !q || normalize(c.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [champions, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line p-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar campeón…"
            className="flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="button" onClick={onClose} className="text-muted hover:text-text" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-8 gap-2 overflow-y-auto p-4">
          {results.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onPick(c.key)}
              className="flex flex-col items-center gap-1 rounded-md p-1 hover:bg-panel-2"
            >
              <img src={c.image} alt="" className="h-12 w-12 rounded-md" draggable={false} />
              <span className="w-full truncate text-center text-[11px] text-muted">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
