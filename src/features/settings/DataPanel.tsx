import { RefreshCw } from "lucide-react";
import { useStatsStore } from "../../stores/statsStore";
import { relativeTime } from "../../lib/format";

export function DataPanel() {
  const { summary, error, sync } = useStatsStore();
  const updated = summary.generatedAt ? relativeTime(summary.generatedAt * 1000) : null;

  return (
    <section className="space-y-5 rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Estadísticas</p>
          <p className="text-sm text-muted">
            {summary.syncing
              ? "Descargando estadísticas…"
              : updated
                ? `Actualizadas ${updated}. Se renuevan solas cada día.`
                : "Aún no se han descargado."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={summary.syncing}
          className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          <RefreshCw size={14} className={summary.syncing ? "animate-spin" : ""} /> Actualizar ahora
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Partidas Challenger/GM" value={summary.soloqGames.toLocaleString("es-ES")} />
        <Stat label="Partidas pro (90 días)" value={summary.proGames.toLocaleString("es-ES")} />
        <Stat label="Parches" value={summary.patches.join(", ") || "—"} />
      </div>

      {(summary.lastError || error) && (
        <p className="rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {summary.lastError ?? error}
          {summary.generatedAt && " · Se siguen usando las últimas estadísticas descargadas."}
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Las estadísticas se calculan cada día en la nube a partir de las partidas de los mejores jugadores de EUW y de
        las partidas profesionales (Leaguepedia, peso ×3). No necesitas ninguna API key.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
