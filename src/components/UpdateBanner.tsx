import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download } from "lucide-react";
import { errorMessage } from "../lib/errors";

type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "installing" }
  | { kind: "error"; message: string };

/** Checks GitHub Releases once on startup and offers a one-click update. */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    // Dev builds have no published artifacts to compare against.
    if (import.meta.env.DEV) return;
    check()
      .then((update) => update && setState({ kind: "available", update }))
      .catch(() => {
        // Offline or no release yet: stay silent, the app works without updates.
      });
  }, []);

  if (state.kind === "idle") return null;

  const install = async (update: Update) => {
    setState({ kind: "installing" });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (error: unknown) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-accent/40 bg-accent-soft px-8 py-2 text-sm">
      <Download size={16} className="text-accent" />
      {state.kind === "available" && (
        <>
          <span>Nueva versión {state.update.version} disponible.</span>
          <button
            type="button"
            onClick={() => void install(state.update)}
            className="ml-auto rounded-md bg-accent px-3 py-1 font-medium text-white hover:brightness-110"
          >
            Actualizar y reiniciar
          </button>
        </>
      )}
      {state.kind === "installing" && <span>Descargando e instalando la actualización…</span>}
      {state.kind === "error" && <span className="text-bad">No se pudo actualizar: {state.message}</span>}
    </div>
  );
}
