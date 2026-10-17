import { Toggle } from "../../components/Toggle";
import { useSettingsStore } from "../../stores/settingsStore";
import { DataPanel } from "./DataPanel";
import { FEATURES, MAX_ACCEPT_DELAY_SEC, type FeatureInfo } from "./settings";

function AcceptDelay() {
  const delay = useSettingsStore((state) => state.settings.autoAcceptDelaySec);
  const update = useSettingsStore((state) => state.update);

  return (
    <label className="mt-3 flex items-center gap-3 text-sm text-muted">
      Retardo
      <input
        type="range"
        min={0}
        max={MAX_ACCEPT_DELAY_SEC}
        value={delay}
        onChange={(e) => void update("autoAcceptDelaySec", Number(e.target.value))}
        className="w-40 accent-gold"
      />
      <span className="w-8 text-text tabular-nums">{delay}s</span>
    </label>
  );
}

function FeatureRow({ feature }: { feature: FeatureInfo }) {
  const enabled = useSettingsStore((state) => state.settings[feature.key]);
  const update = useSettingsStore((state) => state.update);

  return (
    <li className="flex items-start justify-between gap-6 border-b border-line px-5 py-4 last:border-b-0">
      <div>
        <p className="flex items-center gap-2 font-medium">
          {feature.label}
          {!feature.available && (
            <span className="rounded bg-panel-2 px-2 py-0.5 text-[10px] tracking-wider text-muted uppercase">
              Próximamente
            </span>
          )}
        </p>
        <p className="text-sm text-muted">{feature.description}</p>
        {feature.key === "autoAccept" && enabled && <AcceptDelay />}
      </div>
      <Toggle
        checked={enabled}
        disabled={!feature.available}
        label={feature.label}
        onChange={(value) => void update(feature.key, value)}
      />
    </li>
  );
}

export function SettingsPage() {
  const error = useSettingsStore((state) => state.error);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Estadísticas en línea</h2>
        <p className="mb-4 text-sm text-muted">Se consultan en línea cada vez que abres la app; no se guarda nada en tu PC.</p>
        <DataPanel />
      </div>
      <div>
      <h2 className="mb-1 text-lg font-semibold">Módulos</h2>
      <p className="mb-4 text-sm text-muted">Activa solo lo que uses. Los módulos desactivados no consumen recursos.</p>
      {error && <p className="mb-4 rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <ul className="rounded-lg border border-line bg-panel">
        {FEATURES.map((feature) => (
          <FeatureRow key={feature.key} feature={feature} />
        ))}
      </ul>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        BoostBochan isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
        officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are
        trademarks or registered trademarks of Riot Games, Inc.
      </p>
    </div>
  );
}
