import { createRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { Route as RootRoute } from "./__root";

function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [cookie, setCookie] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (c: string) => api.setCookie(c),
    onSuccess: async () => {
      setCookie("");
      setFeedback("Saved. Testing...");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      const h = await api.health();
      await qc.invalidateQueries({ queryKey: ["health"] });
      setFeedback(h.cookie_ok ? "Cookie OK." : "Cookie saved but health check failed.");
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold">Settings</h2>
      <section className="space-y-3">
        <h3 className="font-medium">Humble session cookie</h3>
        <p className="text-sm text-slate-600">
          On{" "}
          <a
            href="https://www.humblebundle.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            humblebundle.com
          </a>
          , open DevTools → Application → Cookies → copy the value of{" "}
          <code>_simpleauth_sess</code>.
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm font-mono"
          rows={3}
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          placeholder={
            settings.data?.hasCookie
              ? "(stored — paste a new value to replace)"
              : "paste cookie value"
          }
        />
        <button
          className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50"
          disabled={!cookie || save.isPending}
          onClick={() => save.mutate(cookie)}
        >
          {save.isPending ? "Saving..." : "Save & test"}
        </button>
        {feedback && <p className="text-sm">{feedback}</p>}
        <p className="text-sm">
          Status: cookie {health.data?.cookie_ok ? "✅ ok" : "❌ missing/expired"}
        </p>
      </section>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingsPage,
});
