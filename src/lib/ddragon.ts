const DDRAGON = "https://ddragon.leagueoflegends.com";
const LOCALE = "es_ES";

export interface Champion {
  key: number;
  id: string;
  name: string;
  title: string;
  tags: string[];
  image: string;
}

export interface ChampionData {
  version: string;
  champions: ReadonlyMap<number, Champion>;
}

interface RawChampion {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
}

export async function loadChampionData(): Promise<ChampionData> {
  const versions: string[] = await fetch(`${DDRAGON}/api/versions.json`).then((r) => r.json());
  const version = versions[0];
  if (!version) throw new Error("Data Dragon no devolvió versiones");

  const list: { data: Record<string, RawChampion> } = await fetch(
    `${DDRAGON}/cdn/${version}/data/${LOCALE}/champion.json`,
  ).then((r) => r.json());

  const champions = new Map(
    Object.values(list.data).map((c) => [
      Number(c.key),
      {
        key: Number(c.key),
        id: c.id,
        name: c.name,
        title: c.title,
        tags: c.tags,
        image: `${DDRAGON}/cdn/${version}/img/champion/${c.id}.png`,
      },
    ]),
  );
  return { version, champions };
}
