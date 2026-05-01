import type { Database } from "bun:sqlite";

export function setupFts(sqlite: Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      name, content='items', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, name) VALUES (new.rowid, new.name);
    END;
    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
    END;
    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
      INSERT INTO items_fts(rowid, name) VALUES (new.rowid, new.name);
    END;
  `);
}

export function searchItems(sqlite: Database, q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const query = `${trimmed.replace(/"/g, '""')}*`;
  const rows = sqlite
    .query<{ id: string }, [string]>(
      `SELECT i.id FROM items i
       JOIN items_fts ON items_fts.rowid = i.rowid
       WHERE items_fts MATCH ?
       ORDER BY rank`,
    )
    .all(query);
  return rows.map((r) => r.id);
}
