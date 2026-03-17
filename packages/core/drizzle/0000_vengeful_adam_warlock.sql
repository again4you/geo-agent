CREATE TABLE `change_impacts` (
	`change_id` text PRIMARY KEY NOT NULL,
	`measured_at` text NOT NULL,
	`score_before` real NOT NULL,
	`score_after` real NOT NULL,
	`delta` real NOT NULL,
	`delta_pct` real NOT NULL,
	`per_llm_impact` text DEFAULT '{}' NOT NULL,
	`confidence` real NOT NULL,
	`confounders` text DEFAULT '[]' NOT NULL,
	`verdict` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `change_records` (
	`change_id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`url` text NOT NULL,
	`changed_at` text NOT NULL,
	`change_type` text NOT NULL,
	`change_summary` text NOT NULL,
	`diff` text NOT NULL,
	`snapshot_before` text NOT NULL,
	`snapshot_after` text,
	`triggered_by` text DEFAULT 'auto' NOT NULL,
	`strategy_ref` text
);
--> statement-breakpoint
CREATE TABLE `content_snapshots` (
	`snapshot_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`captured_at` text NOT NULL,
	`html_hash` text NOT NULL,
	`content_text` text NOT NULL,
	`structured_data` text DEFAULT '{}' NOT NULL,
	`geo_score` text,
	`llm_responses` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `error_events` (
	`error_id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`agent_id` text NOT NULL,
	`target_id` text NOT NULL,
	`error_type` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`resolved` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `geo_time_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`llm_service` text NOT NULL,
	`measured_at` text NOT NULL,
	`geo_score` real NOT NULL,
	`citation_rate` real NOT NULL,
	`citation_rank` integer,
	`change_id` text,
	`delta_score` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`pipeline_id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`stage` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	`analysis_report_ref` text,
	`optimization_plan_ref` text,
	`validation_report_ref` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`resumable` integer DEFAULT false NOT NULL,
	`resume_from_stage` text
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`target_queries` text DEFAULT '[]' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`competitors` text DEFAULT '[]' NOT NULL,
	`business_goal` text DEFAULT '' NOT NULL,
	`llm_priorities` text DEFAULT '[]' NOT NULL,
	`deployment_mode` text DEFAULT 'suggestion_only' NOT NULL,
	`deployment_config` text,
	`notifications` text,
	`monitoring_interval` text DEFAULT 'daily' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
