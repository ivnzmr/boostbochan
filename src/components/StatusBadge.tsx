interface StatusBadgeProps {
  connected: boolean;
}

export function StatusBadge({ connected }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-ok shadow-[0_0_8px] shadow-ok" : "bg-bad"}`} />
      <span className={connected ? "text-ok" : "text-muted"}>
        {connected ? "Cliente conectado" : "Cliente no detectado"}
      </span>
    </span>
  );
}
