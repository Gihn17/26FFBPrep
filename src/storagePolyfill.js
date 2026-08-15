/*
 * This app was originally built as a Claude.ai artifact, which provides a
 * built-in `window.storage` key-value API for persistence. This file
 * polyfills that same API against our own small backend (see
 * server/index.js), so draft state, imports, and settings are stored
 * server-side in a JSON file rather than per-browser localStorage.
 *
 * That means: open this app from any device on your network and you'll see
 * the same draft board, because everyone is reading/writing the same file
 * on the server (mounted at DATA_DIR, /app/data in the Docker volume).
 *
 * There's a single shared record for all of this — draft picks, notes,
 * league settings, imported projections, everything — regardless of who's
 * picked in the "Viewing as" selector. That selector only drives Tab
 * Access and who's allowed to use the CSV import controls; it does not
 * split this data per person (an earlier per-user version of this did
 * split it, and that was deliberately backed out — one person's import or
 * drafted-player mark needs to be visible to everyone immediately, not
 * siloed to their own copy). See the storage router in server/index.js.
 *
 * There's no authentication here — anyone who can reach the server on your
 * network can read/write this data. Fine for a homelab LAN tool; if you
 * ever expose this outside your network, put it behind a reverse proxy with
 * auth first.
 */
if (typeof window !== "undefined" && !window.storage) {
  const BASE = "/api/storage";

  window.storage = {
    async get(key) {
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(key)}`);
        if (res.status === 404) return null;
        if (!res.ok) return null;
        const data = await res.json();
        return { key: data.key, value: data.value, shared: true };
      } catch (e) {
        return null;
      }
    },
    async set(key, value) {
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { key: data.key, value: data.value, shared: true };
      } catch (e) {
        return null;
      }
    },
    async delete(key) {
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(key)}`, { method: "DELETE" });
        if (!res.ok) return null;
        return { key, deleted: true, shared: true };
      } catch (e) {
        return null;
      }
    },
    async list(prefixArg) {
      try {
        const url = prefixArg ? `${BASE}?prefix=${encodeURIComponent(prefixArg)}` : BASE;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return { keys: data.keys, prefix: prefixArg, shared: true };
      } catch (e) {
        return null;
      }
    },
  };
}
