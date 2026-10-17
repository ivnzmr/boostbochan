import { useCallback, useEffect, useState } from "react";
import { NAV_ITEMS, Sidebar, type Page } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { useAutoAccept } from "./features/autoaccept/useAutoAccept";
import { useAutoBuild } from "./features/builds/useAutoBuild";
import { ChampSelectPage } from "./features/champselect/ChampSelectPage";
import { CoachPage } from "./features/coach/CoachPage";
import { HomePage } from "./features/home/HomePage";
import { useOverlayController } from "./features/overlay/useOverlayController";
import { ProfilePage } from "./features/profile/ProfilePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TierListPage } from "./features/tierlist/TierListPage";
import { useChampionStore } from "./stores/championStore";
import { useLcuStore } from "./stores/lcuStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useStatsStore } from "./stores/statsStore";

/** Runs the background modules; each one only acts while enabled. */
function FeatureRunner() {
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);
  useAutoAccept(loaded && settings.autoAccept, settings.autoAcceptDelaySec);
  useAutoBuild(loaded && (settings.autoRunes || settings.autoSpells || settings.autoItems), settings);
  useOverlayController(loaded && settings.overlay);
  return null;
}

/** Opens the champ select assistant when a champ select starts, and the coach after a game. */
function useAutoNavigation(navigate: (page: Page) => void, openCoach: () => void): void {
  const phase = useLcuStore((state) => state.phase);
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);

  useEffect(() => {
    if (!loaded) return;
    if (settings.counters && phase === "ChampSelect") navigate("champselect");
    if (settings.coach && phase === "EndOfGame") openCoach();
  }, [loaded, settings.counters, settings.coach, phase, navigate, openCoach]);
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [coachGame, setCoachGame] = useState<number | null>(null);
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

  const analyze = useCallback((gameId: number | null) => {
    setCoachGame(gameId);
    setPage("coach");
  }, []);
  // After a game the newest match is picked automatically (null = latest).
  const openLatestCoach = useCallback(() => analyze(null), [analyze]);
  useAutoNavigation(setPage, openLatestCoach);

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
          {page === "profile" && <ProfilePage onAnalyze={analyze} />}
          {page === "coach" && <CoachPage key={coachGame ?? "latest"} initialGameId={coachGame} />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
