import { Minus, Plus } from "lucide-react";

import { IconButton } from "../../components/ui/button";

export function RoomCapacityStepper({
  id,
  label,
  value,
  onChange,
  minimum = 2,
  maximum = 15,
}: Readonly<{
  id: string;
  label: string;
  value: number;
  onChange(value: number): void;
  minimum?: number;
  maximum?: number;
}>) {
  return (
    <div className="grid gap-2">
      <span id={`${id}-label`} className="text-label">{label}</span>
      <div className="grid h-11 grid-cols-[44px_minmax(40px,1fr)_44px] overflow-hidden rounded-md border border-border-strong bg-surface-elevated" role="group" aria-labelledby={`${id}-label`}>
        <IconButton label={`${label} 줄이기`} variant="ghost" className="h-full rounded-none" disabled={value <= minimum} onClick={() => onChange(value - 1)}>
          <Minus aria-hidden="true" />
        </IconButton>
        <output className="grid place-items-center border-x border-border text-[14px] font-semibold">{value}</output>
        <IconButton label={`${label} 늘리기`} variant="ghost" className="h-full rounded-none" disabled={value >= maximum} onClick={() => onChange(value + 1)}>
          <Plus aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
