import { useEffect, useMemo, useState } from "react";
import { Database, Radio, FlaskConical } from "lucide-react";
import { ChampionPicker } from "../../components/ChampionPicker";
import { RoleTabs } from "../../components/RoleTabs";
import { Toggle } from "../../components/Toggle";
import { errorMessage } from "../../lib/errors";
import type { Role } from "../../lib/roles";
import { getMatchups, type MatchupRow } from "../../lib/stats";
import { useStatsStore } from "../../stores/statsStore";
import { inferEnemyRoles, scoreCounters } from "./counters";
import { RecommendationList } from "./RecommendationList";
import type { EnemyPick } from "./session";
import { TeamColumn, type SlotView } from "./TeamColumn";
import { useLiveSession, usePlayerPool } from "./useChampSelect";

const TEAM_SIZE = 5;
const MAX_RECOMMENDATIONS = 15;
const EMPTY_TEAM: readonly EnemyPick[] = Array.from({ length: TEAM_SIZE }, () => ({ champ: 0, role: null }));

function useMatchups(role: Role, enemyIds: number[]): { rows: MatchupRow[]; error: string | null } {
  const [state, setState] = useState<{ rows: MatchupRow[]; error: string | null }>({ rows: [], error: null });
  const key = enemyIds.join(",");
  const soloqGames = useStatsStore((s) => s.summary.soloqGames + s.summary.proGames);

  useEffect(() => {
    let active = true;
    const ids = key ? key.split(",").map(Number) : [];
    getMatchups(role, ids)
      .then((rows) => active && setState({ rows, error: null }))
      .catch((error: unknown) => active && setState({ rows: [], error: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, [role, key, soloqGames]);

  return state;
}

interface ChampSelectPageProps {
  onOpenSettings: () => void;
}

export function ChampSelectPage({ onOpenSettings }: ChampSelectPageProps) {
  const live = useLiveSession();
  const pool = usePlayerPool();
  const champRows = useStatsStore((s) => s.champRows);
  const summary = useStatsStore((s) => s.summary);

  const [role, setRole] = useState<Role>("MIDDLE");
  const [simEnemies, setSimEnemies] = useState<readonly EnemyPick[]>(EMPTY_TEAM);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [poolOnly, setPoolOnly] = useState(false);

  useEffect(() => {
    if (live?.localRole) setRole(live.localRole);
  }, [live?.localRole]);

  const rawEnemies = live ? live.enemies : simEnemies;
  const enemies = useMemo(() => inferEnemyRoles(rawEnemies, champRows), [rawEnemies, champRows]);
  const enemyIds = useMemo(() => enemies.filter((e) => e.champ > 0).map((e) => e.champ), [enemies]);
  const { rows: matchupRows, error } = useMatchups(role, enemyIds);

  const recs = useMemo(
    () =>
      scoreCounters({
        role,
        enemies,
        champRows,
        matchupRows,
        unavailable: new Set(live ? live.unavailable : enemyIds),
        pool: poolOnly ? pool.owned : null,
      }).slice(0, MAX_RECOMMENDATIONS),
    [role, enemies, champRows, matchupRows, live, enemyIds, poolOnly, pool.owned],
  );

  const enemySlots: SlotView[] = enemies.map((e, i) => ({
    champ: e.champ,
    role: e.role,
    roleInferred: rawEnemies[i]?.role === null && e.role !== null,
  }));
  const allySlots: SlotView[] = (live?.myTeam ?? []).map((s) => ({ champ: s.champ, role: s.role, highlight: s.isLocal }));
  const hasData = summary.soloqGames + summary.proGames > 0;

  const setEnemy = (index: number, champ: number) =>
    setSimEnemies((team) => team.map((e, i) => (i === index ? { champ, role: null } : e)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        {live ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-ok/15 px-3 py-1 text-xs font-semibold text-ok">
            <Radio size={14} className="animate-pulse" /> EN DIRECTO
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-muted">
            <FlaskConical size={14} /> SIMULADOR
          </span>
        )}
        <RoleTabs value={role} onChange={setRole} />
        <label className="ml-auto flex items-center gap-3 text-sm text-muted">
          Solo mis campeones
          <Toggle checked={poolOnly} disabled={!pool.owned} label="Solo mis campeones" onChange={setPoolOnly} />
        </label>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        <div className="space-y-6">
          <TeamColumn
            title="Equipo enemigo"
            tone="enemy"
            slots={enemySlots}
            editable={!live}
            onEdit={setPickingSlot}
            onClear={(i) => setEnemy(i, 0)}
          />
          {live && <TeamColumn title="Tu equipo" tone="ally" slots={allySlots} />}
          {!live && (
            <p className="text-xs leading-relaxed text-muted">
              Fuera de la selección de campeón puedes simular: añade campeones enemigos y verás los mejores counters.
              Al entrar en selección se rellena solo.
            </p>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">Mejores picks</h2>
            {hasData && (
              <span className="text-xs text-muted">
                {summary.soloqGames.toLocaleString("es-ES")} partidas Challenger/GM ·{" "}
                {summary.proGames.toLocaleString("es-ES")} pro
              </span>
            )}
          </div>
          {error && <p className="mb-3 text-sm text-bad">{error}</p>}
          {!hasData ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line p-10 text-center">
              <Database size={28} className="text-muted" />
              <p className="text-sm text-muted">{summary.syncing ? "Descargando estadísticas…" : summary.lastError ?? "Aún no hay estadísticas."}</p>
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                Ver estado de los datos
              </button>
            </div>
          ) : recs.length === 0 ? (
            <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
              No hay suficientes partidas para este rol todavía.
            </p>
          ) : (
            <RecommendationList recs={recs} mastery={pool.mastery} />
          )}
        </div>
      </div>

      {pickingSlot !== null && (
        <ChampionPicker
          onClose={() => setPickingSlot(null)}
          onPick={(champ) => {
            setEnemy(pickingSlot, champ);
            setPickingSlot(null);
          }}
        />
      )}
    </div>
  );
}
