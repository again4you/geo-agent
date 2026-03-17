import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema.js";
import type { AppSettings } from "../config/settings.js";

export type GeoDatabase = ReturnType<typeof createDatabase>;

/**
 * Ensures all required tables exist in the SQLite database.
 * Uses IF NOT EXISTS so it's safe to call on every startup.
 */
function ensureTables(sqlite: InstanceType<typeof Database>): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS targets (
			id TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			topics TEXT NOT NULL DEFAULT '[]',
			target_queries TEXT NOT NULL DEFAULT '[]',
			audience TEXT NOT NULL DEFAULT '',
			competitors TEXT NOT NULL DEFAULT '[]',
			business_goal TEXT NOT NULL DEFAULT '',
			llm_priorities TEXT NOT NULL DEFAULT '[]',
			deployment_mode TEXT NOT NULL DEFAULT 'suggestion_only',
			deployment_config TEXT,
			notifications TEXT,
			monitoring_interval TEXT NOT NULL DEFAULT 'daily',
			status TEXT NOT NULL DEFAULT 'active',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS content_snapshots (
			snapshot_id TEXT PRIMARY KEY,
			url TEXT NOT NULL,
			captured_at TEXT NOT NULL,
			html_hash TEXT NOT NULL,
			content_text TEXT NOT NULL,
			structured_data TEXT NOT NULL DEFAULT '{}',
			geo_score TEXT,
			llm_responses TEXT NOT NULL DEFAULT '[]'
		);

		CREATE TABLE IF NOT EXISTS change_records (
			change_id TEXT PRIMARY KEY,
			experiment_id TEXT NOT NULL,
			url TEXT NOT NULL,
			changed_at TEXT NOT NULL,
			change_type TEXT NOT NULL,
			change_summary TEXT NOT NULL,
			diff TEXT NOT NULL,
			snapshot_before TEXT NOT NULL,
			snapshot_after TEXT,
			triggered_by TEXT NOT NULL DEFAULT 'auto',
			strategy_ref TEXT
		);

		CREATE TABLE IF NOT EXISTS change_impacts (
			change_id TEXT PRIMARY KEY,
			measured_at TEXT NOT NULL,
			score_before REAL NOT NULL,
			score_after REAL NOT NULL,
			delta REAL NOT NULL,
			delta_pct REAL NOT NULL,
			per_llm_impact TEXT NOT NULL DEFAULT '{}',
			confidence REAL NOT NULL,
			confounders TEXT NOT NULL DEFAULT '[]',
			verdict TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS geo_time_series (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			url TEXT NOT NULL,
			llm_service TEXT NOT NULL,
			measured_at TEXT NOT NULL,
			geo_score REAL NOT NULL,
			citation_rate REAL NOT NULL,
			citation_rank INTEGER,
			change_id TEXT,
			delta_score REAL NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS pipeline_runs (
			pipeline_id TEXT PRIMARY KEY,
			target_id TEXT NOT NULL,
			stage TEXT NOT NULL,
			started_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			completed_at TEXT,
			analysis_report_ref TEXT,
			optimization_plan_ref TEXT,
			validation_report_ref TEXT,
			retry_count INTEGER NOT NULL DEFAULT 0,
			error_message TEXT,
			resumable INTEGER NOT NULL DEFAULT 0,
			resume_from_stage TEXT
		);

		CREATE TABLE IF NOT EXISTS error_events (
			error_id TEXT PRIMARY KEY,
			timestamp TEXT NOT NULL,
			agent_id TEXT NOT NULL,
			target_id TEXT NOT NULL,
			error_type TEXT NOT NULL,
			severity TEXT NOT NULL,
			message TEXT NOT NULL,
			context TEXT NOT NULL DEFAULT '{}',
			resolved INTEGER NOT NULL DEFAULT 0
		);
	`);
}

/**
 * Creates and returns a drizzle database instance backed by SQLite.
 * Automatically creates all required tables if they don't exist.
 */
export function createDatabase(settings: AppSettings) {
	const dbPath = path.isAbsolute(settings.db_path)
		? settings.db_path
		: path.join(settings.workspace_dir, settings.db_path);

	// Ensure the directory exists
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");

	// Auto-create tables on startup (idempotent)
	ensureTables(sqlite);

	const db = drizzle(sqlite, { schema });
	return db;
}
