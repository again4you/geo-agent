import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema.js";
import type { AppSettings } from "../config/settings.js";

export type GeoDatabase = ReturnType<typeof createDatabase>;

/**
 * Creates and returns a drizzle database instance backed by libSQL (SQLite-compatible).
 * No native compilation required — works on all platforms including Windows.
 */
export function createDatabase(settings: AppSettings) {
	const dbPath = path.isAbsolute(settings.db_path)
		? settings.db_path
		: path.join(settings.workspace_dir, settings.db_path);

	// Ensure the directory exists
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });

	const client = createClient({
		url: `file:${dbPath}`,
	});

	const db = drizzle(client, { schema });
	return db;
}
