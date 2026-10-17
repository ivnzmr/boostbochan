import { useEffect, useRef } from "react";
import { errorMessage } from "../../lib/errors";
import { useChampionStore } from "../../stores/championStore";
import { useLcuStore } from "../../stores/lcuStore";
import type { Settings } from "../settings/settings";
import { useLiveSession } from "../champselect/useChampSelect";
import { applyItemSet, applyRunes, applySpells, BUCKET_LABELS } from "./apply";
import { useBuild } from "./useBuild";

/** Wait for the hover to settle before touching the player's pages. */
const SETTLE_MS = 1500;

type AutoSettings = Pick<Settings, "autoRunes" | "autoSpells" | "autoItems">;

/**
 * Imports runes, summoner spells and an item set when the player picks a champion.
 * Runes/spells are applied once per champion; the item set is refreshed when the
 * enemy team's damage profile changes.
 */
export function useAutoBuild(enabled: boolean, settings: AutoSettings): void {
  const session = useLiveSession();
  const champ = enabled ? session?.localChamp ?? 0 : 0;
  const { build, bucket } = useBuild(champ, session?.localRole ?? null, session?.enemies ?? []);
  const championName = useChampionStore((s) => s.champions.get(champ)?.name ?? `#${champ}`);
  const addActivity = useLcuStore((s) => s.addActivity);
  const applied = useRef<{ runes: number; spells: number; items: string }>({ runes: 0, spells: 0, items: "" });
  const spells = session?.localSpells;

  useEffect(() => {
    if (!session) applied.current = { runes: 0, spells: 0, items: "" };
  }, [session]);

  useEffect(() => {
    if (!build || champ <= 0) return;
    const timer = setTimeout(async () => {
      const done = applied.current;
      const steps: [boolean, () => Promise<void>, string][] = [
        [
          settings.autoRunes && !!build.runes && done.runes !== champ,
          async () => {
            await applyRunes(build.runes!.value, championName);
            done.runes = champ;
          },
          `Runas de ${championName} importadas`,
        ],
        [
          settings.autoSpells && !!build.spells && !!spells && done.spells !== champ,
          async () => {
            await applySpells(build.spells!.value, spells!);
            done.spells = champ;
          },
          `Hechizos de ${championName} fijados`,
        ],
        [
          settings.autoItems && done.items !== `${champ}:${bucket}`,
          async () => {
            await applyItemSet(champ, championName, build, bucket);
            done.items = `${champ}:${bucket}`;
          },
          `Set de objetos de ${championName} vs ${BUCKET_LABELS[bucket]} creado`,
        ],
      ];
      for (const [shouldRun, run, message] of steps) {
        if (!shouldRun) continue;
        try {
          await run();
          addActivity(message);
        } catch (error: unknown) {
          addActivity(`No se pudo aplicar (${message.toLowerCase()}): ${errorMessage(error)}`);
        }
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [build, champ, bucket, championName, settings.autoRunes, settings.autoSpells, settings.autoItems, spells, addActivity]);
}
