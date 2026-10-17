import { phaseLabel, profileIconUrl } from "../lib/gameflow";
import { useLcuStore } from "../stores/lcuStore";
import { StatusBadge } from "./StatusBadge";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const { status, summoner, phase } = useLcuStore();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-panel/60 px-8">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-5">
        {status.connected && <span className="text-sm text-muted">{phaseLabel(phase)}</span>}
        <StatusBadge connected={status.connected} />
        {summoner && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-panel-2 py-1 pr-3 pl-1">
            <img src={profileIconUrl(summoner.profileIconId)} alt="" className="h-7 w-7 rounded-full" />
            <span className="text-sm font-medium">{summoner.gameName}</span>
          </div>
        )}
      </div>
    </header>
  );
}
