import { useEffect, useState } from "react";
import { NAV_ITEMS, Sidebar, type Page } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { useAutoAccept } from "./features/autoaccept/useAutoAccept";
import { ChampSelectPage } from "./features/champselect/ChampSelectPage";
import { HomePage } from "./features/home/HomePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TierListPage } from "./features/tierlist/TierListPage";
import { useChampionStore } from "./stores/championStore";
import { useLcuStore } from "./stores/lcuStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useStatsStore } from "./stores/statsStore";

/** Runs the background modules; each one only subscribes while enabled. */
function FeatureRunner() {
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);
  useAutoAccept(loaded && settings.autoAccept, settings.autoAcceptDelaySec);
  return null;
}

/** Jumps to the champ select assistant when a champ select starts. */
function useAutoOpenChampSelect(navigate: (page: Page) => void): void {
  const phase = useLcuStore((state) => state.phase);
  const enabled = useSettingsStore((state) => state.loaded && state.settings.counters);

  useEffect(() => {
    if (enabled && phase === "ChampSelect") navigate("champselect");
  }, [enabled, phase, navigate]);
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const initLcu = useLcuStore((state) => state.init);
  const initStats = useStatsStore((state) => state.init);
  const loadSettings = useSettingsStore((state) => state.load);
  const loadChampions = useChampionStore((state) => state.load);

  useEffect(() => {
    void loadSettings();
    void loadChampions();
    const stopLcu = initLcu();
    const stopStats = initStats();
    return () => {
      stopLcu();
      stopStats();
    };
  }, [initLcu, initStats, loadSettings, loadChampions]);

  useAutoOpenChampSelect(setPage);
  const openSettings = () => setPage("settings");
  const title = NAV_ITEMS.find((item) => item.page === page)?.label ?? "";

  return (
    <div className="flex h-full">
      <FeatureRunner />
      <Sidebar current={page} onNavigate={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <UpdateBanner />
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-8">
          {page === "home" && <HomePage onNavigate={setPage} />}
          {page === "champselect" && <ChampSelectPage onOpenSettings={openSettings} />}
          {page === "tierlist" && <TierListPage onOpenSettings={openSettings} />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
