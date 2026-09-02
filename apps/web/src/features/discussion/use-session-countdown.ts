import * as React from "react";

export function useSessionCountdown(
  serverTime: string | undefined,
  deadline: string | null | undefined,
): number {
  const [now, setNow] = React.useState(Date.now());
  const offset = React.useMemo(
    () => (serverTime === undefined ? 0 : Date.parse(serverTime) - Date.now()),
    [serverTime],
  );

  React.useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return 0;
  return Math.max(0, Math.ceil((Date.parse(deadline) - (now + offset)) / 1_000));
}
