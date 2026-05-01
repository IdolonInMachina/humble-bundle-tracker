import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { setupFts } from "./fts.ts";

const dbPath = process.env.DB_PATH ?? "./data/humble.db";
export const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");
setupFts(sqlite);

export const db = drizzle(sqlite);
