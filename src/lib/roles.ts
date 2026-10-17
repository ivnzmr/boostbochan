export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  TOP: "Top",
  JUNGLE: "Jungla",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** LCU uses lowercase positions ("middle", "utility"); empty when unknown. */
export function roleFromLcu(position: unknown): Role | null {
  if (typeof position !== "string") return null;
  const upper = position.toUpperCase();
  return isRole(upper) ? upper : null;
}
