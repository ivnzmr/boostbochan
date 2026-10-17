import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { errorMessage } from "../../lib/errors";
import { pct, relativeTime } from "../../lib/format";
import { useChampionStore } from "../../stores/championStore";
import { useLcuStore } from "../../stores/lcuStore";
import {
  championSummaries,
  fetchHistory,
  fetchRanked,
  QUEUE_NAMES,
  TIER_LABELS,
  type MatchSummary,
  type RankedQueue,
} from "./profile";

const CREST_URL = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests";

function RankCard({ title, queue }: { title: string; queue?: RankedQueue }) {
  const ranked = queue && queue.tier && queue.tier !== "NONE";
  const games = queue ? queue.wins + queue.losses : 0;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-panel p-5">
      {ranked ? (
        <img src={`${CREST_URL}/${queue.tier.toLowerCase()}.svg`} alt="" className="h-14 w-14" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-panel-2" />
      )}
      <div>
        <p className="text-xs tracking-widest text-muted uppercase">{title}</p>
        {ranked ? (
          <>
            <p className="text-lg font-semibold">
              {TIER_LABELS[queue.tier] ?? queue.tier} {["MASTER", "GRANDMASTER", "CHALLENGER"].includes(queue.tier) ? "" : queue.division}
              <span className="ml-2 text-sm text-muted">{queue.leaguePoints} LP</span>
            </p>
            <p className="text-xs text-muted">
              {queue.wins}V {queue.losses}D · {pct(games > 0 ? queue.wins / games : 0)}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Sin clasificar</p>
        )}
      </div>
    </div>
  );
}

function MatchRow({ match, onAnalyze }: { match: MatchSummary; onAnalyze: (gameId: number) => void }) {
  const items = useChampionStore((s) => s.items);
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
  const tone = match.remake ? "border-l-muted" : match.win ? "border-l-ok" : "border-l-bad";
  return (
    <li className={`flex items-center gap-4 border-b border-l-4 border-line px-4 py-3 last:border-b-0 ${tone}`}>
      <ChampIcon champ={match.champ} size={44} />
      <div className="w-36">
        <p className={`text-sm font-semibold ${match.remake ? "text-muted" : match.win ? "text-ok" : "text-bad"}`}>
          {match.remake ? "Remake" : match.win ? "Victoria" : "Derrota"}
        </p>
        <p className="truncate text-xs text-muted">{QUEUE_NAMES[match.queueId] ?? `Cola ${match.queueId}`}</p>
        <p className="text-[11px] text-muted">
          {Math.round(match.minutes)} min · {match.createdAt ? relativeTime(match.createdAt) : ""}
        </p>
      </div>
      <div className="w-28 text-sm">
        <p className="font-medium tabular-nums">
          {match.kills} / <span className="text-bad">{match.deaths}</span> / {match.assists}
        </p>
        <p className="text-xs text-muted">{kda.toFixed(2)} KDA</p>
      </div>
      <div className="w-24 text-xs text-muted tabular-nums">
        <p>{match.cs} CS ({(match.cs / Math.max(1, match.minutes)).toFixed(1)}/min)</p>
        <p>Visión {match.vision}</p>
      </div>
      <div className="flex flex-1 gap-1">
        {match.items.map((id, i) =>
          id > 0 && items.get(id) ? (
            <img key={i} src={items.get(id)!.image} alt={items.get(id)!.name} title={items.get(id)!.name} className="h-7 w-7 rounded" />
          ) : (
            <div key={i} className="h-7 w-7 rounded bg-panel-2" />
          ),
        )}
      </div>
      {!match.remake && (
        <button
          type="button"
          onClick={() => onAnalyze(match.gameId)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
        >
          <GraduationCap size={14} /> Analizar
        </button>
      )}
    </li>
  );
}

export function ProfilePage({ onAnalyze }: { onAnalyze: (gameId: number) => void }) {
  const connected = useLcuStore((s) => s.status.connected);
  const champions = useChampionStore((s) => s.champions);
  const [ranked, setRanked] = useState<RankedQueue[]>([]);
  const [history, setHistory] = useState<MatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    Promise.all([fetchRanked(), fetchHistory(20)])
      .then(([r, h]) => active && (setRanked(r), setHistory(h), setError(null)))
      .catch((e: unknown) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [connected]);

  if (!connected) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Abre el cliente de League of Legends para ver tu perfil.</p>;
  }

  const played = history.filter((m) => !m.remake);
  const wins = played.filter((m) => m.win).length;
  const top = championSummaries(history).slice(0, 5);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-3 gap-4">
        <RankCard title="Solo/Dúo" queue={ranked.find((q) => q.queueType === "RANKED_SOLO_5x5")} />
        <RankCard title="Flexible" queue={ranked.find((q) => q.queueType === "RANKED_FLEX_SR")} />
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="text-xs tracking-widest text-muted uppercase">Últimas {played.length} partidas</p>
          <p className="text-lg font-semibold">
            {wins}V {played.length - wins}D <span className="text-sm text-muted">· {pct(played.length ? wins / played.length : 0)}</span>
          </p>
          <div className="mt-2 flex gap-1">
            {played.slice(0, 20).map((m) => (
              <span key={m.gameId} className={`h-2 flex-1 rounded-full ${m.win ? "bg-ok" : "bg-bad"}`} />
            ))}
          </div>
        </div>
      </div>

      {top.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-widest text-muted uppercase">Campeones recientes</h2>
          <div className="grid grid-cols-5 gap-3">
            {top.map((c) => (
              <div key={c.champ} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                <ChampIcon champ={c.champ} size={36} />
                <div className="min-w-0 text-xs">
                  <p className="truncate font-medium">{champions.get(c.champ)?.name}</p>
                  <p className="text-muted">
                    {c.games} part. · {pct(c.wins / c.games, 0)} · {c.kda.toFixed(1)} KDA
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-muted uppercase">Historial</h2>
        <ul className="overflow-hidden rounded-lg border border-line bg-panel">
          {history.map((m) => (
            <MatchRow key={m.gameId} match={m} onAnalyze={onAnalyze} />
          ))}
          {history.length === 0 && <li className="p-6 text-sm text-muted">Sin partidas recientes.</li>}
        </ul>
      </section>
    </div>
  );
}
