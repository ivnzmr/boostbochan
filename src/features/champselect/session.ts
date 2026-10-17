import { roleFromLcu, type Role } from "../../lib/roles";

export const SESSION_PATH = "/lol-champ-select/v1/session";

export interface TeamSlot {
  cellId: number;
  champ: number;
  role: Role | null;
  isLocal: boolean;
  spells: [number, number];
}

export interface EnemyPick {
  champ: number;
  role: Role | null;
}

export interface SessionView {
  localRole: Role | null;
  // Champion currently hovered or locked by the local player (0 if none).
  localChamp: number;
  localSpells: [number, number];
  myTeam: TeamSlot[];
  enemies: EnemyPick[];
  /** Banned or already picked champions: cannot be recommended. */
  unavailable: number[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asId(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Locked champion, or the hovered intent if nothing is locked yet. */
function slotChampion(member: UnknownRecord): number {
  return asId(member.championId) || asId(member.championPickIntent);
}

function completedBans(actionGroups: unknown): number[] {
  return asArray(actionGroups)
    .flatMap(asArray)
    .map(asRecord)
    .filter((a): a is UnknownRecord => a !== null && a.type === "ban" && a.completed === true)
    .map((a) => asId(a.championId))
    .filter((id) => id > 0);
}

export function parseSession(raw: unknown): SessionView | null {
  const session = asRecord(raw);
  if (!session || !Array.isArray(session.myTeam)) return null;

  const localCell = session.localPlayerCellId;
  const myTeam: TeamSlot[] = session.myTeam
    .map(asRecord)
    .filter((m): m is UnknownRecord => m !== null)
    .map((m) => ({
      cellId: typeof m.cellId === "number" ? m.cellId : -1,
      champ: slotChampion(m),
      role: roleFromLcu(m.assignedPosition),
      isLocal: m.cellId === localCell,
      spells: [asId(m.spell1Id), asId(m.spell2Id)] as [number, number],
    }));

  const enemies: EnemyPick[] = asArray(session.theirTeam)
    .map(asRecord)
    .filter((m): m is UnknownRecord => m !== null)
    .map((m) => ({ champ: asId(m.championId), role: roleFromLcu(m.assignedPosition) }));

  const bans = asRecord(session.bans);
  const unavailable = [
    ...completedBans(session.actions),
    ...asArray(bans?.myTeamBans).map(asId),
    ...asArray(bans?.theirTeamBans).map(asId),
    ...myTeam.filter((s) => !s.isLocal).map((s) => s.champ),
    ...enemies.map((e) => e.champ),
  ].filter((id) => id > 0);

  return {
    localRole: myTeam.find((s) => s.isLocal)?.role ?? null,
    localChamp: asId(asRecord(session.myTeam.find((m) => asRecord(m)?.cellId === localCell))?.championId),
    localSpells: myTeam.find((s) => s.isLocal)?.spells ?? [0, 0],
    myTeam,
    enemies,
    unavailable: [...new Set(unavailable)],
  };
}
