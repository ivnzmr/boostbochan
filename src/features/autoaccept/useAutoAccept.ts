import { useEffect } from "react";
import { lcuRequest, onLcuEvent } from "../../lib/lcu";
import { errorMessage } from "../../lib/errors";
import { useLcuStore } from "../../stores/lcuStore";
import { ACCEPT_PATH, READY_CHECK_PATH, shouldAccept } from "./autoAccept";

/** Accepts ready checks after `delaySec`, re-checking first in case the player answered manually. */
export function useAutoAccept(enabled: boolean, delaySec: number): void {
  const addActivity = useLcuStore((state) => state.addActivity);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const acceptIfStillPending = async (): Promise<void> => {
      try {
        const current = await lcuRequest<unknown>("GET", READY_CHECK_PATH);
        if (disposed || !shouldAccept(current)) return;
        await lcuRequest("POST", ACCEPT_PATH);
        addActivity("Partida aceptada automáticamente");
      } catch (error: unknown) {
        addActivity(`No se pudo aceptar la partida: ${errorMessage(error)}`);
      } finally {
        timer = null;
      }
    };

    const unlisten = onLcuEvent((event) => {
      if (event.uri !== READY_CHECK_PATH || timer !== null || !shouldAccept(event.data)) return;
      timer = setTimeout(() => void acceptIfStillPending(), delaySec * 1000);
    });

    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      void unlisten.then((stop) => stop());
    };
  }, [enabled, delaySec, addActivity]);
}
