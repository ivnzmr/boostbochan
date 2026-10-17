import { useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { ChampIcon } from "../../components/ChampIcon";
import { errorMessage } from "../../lib/errors";
import { compact, pct } from "../../lib/format";
import { ROLE_LABELS, type Role } from "../../lib/roles";
import type { Bucket } from "../../lib/stats";
import { useChampionStore } from "../../stores/championStore";
import { applyItemSet, applyRunes, applySpells, BUCKET_LABELS } from "./apply";
import type { Build, RunePage } from "./build";

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between text-xs font-semibold tracking-widest text-muted uppercase">
        {title}
        {meta && <span className="font-normal tracking-normal normal-case">{meta}</span>}
      </p>
      {children}
    </div>
  );
}

function ItemIcon({ id, size = 36 }: { id: number; size?: number }) {
  const item = useChampionStore((s) => s.items.get(id));
  if (!item) return <div style={{ width: size, height: size }} className="rounded bg-panel-2" />;
  return <img src={item.image} alt={item.name} title={item.name} style={{ width: size, height: size }} className="rounded" />;
}

function Runes({ page }: { page: RunePage }) {
  const runes = useChampionStore((s) => s.runes);
  const styles = useChampionStore((s) => s.styles);
  const icon = (id: number, size: number, extra = "") => {
    const rune = runes.get(id);
    return rune ? <img key={`${id}-${size}-${extra}`} src={rune.icon} alt={rune.name} title={rune.name} style={{ width: size, height: size }} /> : null;
  };
  const [keystone, ...rest] = page.perks;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {styles.get(page.primaryStyle) && <img src={styles.get(page.primaryStyle)!.icon} alt="" className="h-5 w-5 opacity-80" />}
      <span className="rounded-full bg-panel-2 p-1">{icon(keystone, 36)}</span>
      {rest.slice(0, 3).map((id, i) => icon(id, 26, `p${i}`))}
      <ChevronRight size={14} className="text-muted" />
      {styles.get(page.subStyle) && <img src={styles.get(page.subStyle)!.icon} alt="" className="h-5 w-5 opacity-80" />}
      {rest.slice(3, 5).map((id, i) => icon(id, 26, `s${i}`))}
      <span className="ml-1 flex gap-1">{rest.slice(5).map((id, i) => icon(id, 18, `f${i}`))}</span>
    </div>
  );
}

const SKILL_STYLES: Record<string, string> = {
  Q: "bg-[#4ea8ff]/20 text-[#4ea8ff]",
  W: "bg-ok/20 text-ok",
  E: "bg-gold/20 text-gold",
  R: "bg-tier-splus/20 text-tier-splus",
};

interface BuildPanelProps {
  champ: number;
  role: Role | null;
  build: Build | null;
  bucket: Bucket;
  spells?: [number, number];
  canApply: boolean;
}

export function BuildPanel({ champ, role, build, bucket, spells, canApply }: BuildPanelProps) {
  const champion = useChampionStore((s) => s.champions.get(champ));
  const summonerSpells = useChampionStore((s) => s.spells);
  const [status, setStatus] = useState<string | null>(null);

  if (champ <= 0) return null;
  if (!build) {
    return (
      <section className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">
        Aún no hay suficientes partidas de {champion?.name ?? "este campeón"} para recomendar una build.
      </section>
    );
  }

  const applyAll = async () => {
    const name = champion?.name ?? `#${champ}`;
    try {
      setStatus("Aplicando…");
      if (build.runes) await applyRunes(build.runes.value, name);
      if (build.spells && spells) await applySpells(build.spells.value, spells);
      await applyItemSet(champ, name, build, bucket);
      setStatus("Build aplicada en el cliente");
    } catch (error: unknown) {
      setStatus(`Error: ${errorMessage(error)}`);
    }
  };

  return (
    <section className="space-y-5 rounded-lg border border-line bg-panel p-5">
      <header className="flex items-center gap-4">
        <ChampIcon champ={champ} size={48} />
        <div className="flex-1">
          <p className="text-lg font-semibold">Build de {champion?.name}</p>
          <p className="text-xs text-muted">
            {role ? ROLE_LABELS[role] : "—"} · vs {BUCKET_LABELS[bucket]} · {compact(build.games)} partidas Challenger/GM
          </p>
        </div>
        {canApply && (
          <button
            type="button"
            onClick={() => void applyAll()}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            <Download size={16} /> Aplicar al cliente
          </button>
        )}
      </header>
      {status && <p className="text-xs text-muted">{status}</p>}

      <div className="grid grid-cols-2 gap-5">
        {build.runes && (
          <Section title="Runas" meta={`${pct(build.runes.winRate)} · ${compact(build.runes.games)}`}>
            <Runes page={build.runes.value} />
          </Section>
        )}
        {build.spells && (
          <Section title="Hechizos" meta={`${pct(build.spells.winRate)} · ${compact(build.spells.games)}`}>
            <div className="flex gap-2">
              {build.spells.value.map((id) => {
                const spell = summonerSpells.get(id);
                return spell ? <img key={id} src={spell.image} alt={spell.name} title={spell.name} className="h-9 w-9 rounded" /> : null;
              })}
            </div>
          </Section>
        )}
      </div>

      {build.skills && (
        <Section title="Orden de habilidades" meta={`Maximizar ${[...build.skills.value.priority].join(" > ")}`}>
          <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1">
            {build.skills.value.levels.map((skill, i) => (
              <div key={i} className="text-center">
                <span className="block text-[9px] text-muted">{i + 1}</span>
                <span className={`block rounded py-1 text-xs font-bold ${SKILL_STYLES[skill]}`}>{skill}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4">
        <Section title="Inicio">
          <div className="flex gap-1.5">{build.starters.map((id) => <ItemIcon key={id} id={id} />)}</div>
        </Section>
        {build.core && (
          <Section title="Core" meta={`${pct(build.core.winRate)} · ${compact(build.core.games)}`}>
            <div className="flex items-center gap-1.5">
              {build.core.value.map((id, i) => (
                <span key={id} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight size={14} className="text-muted" />}
                  <ItemIcon id={id} size={40} />
                </span>
              ))}
              {build.boots && (
                <>
                  <span className="mx-2 text-muted">+</span>
                  <ItemIcon id={build.boots.value} size={40} />
                </>
              )}
            </div>
          </Section>
        )}
      </div>

      {build.situational.length > 0 && (
        <Section title={`Situacional vs ${BUCKET_LABELS[bucket]}`}>
          <div className="flex flex-wrap gap-3">
            {build.situational.map((s) => (
              <div key={s.item} className="flex flex-col items-center gap-1">
                <ItemIcon id={s.item} />
                <span className="text-[10px] text-muted tabular-nums">{pct(s.winRate, 0)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </section>
  );
}
