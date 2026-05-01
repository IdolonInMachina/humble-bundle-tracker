import type { ItemRow } from "../api/types";

const COLORS: Record<ItemRow["status"], string> = {
  unclaimed: "bg-amber-100 text-amber-900",
  revealed: "bg-blue-100 text-blue-900",
  redeemed: "bg-emerald-100 text-emerald-900",
};

export function StatusBadge({ status }: { status: ItemRow["status"] }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${COLORS[status]}`}>{status}</span>
  );
}
