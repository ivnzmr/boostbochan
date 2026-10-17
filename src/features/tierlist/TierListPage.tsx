import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { RoleTabs } from "../../components/RoleTabs";
import { pct, winRateTone } from "../../lib/format";
import type { Role } from "../../lib/roles";
import { useChampionStore } from "../../stores/championStore";
import { useStatsStore } from "../../stores/statsStore";
import { buildTierList, type Tier, type TierEntry } from "./tierlist";

const TIER_STYLES: Readonly<Record<Tier, string>> = {
  "S+": "bg-tier-splus/15 text-tier-splus",
  S: "bg-tier-s/15 text-tier-s",
  A: "bg-tier-a/15 text-tier-a",
  B: "bg-tier-b/15 text-tier-b",
  C: "bg-tier-c/15 text-tier-c",
};

type SortKey = "rank" | "winRate" | "pickRate" | "games" | "proGames";

const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: "winRate", label: "Win rate" },
  { key: "pickRate", label: "Pick rate" },
  { key: "games", label: "Partidas" },
  { key: "proGames", label: "Pro" },
];

function sortEntries(entries: readonly TierEntry[], key: SortKey): TierEntry[] {
  if (key === "rank") return [...entries];
  return [...entries].sort((a, b) => b[key] - a[key]);
}

interface TierListPageProps {
  onOpenSettings: () => void;
}

export function TierListPage({ onOpenSettings }: TierListPageProps) {
  const champRows = useStatsStore((s) => s.champRows);
  const summary = useStatsStore((s) => s.summary);
  const champions = useChampionStore((s) => s.champions);
  const [role, setRole] = useState<Role>("TOP");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [query, setQuery] = useState("");

  const entries = useMemo(() => {
    const list = buildTierList(champRows, role, summary.soloqGames);
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((e) => champions.get(e.champ)?.name.toLowerCase().includes(q)) : list;
    return sortEntries(filtered, sortKey);
  }, [champRows, role, summary.soloqGames, query, champions, sortKey]);

  if (summary.soloqGames === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-10 text-center">
        <p className="mb-4 text-sm text-muted">{summary.syncing ? "Descargando estadísticas…" : summary.lastError ?? "La tier list se calcula con partidas de Challenger y Grandmaster."}</p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Ver estado de los datos
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <RoleTabs value={role} onChange={setRole} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar…"
          className="w-48 rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="ml-auto text-xs text-muted">
          Parches {summary.patches.join(", ") || "—"} · Challenger/GM EUW
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
              <th className="cursor-pointer px-4 py-3" onClick={() => setSortKey("rank")}>
                #
              </th>
              <th className="px-4 py-3">Campeón</th>
              <th className="px-4 py-3">Tier</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => setSortKey(col.key)}
                  className={`cursor-pointer px-4 py-3 text-right hover:text-text ${sortKey === col.key ? "text-accent" : ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.champ} className="border-b border-line last:border-b-0 hover:bg-panel-2/50">
                <td className="px-4 py-2 text-muted tabular-nums">{index + 1}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <ChampIcon champ={entry.champ} size={32} />
                    <span className="font-medium">{champions.get(entry.champ)?.name ?? entry.champ}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block w-9 rounded py-0.5 text-center text-xs font-bold ${TIER_STYLES[entry.tier]}`}>
                    {entry.tier}
                  </span>
                </td>
                <td className={`px-4 py-2 text-right font-medium tabular-nums ${winRateTone(entry.winRate)}`}>
                  {pct(entry.winRate)}
                </td>
                <td className="px-4 py-2 text-right text-muted tabular-nums">{pct(entry.pickRate)}</td>
                <td className="px-4 py-2 text-right text-muted tabular-nums">{entry.games.toLocaleString("es-ES")}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {entry.proGames > 0 ? (
                    <span className="inline-flex items-center gap-1 text-gold">
                      <Trophy size={12} /> {entry.proGames}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
