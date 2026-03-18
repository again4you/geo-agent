import type { CrawlData } from "./dual-crawl.js";
/**
 * GEO Scorer Skill — 7차원 GEO 평가 점수 산출
 *
 * S1: LLM 크롤링 접근성 (15%)
 * S2: 구조화 데이터 (25%)
 * S3: 콘텐츠 기계가독성 (20%)
 * S4: 팩트 밀도 (10%)
 * S5: 브랜드/조직 메시지 (10%)
 * S6: AI 인프라 (10%)
 * S7: 콘텐츠 네비게이션 (10%)
 */
import type { Skill } from "./index.js";
export interface DimensionScore {
	id: string;
	label: string;
	score: number;
	weight: number;
	details: string[];
}
export interface GeoScoreData {
	overall_score: number;
	grade: string;
	dimensions: DimensionScore[];
	weighted_scores: Record<string, number>;
}
export declare function scoreTarget(data: CrawlData): GeoScoreData;
export declare const geoScorerSkill: Skill;
//# sourceMappingURL=geo-scorer.d.ts.map
