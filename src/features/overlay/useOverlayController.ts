import { useEffect } from "react";
import { errorMessage } from "../../lib/errors";
import { useLcuStore } from "../../stores/lcuStore";
import { setOverlayVisible } from "./overlay";

/** Shows the overlay window only while a game is in progress and the module is enabled. */
export function useOverlayController(enabled: boolean): void {
  const phase = useLcuStore((s) => s.phase);
  const addActivity = useLcuStore((s) => s.addActivity);
  const visible = enabled && phase === "InProgress";

  useEffect(() => {
    setOverlayVisible(visible).catch((error: unknown) => addActivity(`Overlay: ${errorMessage(error)}`));
  }, [visible, addActivity]);
}
