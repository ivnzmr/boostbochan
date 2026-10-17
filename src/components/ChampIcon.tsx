import { useChampion } from "../stores/championStore";

interface ChampIconProps {
  champ: number;
  size?: number;
  className?: string;
}

export function ChampIcon({ champ, size = 40, className = "" }: ChampIconProps) {
  const champion = useChampion(champ);
  const style = { width: size, height: size };

  if (!champion) {
    return <div style={style} className={`rounded-md border border-dashed border-line bg-panel-2 ${className}`} />;
  }
  return (
    <img
      src={champion.image}
      alt={champion.name}
      title={champion.name}
      style={style}
      className={`rounded-md object-cover ${className}`}
      draggable={false}
    />
  );
}
