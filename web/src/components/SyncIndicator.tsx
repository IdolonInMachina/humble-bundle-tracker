import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function SyncIndicator() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: api.syncStatus,
    refetchInterval: (query) => (query.state.data?.running ? 1500 : 30_000),
  });

  const trigger = useMutation({
    mutationFn: api.triggerSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-status"] }),
  });

  const last = status.data?.last;
  const running = status.data?.running ?? false;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-600">
        {running
          ? "syncing…"
          : last?.startedAt
          ? `last sync: ${new Date(last.startedAt).toLocaleString()}`
          : "no sync yet"}
      </span>
      <button
        className="px-2 py-1 border rounded disabled:opacity-50"
        disabled={running || trigger.isPending}
        onClick={() => trigger.mutate()}
      >
        Refresh
      </button>
    </div>
  );
}
