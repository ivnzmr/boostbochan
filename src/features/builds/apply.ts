import { lcuRequest } from "../../lib/lcu";
import type { Bucket } from "../../lib/stats";
import type { Build, RunePage } from "./build";
import { orderSpells } from "./build";

export const PAGE_PREFIX = "BoostBochan";
const ITEM_SET_PREFIX = "boostbochan-";
const SUMMONERS_RIFT = 11;

export const BUCKET_LABELS: Readonly<Record<Bucket, string>> = {
  0: "equipo mixto",
  1: "equipo AD",
  2: "equipo AP",
};

/** Same rule as the pipeline: 3+ AP enemies -> AP heavy, 0-1 -> AD heavy. */
export function enemyBucket(enemyIsAp: readonly boolean[]): Bucket {
  const ap = enemyIsAp.filter(Boolean).length;
  if (ap >= 3) return 2;
  if (ap <= 1) return 1;
  return 0;
}

export function runePagePayload(page: RunePage, championName: string) {
  return {
    name: `${PAGE_PREFIX}: ${championName}`,
    primaryStyleId: page.primaryStyle,
    subStyleId: page.subStyle,
    selectedPerkIds: page.perks,
    current: true,
  };
}

interface LcuItemSet {
  uid: string;
  [key: string]: unknown;
}

export interface ItemSetsDocument {
  accountId: number;
  itemSets: LcuItemSet[];
  timestamp: number;
}

const block = (type: string, items: readonly number[]) => ({
  type,
  items: items.map((id) => ({ id: String(id), count: 1 })),
  showIfSummonerSpell: "",
  hideIfSummonerSpell: "",
});

/** Replaces our previous set for this champion, keeping the player's own sets. */
export function itemSetDocument(
  current: ItemSetsDocument,
  champ: number,
  championName: string,
  build: Build,
  bucket: Bucket,
  now: number = Date.now(),
): ItemSetsDocument {
  const uid = `${ITEM_SET_PREFIX}${champ}`;
  const blocks = [
    block("Inicio", build.starters),
    build.core && block(`Core (${Math.round(build.core.winRate * 100)}% victorias)`, build.core.value),
    build.boots && block("Botas", [build.boots.value]),
    build.situational.length > 0 && block(`Situacional vs ${BUCKET_LABELS[bucket]}`, build.situational.map((s) => s.item)),
  ].filter(Boolean);

  const set = {
    uid,
    title: `${PAGE_PREFIX} · ${championName}`,
    type: "custom",
    map: "any",
    mode: "any",
    sortrank: 0,
    startedFrom: "blank",
    preferredItemSlots: [],
    associatedChampions: [champ],
    associatedMaps: [SUMMONERS_RIFT],
    blocks,
  };
  return {
    ...current,
    itemSets: [...current.itemSets.filter((s) => s.uid !== uid), set],
    timestamp: now,
  };
}

interface PerkPage {
  id: number;
  name: string;
  isDeletable: boolean;
  isEditable: boolean;
  current: boolean;
}

const deletePage = (id: number) => lcuRequest("DELETE", `/lol-perks/v1/pages/${id}`);

/**
 * Creates the new page first and only then removes our older pages, so a failure
 * never leaves the player with fewer pages. When the page limit is reached, our own
 * old page is recycled first, then the currently selected editable page.
 */
export async function applyRunes(page: RunePage, championName: string): Promise<void> {
  const pages = await lcuRequest<PerkPage[]>("GET", "/lol-perks/v1/pages");
  const ours = pages.filter((p) => p.name.startsWith(PAGE_PREFIX) && p.isDeletable);
  const payload = runePagePayload(page, championName);
  const create = () => lcuRequest<{ id: number }>("POST", "/lol-perks/v1/pages", payload);

  let created: { id: number } | null = null;
  try {
    created = await create();
  } catch (error: unknown) {
    const recyclable = ours[0] ?? pages.find((p) => p.current && p.isDeletable);
    if (!recyclable) throw error;
    await deletePage(recyclable.id);
    created = await create();
  }
  for (const old of ours.filter((p) => p.id !== created?.id)) {
    await deletePage(old.id).catch(() => undefined); // already recycled above
  }
}

export async function applySpells(recommended: [number, number], current: [number, number]): Promise<void> {
  const [spell1Id, spell2Id] = orderSpells(recommended, current);
  await lcuRequest("PATCH", "/lol-champ-select/v1/session/my-selection", { spell1Id, spell2Id });
}

export async function applyItemSet(champ: number, championName: string, build: Build, bucket: Bucket): Promise<void> {
  const summoner = await lcuRequest<{ summonerId: number }>("GET", "/lol-summoner/v1/current-summoner");
  const path = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const current = await lcuRequest<ItemSetsDocument>("GET", path);
  await lcuRequest("PUT", path, itemSetDocument(current, champ, championName, build, bucket));
}
