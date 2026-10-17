import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../lib/errors";
import { ROLES, type Role } from "../../lib/roles";
import { getBuildData, type BuildData, type Bucket, type ChampRow } from "../../lib/stats";
import { useChampionStore } from "../../stores/championStore";
import { useStatsStore } from "../../stores/statsStore";
import type { EnemyPick } from "../champselect/session";
import { enemyBucket } from "./apply";
import { computeBuild, type Build } from "./build";

/** Role a champion is played in most, used when the client doesn't assign one. */
export function mainRole(champ: number, rows: readonly ChampRow[]): Role | null {
  const games = ROLES.map((role) => ({
    role,
    games: rows.filter((r) => r.champ === champ && r.role === role).reduce((s, r) => s + r.games, 0),
  }));
  const best = games.reduce((a, b) => (b.games > a.games ? b : a));
  return best.games > 0 ? best.role : null;
}

export interface BuildState {
  build: Build | null;
  data: BuildData | null;
  bucket: Bucket;
  role: Role | null;
  error: string | null;
}

/** Build for `champ` in `role` (or its main role), adapted to the visible enemy team. */
export function useBuild(champ: number, role: Role | null, enemies: readonly EnemyPick[]): BuildState {
  const champions = useChampionStore((s) => s.champions);
  const items = useChampionStore((s) => s.items);
  const champRows = useStatsStore((s) => s.champRows);
  const generatedAt = useStatsStore((s) => s.summary.generatedAt);
  const [data, setData] = useState<BuildData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveRole = role ?? (champ > 0 ? mainRole(champ, champRows) : null);
  const enemyKey = enemies.map((e) => e.champ).join(",");
  const bucket = useMemo(
    () => enemyBucket(enemies.filter((e) => e.champ > 0).map((e) => champions.get(e.champ)?.isAp ?? false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enemyKey, champions],
  );

  useEffect(() => {
    if (champ <= 0 || !effectiveRole) {
      setData(null);
      return;
    }
    let active = true;
    getBuildData(effectiveRole, champ)
      .then((result) => active && (setData(result), setError(null)))
      .catch((e: unknown) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [champ, effectiveRole, generatedAt]);

  const build = useMemo(() => {
    if (!data || !effectiveRole || data.rows.length === 0) return null;
    const isAp = champions.get(champ)?.isAp ?? false;
    return computeBuild({ rows: data.rows, role: effectiveRole, bucket, isAp, items });
  }, [data, effectiveRole, bucket, champ, champions, items]);

  return { build, data, bucket, role: effectiveRole, error };
}
