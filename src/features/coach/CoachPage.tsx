import { useEffect, useState } from "react";
import { ThumbsUp, Target } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { RoleTabs } from "../../components/RoleTabs";
import { errorMessage } from "../../lib/errors";
import { relativeTime } from "../../lib/format";
import type { Role } from "../../lib/roles";
import { getBuildData } from "../../lib/stats";
import { useChampionStore } from "../../stores/championStore";
import { useLcuStore } from "../../stores/lcuStore";
import { useStatsStore } from "../../stores/statsStore";
import { mainRole } from "../builds/useBuild";
import { fetchHistory, QUEUE_NAMES, type MatchSummary } from "../profile/profile";
import { analyzeGame, fetchPlayerGame, type CoachReport, type PlayerGame } from "./coach";

const GRADE_STYLES: Record<CoachReport["grade"], string> = {
  S: "text-tier-splus",
  A: "text-tier-s",
  B: "text-tier-a",
  C: "text-tier-b",
  D: "text-tier-c",
};

function MetricBar({ label, value, target, ratio }: { label: string; value: string; target: string; ratio: number }) {
  const width = Math.min(ratio, 1.5) / 1.5;
  const tone = ratio >= 1 ? "bg-ok" : ratio >= 0.85 ? "bg-gold" : "bg-bad";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted tabular-nums">
          {value} <span className="text-xs">/ {target}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-panel-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width * 100}%` }} />
        <div className="absolute top-[-3px] h-[14px] w-0.5 bg-text/60" style={{ left: `${100 / 1.5}%` }} title="Media Challenger" />
      </div>
    </div>
  );
}

function useReport(gameId: number | null, roleOverride: Role | null) {
  const champRows = useStatsStore((s) => s.champRows);
  const champions = useChampionStore((s) => s.champions);
  const [state, setState] = useState<{ game: PlayerGame | null; report: CoachReport | null; role: Role | null; error: string | null }>({
    game: null,
    report: null,
    role: null,
    error: null,
  });

  useEffect(() => {
    if (gameId === null) return;
    let active = true;
    (async () => {
      const game = await fetchPlayerGame(gameId);
      if (!game) throw new Error("No se encontró tu participación en esa partida");
      const role = roleOverride ?? game.role ?? mainRole(game.champ, champRows);
      if (!role) return { game, report: null, role: null, error: "Elige el rol que jugaste para analizar la partida." };
      const data = await getBuildData(role, game.champ);
      const name = champions.get(game.champ)?.name ?? "tu campeón";
      const report = analyzeGame(game, role, data.champBench, data.roleBench, name);
      return { game, report, role, error: report ? null : "Aún no hay referencias de Challenger para este rol." };
    })()
      .then((next) => active && setState(next))
      .catch((e: unknown) => active && setState({ game: null, report: null, role: null, error: errorMessage(e) }));
    return () => {
      active = false;
    };
  }, [gameId, roleOverride, champRows, champions]);

  return state;
}

export function CoachPage({ initialGameId }: { initialGameId: number | null }) {
  const connected = useLcuStore((s) => s.status.connected);
  const [history, setHistory] = useState<MatchSummary[]>([]);
  const [gameId, setGameId] = useState<number | null>(initialGameId);
  const [roleOverride, setRoleOverride] = useState<Role | null>(null);
  const { game, report, role, error } = useReport(gameId, roleOverride);

  useEffect(() => {
    if (!connected) return;
    fetchHistory(10)
      .then((h) => {
        setHistory(h);
        setGameId((current) => current ?? h.find((m) => !m.remake)?.gameId ?? null);
      })
      .catch(() => setHistory([]));
  }, [connected]);

  useEffect(() => {
    if (initialGameId !== null) setGameId(initialGameId);
  }, [initialGameId]);

  if (!connected) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Abre el cliente de League of Legends para analizar tus partidas.</p>;
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6">
      <aside>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-muted uppercase">Partidas recientes</h2>
        <ul className="space-y-2">
          {history
            .filter((m) => !m.remake)
            .map((m) => (
              <li key={m.gameId}>
                <button
                  type="button"
                  onClick={() => (setGameId(m.gameId), setRoleOverride(null))}
                  className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left ${
                    m.gameId === gameId ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/50"
                  }`}
                >
                  <ChampIcon champ={m.champ} size={36} />
                  <div className="min-w-0 text-xs">
                    <p className={`font-semibold ${m.win ? "text-ok" : "text-bad"}`}>{m.win ? "Victoria" : "Derrota"}</p>
                    <p className="truncate text-muted">
                      {QUEUE_NAMES[m.queueId] ?? "Partida"} · {relativeTime(m.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
        </ul>
      </aside>

      <section className="space-y-5">
        {game && (
          <div className="flex flex-wrap items-center gap-4">
            <ChampIcon champ={game.champ} size={56} />
            <div className="flex-1">
              <p className="text-lg font-semibold">
                {game.kills}/{game.deaths}/{game.assists} · {Math.round(game.minutes)} min
              </p>
              {report && <p className="text-xs text-muted">Comparado con {report.benchLabel}</p>}
            </div>
            <RoleTabs value={role ?? "MIDDLE"} onChange={setRoleOverride} />
          </div>
        )}
        {error && <p className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">{error}</p>}
        {report && (
          <>
            <div className="flex items-center gap-6 rounded-xl border border-line bg-panel p-6">
              <span className={`text-6xl font-black ${GRADE_STYLES[report.grade]}`}>{report.grade}</span>
              <div className="flex-1 space-y-3">
                {report.metrics.map((m) => (
                  <MetricBar key={m.key} label={m.label} value={m.format(m.value)} target={m.format(m.target)} ratio={m.ratio} />
                ))}
              </div>
            </div>
            {report.strengths.length > 0 && (
              <div className="rounded-xl border border-line bg-panel p-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ok">
                  <ThumbsUp size={16} /> Lo que hiciste bien
                </p>
                <ul className="space-y-1 text-sm text-muted">
                  {report.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-xl border border-line bg-panel p-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
                <Target size={16} /> Qué mejorar
              </p>
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
                {report.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
