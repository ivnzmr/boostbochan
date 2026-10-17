const PHASE_LABELS: Readonly<Record<string, string>> = {
  None: "En el cliente",
  Lobby: "En sala",
  Matchmaking: "Buscando partida",
  CheckedIntoTournament: "Inscrito en torneo",
  ReadyCheck: "Partida encontrada",
  ChampSelect: "Selección de campeón",
  GameStart: "Cargando partida",
  InProgress: "En partida",
  Reconnect: "Reconectando",
  WaitingForStats: "Esperando estadísticas",
  PreEndOfGame: "Fin de partida",
  EndOfGame: "Fin de partida",
};

export function phaseLabel(phase: string | null): string {
  if (phase === null) return "—";
  return PHASE_LABELS[phase] ?? phase;
}

export function profileIconUrl(iconId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
}
