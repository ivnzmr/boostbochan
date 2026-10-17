export const READY_CHECK_PATH = "/lol-matchmaking/v1/ready-check";
export const ACCEPT_PATH = `${READY_CHECK_PATH}/accept`;

export interface ReadyCheck {
  state: string;
  playerResponse: string;
}

function isReadyCheck(value: unknown): value is ReadyCheck {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.state === "string" && typeof record.playerResponse === "string";
}

/** True only while a ready check is open and the player has not answered yet. */
export function shouldAccept(readyCheck: unknown): boolean {
  return (
    isReadyCheck(readyCheck) &&
    readyCheck.state === "InProgress" &&
    readyCheck.playerResponse === "None"
  );
}
