import { useEffect, useMemo, useState } from "react";
import { ChampIcon } from "../../components/ChampIcon";
import { useChampionStore } from "../../stores/championStore";
import { useStatsStore } from "../../stores/statsStore";
import type { EnemyPick } from "../champselect/session";
import { useBuild } from "../builds/useBuild";
import { fetchLiveData, nextItem, parseLiveData, type LiveView } from "./overlay";

const POLL_MS = 2000;

function useLiveView(): LiveView | null {
  const [view, setView] = useState<LiveView | null>(null);
  useEffect(() => {
    let active = true;
    const poll = () =>
      fetchLiveData()
        .then((raw) => active && setView(parseLiveData(raw)))
        .catch(() => active && setView(null));
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return view;
}

/** Rendered inside the transparent, click-through overlay window during a game. */
export function OverlayApp() {
  const loadChampions = useChampionStore((s) => s.load);
  const initStats = useStatsStore((s) => s.init);
  const champions = useChampionStore((s) => s.champions);
  const items = useChampionStore((s) => s.items);
  const view = useLiveView();

  useEffect(() => {
    void loadChampions();
    return initStats();
  }, [loadChampions, initStats]);

  const byId = useMemo(() => new Map([...champions.values()].map((c) => [c.id, c.key])), [champions]);
  const champ = view ? byId.get(view.championId) ?? 0 : 0;
  const enemies: EnemyPick[] = useMemo(
    () => (view?.enemyChampionIds ?? []).map((id) => ({ champ: byId.get(id) ?? 0, role: null })),
    [view?.enemyChampionIds.join(","), byId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { build, data } = useBuild(champ, view?.role ?? null, enemies);

  if (!view || champ === 0) return null;

  const bench = data?.champBench && data.champBench.games >= 30 ? data.champBench : data?.roleBench;
  const csPerMin = view.cs / Math.max(view.gameMinutes, 1);
  const csTarget = bench ? bench.cs / Math.max(bench.minutes, 1) : null;
  const next = nextItem(build, view.items);
  const nextData = next ? items.get(next) : undefined;
  const missing = nextData ? Math.max(0, nextData.gold - view.gold) : 0;

  return (
    <div className="m-2 space-y-2 rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2">
        <ChampIcon champ={champ} size={28} />
        <span className="font-semibold">{champions.get(champ)?.name}</span>
        <span className="ml-auto font-semibold text-gold tabular-nums">{Math.floor(view.gold)} oro</span>
      </div>
      <div className="flex justify-between tabular-nums">
        <span>
          KDA {view.kills}/{view.deaths}/{view.assists}
        </span>
        <span className={csTarget && csPerMin < csTarget * 0.85 ? "text-bad" : "text-ok"}>
          {view.cs} CS · {csPerMin.toFixed(1)}/min
          {csTarget ? <span className="text-white/60"> (obj. {csTarget.toFixed(1)})</span> : null}
        </span>
      </div>
      {nextData && (
        <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
          <img src={nextData.image} alt="" className="h-8 w-8 rounded" />
          <div className="min-w-0">
            <p className="truncate font-medium">Siguiente: {nextData.name}</p>
            <p className={missing === 0 ? "text-ok" : "text-white/60"}>
              {missing === 0 ? "¡Ya puedes comprarlo!" : `Faltan ${missing} de oro`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
