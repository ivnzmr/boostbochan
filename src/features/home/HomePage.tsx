import { BarChart3, Swords } from "lucide-react";
import type { Page } from "../../components/Sidebar";
import { FEATURES } from "../settings/settings";
import { phaseLabel, profileIconUrl } from "../../lib/gameflow";
import { useLcuStore } from "../../stores/lcuStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStatsStore } from "../../stores/statsStore";

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-5 ${className}`}>
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function SummonerHero() {
  const { status, summoner, phase } = useLcuStore();

  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-accent/25 via-panel to-panel p-6">
      {status.connected && summoner ? (
        <div className="flex items-center gap-5">
          <img
            src={profileIconUrl(summoner.profileIconId)}
            alt=""
            className="h-20 w-20 rounded-2xl border-2 border-accent shadow-lg shadow-accent/30"
          />
          <div>
            <p className="text-2xl font-bold">
              {summoner.gameName}
              <span className="text-muted"> #{summoner.tagLine}</span>
            </p>
            <p className="text-sm text-muted">Nivel {summoner.summonerLevel} · EUW</p>
            <p className="mt-2 inline-block rounded-full bg-panel-2 px-3 py-1 text-xs text-accent">{phaseLabel(phase)}</p>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xl font-semibold">Bienvenido a BoostBochan</p>
          <p className="mt-1 text-sm text-muted">Abre el cliente de League of Legends y te conectaremos automáticamente.</p>
        </div>
      )}
    </section>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const summary = useStatsStore((s) => s.summary);
  const actions = [
    { page: "champselect" as const, icon: Swords, title: "Asistente de counters", text: "Simula o usa en directo" },
    { page: "tierlist" as const, icon: BarChart3, title: "Tier list", text: `${summary.soloqGames.toLocaleString("es-ES")} partidas analizadas` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {actions.map(({ page, icon: Icon, title, text }) => (
        <button
          key={page}
          type="button"
          onClick={() => onNavigate(page)}
          className="flex items-center gap-4 rounded-xl border border-line bg-panel p-5 text-left transition-colors hover:border-accent"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon size={22} />
          </span>
          <span>
            <span className="block font-medium">{title}</span>
            <span className="text-sm text-muted">{text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ModulesCard() {
  const settings = useSettingsStore((state) => state.settings);
  const active = FEATURES.filter((feature) => feature.available && settings[feature.key]);

  return (
    <Card title="Módulos activos">
      {active.length === 0 ? (
        <p className="text-sm text-muted">Ninguno. Actívalos en Ajustes.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {active.map((feature) => (
            <li key={feature.key} className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent">
              {feature.label}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityCard() {
  const activity = useLcuStore((state) => state.activity);

  return (
    <Card title="Actividad">
      {activity.length === 0 ? (
        <p className="text-sm text-muted">Sin actividad todavía.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {activity.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="text-muted tabular-nums">{entry.time.toLocaleTimeString()}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <SummonerHero />
      <QuickActions onNavigate={onNavigate} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ModulesCard />
        <ActivityCard />
      </div>
    </div>
  );
}
