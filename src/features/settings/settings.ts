export interface Settings {
  autoAccept: boolean;
  counters: boolean;
  autoAcceptDelaySec: number;
  autoRunes: boolean;
  autoSpells: boolean;
  autoItems: boolean;
  profile: boolean;
  overlay: boolean;
  coach: boolean;
}

export type FeatureKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  autoAccept: true,
  counters: true,
  autoAcceptDelaySec: 2,
  autoRunes: true,
  autoSpells: true,
  autoItems: true,
  profile: true,
  overlay: false,
  coach: true,
});

export const MAX_ACCEPT_DELAY_SEC = 10;

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  description: string;
  available: boolean;
}

export const FEATURES: readonly FeatureInfo[] = [
  {
    key: "counters",
    label: "Asistente de selección (counters)",
    description: "Recomienda los mejores picks contra el equipo enemigo y abre la vista al entrar en selección.",
    available: true,
  },
  {
    key: "autoAccept",
    label: "Aceptar partida automáticamente",
    description: "Acepta la cola cuando se encuentra partida.",
    available: true,
  },
  {
    key: "autoRunes",
    label: "Importar runas",
    description: "Crea la página de runas al elegir campeón.",
    available: false,
  },
  {
    key: "autoSpells",
    label: "Hechizos de invocador",
    description: "Fija los hechizos recomendados en selección de campeón.",
    available: false,
  },
  {
    key: "autoItems",
    label: "Sets de objetos",
    description: "Escribe la build recomendada en la tienda del juego.",
    available: false,
  },
  {
    key: "profile",
    label: "Perfil e historial",
    description: "Rango, historial de partidas y estadísticas por campeón.",
    available: false,
  },
  {
    key: "overlay",
    label: "Overlay en partida",
    description: "Ventana sobre el juego con tu oro y próxima compra.",
    available: false,
  },
  {
    key: "coach",
    label: "Coach IA post-partida",
    description: "Análisis de tu partida con consejos concretos.",
    available: false,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Builds a valid Settings object from untrusted persisted data,
 * falling back to defaults for anything missing or of the wrong type.
 */
export function mergeSettings(stored: unknown): Settings {
  const source = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};

  const booleans = Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
      .filter((key) => typeof DEFAULT_SETTINGS[key] === "boolean")
      .map((key) => [key, typeof source[key] === "boolean" ? source[key] : DEFAULT_SETTINGS[key]]),
  );

  const delay = source.autoAcceptDelaySec;
  const autoAcceptDelaySec =
    typeof delay === "number" && Number.isFinite(delay)
      ? clamp(Math.round(delay), 0, MAX_ACCEPT_DELAY_SEC)
      : DEFAULT_SETTINGS.autoAcceptDelaySec;

  return { ...DEFAULT_SETTINGS, ...booleans, autoAcceptDelaySec };
}
