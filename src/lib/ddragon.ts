const DDRAGON = "https://ddragon.leagueoflegends.com";
const LOCALE = "es_ES";
/** Items cheaper than this are components/starters (same rule as the stats pipeline). */
const MIN_COMPLETED_GOLD = 1600;
const BASIC_BOOTS = 1001;

export interface Champion {
  key: number;
  id: string;
  name: string;
  title: string;
  tags: string[];
  /** Deals mostly magic damage (used to profile the enemy team). */
  isAp: boolean;
  image: string;
}

export interface Item {
  id: number;
  name: string;
  gold: number;
  completed: boolean;
  boots: boolean;
  image: string;
}

export interface Rune {
  id: number;
  name: string;
  icon: string;
}

export interface RuneStyle extends Rune {
  slots: Rune[][];
}

export interface SummonerSpell {
  id: number;
  name: string;
  image: string;
}

export interface StaticData {
  version: string;
  champions: ReadonlyMap<number, Champion>;
  items: ReadonlyMap<number, Item>;
  runes: ReadonlyMap<number, Rune>;
  styles: ReadonlyMap<number, RuneStyle>;
  spells: ReadonlyMap<number, SummonerSpell>;
}

interface RawChampion {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  info: { attack: number; magic: number };
}

interface RawItem {
  name: string;
  gold: { total: number; purchasable: boolean };
  into?: string[];
  tags?: string[];
  maps?: Record<string, boolean>;
}

interface RawRune {
  id: number;
  name: string;
  icon: string;
}

interface RawStyle extends RawRune {
  slots: { runes: RawRune[] }[];
}

interface RawSpell {
  key: string;
  name: string;
  image: { full: string };
}

/** Same classification as the pipeline (`static_data::is_completed_item`). */
export function isCompletedItem(item: RawItem): boolean {
  const tags = item.tags ?? [];
  return (
    item.gold.purchasable &&
    item.gold.total >= MIN_COMPLETED_GOLD &&
    (item.into ?? []).length === 0 &&
    item.maps?.["11"] === true &&
    !tags.some((t) => t === "Boots" || t === "Consumable" || t === "Trinket")
  );
}

export function isUpgradedBoots(id: number, item: RawItem): boolean {
  return id !== BASIC_BOOTS && (item.tags ?? []).includes("Boots") && item.gold.purchasable;
}

/** Stat shards are not part of runesReforged.json. */
const STAT_SHARDS: readonly Rune[] = [
  { id: 5001, name: "Vida escalable", icon: "perk-images/StatMods/StatModsHealthPlusIcon.png" },
  { id: 5005, name: "Velocidad de ataque", icon: "perk-images/StatMods/StatModsAttackSpeedIcon.png" },
  { id: 5007, name: "Aceleración de habilidades", icon: "perk-images/StatMods/StatModsCDRScalingIcon.png" },
  { id: 5008, name: "Fuerza adaptable", icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png" },
  { id: 5010, name: "Velocidad de movimiento", icon: "perk-images/StatMods/StatModsMovementSpeedIcon.png" },
  { id: 5011, name: "Vida", icon: "perk-images/StatMods/StatModsHealthScalingIcon.png" },
  { id: 5013, name: "Tenacidad y resistencia a ralentizaciones", icon: "perk-images/StatMods/StatModsTenacityIcon.png" },
];

const json = <T>(url: string): Promise<T> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
    return r.json() as Promise<T>;
  });

export async function loadStaticData(): Promise<StaticData> {
  const versions = await json<string[]>(`${DDRAGON}/api/versions.json`);
  const version = versions[0];
  if (!version) throw new Error("Data Dragon no devolvió versiones");
  const base = `${DDRAGON}/cdn/${version}`;

  const [champList, itemList, styleList, spellList] = await Promise.all([
    json<{ data: Record<string, RawChampion> }>(`${base}/data/${LOCALE}/champion.json`),
    json<{ data: Record<string, RawItem> }>(`${base}/data/${LOCALE}/item.json`),
    json<RawStyle[]>(`${base}/data/${LOCALE}/runesReforged.json`),
    json<{ data: Record<string, RawSpell> }>(`${base}/data/${LOCALE}/summoner.json`),
  ]);

  const champions = new Map(
    Object.values(champList.data).map((c): [number, Champion] => [
      Number(c.key),
      {
        key: Number(c.key),
        id: c.id,
        name: c.name,
        title: c.title,
        tags: c.tags,
        isAp: c.info.magic > c.info.attack,
        image: `${base}/img/champion/${c.id}.png`,
      },
    ]),
  );

  const items = new Map(
    Object.entries(itemList.data).map(([id, item]): [number, Item] => [
      Number(id),
      {
        id: Number(id),
        name: item.name,
        gold: item.gold.total,
        completed: isCompletedItem(item),
        boots: isUpgradedBoots(Number(id), item),
        image: `${base}/img/item/${id}.png`,
      },
    ]),
  );

  const runeIcon = (icon: string) => `${DDRAGON}/cdn/img/${icon}`;
  const styles = new Map(
    styleList.map((s): [number, RuneStyle] => [
      s.id,
      {
        id: s.id,
        name: s.name,
        icon: runeIcon(s.icon),
        slots: s.slots.map((slot) => slot.runes.map((r) => ({ id: r.id, name: r.name, icon: runeIcon(r.icon) }))),
      },
    ]),
  );
  const runes = new Map<number, Rune>([
    ...[...styles.values()].flatMap((s) => s.slots.flat().map((r): [number, Rune] => [r.id, r])),
    ...STAT_SHARDS.map((s): [number, Rune] => [s.id, { ...s, icon: runeIcon(s.icon) }]),
  ]);

  const spells = new Map(
    Object.values(spellList.data).map((s): [number, SummonerSpell] => [
      Number(s.key),
      { id: Number(s.key), name: s.name, image: `${base}/img/spell/${s.image.full}` },
    ]),
  );

  return { version, champions, items, runes, styles, spells };
}

/** Live Client API "rawChampionName" ("game_character_displayname_Kaisa") -> Data Dragon id. */
export function championIdFromRaw(raw: string): string {
  return raw.split("_").pop() ?? raw;
}
