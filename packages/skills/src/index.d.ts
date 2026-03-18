/**
 * @geo-agent/skills
 *
 * Skill registry and management for the GEO Agent System.
 * Skills are modular tools that agents use during the optimization pipeline.
 *
 * Skill tiers:
 * - Bundled: Core GEO skills shipped with the system
 * - Managed: Installed from ClawHub registry
 * - Workspace: User-created or agent-generated custom skills
 */
export interface SkillMetadata {
	name: string;
	version: string;
	description: string;
	author: string;
	tags: string[];
	tier: "bundled" | "managed" | "workspace";
	input_schema?: Record<string, unknown>;
	output_schema?: Record<string, unknown>;
}
export interface SkillExecutionContext {
	target_id: string;
	target_url: string;
	workspace_dir: string;
	clone_path?: string;
	[key: string]: unknown;
}
export interface SkillResult {
	success: boolean;
	data?: unknown;
	error?: string;
	duration_ms: number;
}
export interface Skill {
	metadata: SkillMetadata;
	execute(context: SkillExecutionContext, params: Record<string, unknown>): Promise<SkillResult>;
}
export interface SkillRegistry {
	/** List all registered skills */
	listSkills(): SkillMetadata[];
	/** Get a specific skill by name */
	getSkill(name: string): SkillMetadata | null;
	/** Register a new skill */
	registerSkill(skill: Skill): void;
	/** Execute a skill by name */
	executeSkill(
		name: string,
		context: SkillExecutionContext,
		params?: Record<string, unknown>,
	): Promise<SkillResult>;
}
/**
 * Creates a skill registry with bundled skills pre-registered.
 */
export declare function createSkillRegistry(): SkillRegistry;
/** Bundled 스킬 메타데이터 직접 접근 */
export declare function getBundledSkills(): SkillMetadata[];
export {
	dualCrawlSkill,
	crawlTarget,
	type CrawlData,
	_parsers as dualCrawlParsers,
} from "./dual-crawl.js";
export { geoScorerSkill, scoreTarget, type GeoScoreData } from "./geo-scorer.js";
//# sourceMappingURL=index.d.ts.map
