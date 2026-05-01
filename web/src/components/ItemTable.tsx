import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { ItemRow } from "../api/types";
import { StatusBadge } from "./StatusBadge";

type Props = {
  items: ItemRow[];
  selectable?: boolean;
  onSelectionChange?: (ids: Set<string>) => void;
  selected?: Set<string>;
};

function fmtDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

export function ItemTable({ items, selectable, selected, onSelectionChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    if (!selected || !onSelectionChange) return;
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  return (
    <table className="w-full text-sm">
      <thead className="text-left border-b">
        <tr>
          {selectable && <th className="p-2 w-8"></th>}
          <th className="p-2">Name</th>
          <th className="p-2">Platform</th>
          <th className="p-2">Status</th>
          <th className="p-2">Bundle</th>
          <th className="p-2">Expires</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const isOpen = openId === it.id;
          return (
            <RowGroup
              key={it.id}
              item={it}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : it.id)}
              selectable={!!selectable}
              checked={selected?.has(it.id) ?? false}
              onSelectChange={() => toggleSelect(it.id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RowGroup({
  item,
  isOpen,
  onToggle,
  selectable,
  checked,
  onSelectChange,
}: {
  item: ItemRow;
  isOpen: boolean;
  onToggle: () => void;
  selectable: boolean;
  checked: boolean;
  onSelectChange: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? "");

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof api.patchItem>[1]) => api.patchItem(item.id, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });

  return (
    <>
      <tr className="border-b cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        {selectable && (
          <td className="p-2" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={checked} onChange={onSelectChange} />
          </td>
        )}
        <td className="p-2">{item.name}</td>
        <td className="p-2">{item.platform}</td>
        <td className="p-2"><StatusBadge status={item.status} /></td>
        <td className="p-2 text-slate-500">{item.bundleId}</td>
        <td className="p-2">{fmtDate(item.expiresAt)}</td>
        <td className="p-2">
          {item.claimUrl && (
            <a
              href={item.claimUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline"
            >
              open
            </a>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b bg-slate-50">
          <td colSpan={selectable ? 7 : 6} className="p-3 space-y-3">
            {item.keyValue && (
              <div className="font-mono text-xs">key: {item.keyValue}</div>
            )}
            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (item.notes ?? "")) patch.mutate({ notes });
              }}
              placeholder="notes…"
            />
            <div className="flex gap-2">
              {item.status !== "redeemed" && (
                <button
                  className="px-2 py-1 text-xs border rounded"
                  onClick={() => patch.mutate({ status: "redeemed" })}
                >
                  Mark redeemed
                </button>
              )}
              {item.status === "redeemed" && (
                <button
                  className="px-2 py-1 text-xs border rounded"
                  onClick={() => patch.mutate({ status: "revealed" })}
                >
                  Unmark redeemed
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
