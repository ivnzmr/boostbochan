import { Trophy } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { compact, pct, winRateTone } from "../../lib/format";
import { useChampion } from "../../stores/championStore";
import type { Recommendation } from "./counters";
import type { Mastery } from "./useChampSelect";

interface RecommendationRowProps {
  rank: number;
  rec: Recommendation;
  mastery?: Mastery;
  selected: boolean;
  onSelect: (champ: number) => void;
}

function RecommendationRow({ rank, rec, mastery, selected, onSelect }: RecommendationRowProps) {
  const champion = useChampion(rec.champ);
  const delta = rec.score - rec.baseWinRate;

  return (
    <li
      onClick={() => onSelect(rec.champ)}
      className={`flex cursor-pointer items-center gap-4 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panel-2/50 ${
        selected ? "bg-accent-soft" : ""
      }`}
    >
      <span className="w-5 text-center text-sm text-muted tabular-nums">{rank}</span>
      <ChampIcon champ={rec.champ} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          {champion?.name ?? `#${rec.champ}`}
          {rec.proGames > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
              <Trophy size={10} /> PRO {rec.proGames}
            </span>
          )}
          {mastery && mastery.championPoints > 0 && (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
              M{mastery.championLevel} · {compact(mastery.championPoints)}
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {rec.edges.map((edge) => (
            <span
              key={edge.enemy}
              title={`${edge.games} partidas${edge.lane ? " (rival de línea)" : ""}`}
              className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[11px] ${
                edge.lane ? "bg-panel-2 ring-1 ring-accent/50" : "bg-panel-2"
              }`}
            >
              <ChampIcon champ={edge.enemy} size={16} className="rounded-full" />
              <span className={winRateTone(edge.winRate)}>{pct(edge.winRate)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="text-right">
        <p className={`text-lg font-semibold tabular-nums ${winRateTone(rec.score)}`}>{pct(rec.score)}</p>
        <p className="text-[11px] text-muted tabular-nums">
          base {pct(rec.baseWinRate)}
          {rec.edges.length > 0 && (
            <span className={delta >= 0 ? "text-ok" : "text-bad"}>
              {" "}
              {delta >= 0 ? "+" : ""}
              {(delta * 100).toFixed(1)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

interface RecommendationListProps {
  recs: readonly Recommendation[];
  mastery: ReadonlyMap<number, Mastery>;
  selected: number;
  onSelect: (champ: number) => void;
}

export function RecommendationList({ recs, mastery, selected, onSelect }: RecommendationListProps) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-panel">
      {recs.map((rec, index) => (
        <RecommendationRow
          key={rec.champ}
          rank={index + 1}
          rec={rec}
          mastery={mastery.get(rec.champ)}
          selected={rec.champ === selected}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
