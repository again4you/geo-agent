# GEO Agent System — 작업 기록 및 지침

## 프로젝트 개요

**GEO (Generative Engine Optimization)** Agent System: LLM 서비스(ChatGPT, Claude, Gemini, Perplexity 등)가 Target Web Page의 데이터를 우선적으로, 정확하게 참조하도록 콘텐츠를 최적화하는 에이전트 시스템.

## 기술 스택 결정사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 언어 | TypeScript (Node.js 20+) | 전체 시스템 |
| 모노레포 | npm workspaces | 4개 패키지 (core, skills, cli, dashboard) |
| 에이전트 엔진 | pi-mono (github.com/badlogic/pi-mono) | 버전 고정, upstream 비추적 |
| 스킬 시스템 | openclaw 호환 3-tier (Bundled/Managed/Workspace) | |
| 스키마 검증 | Zod schemas → TypeScript 타입 추론 | 모든 데이터 타입 |
| DB (v1) | SQLite + drizzle-orm | Repository 패턴 |
| DB (v2+) | PostgreSQL 마이그레이션 예정 | |
| 백엔드 API | Hono (localhost:3000) | |
| CLI | Commander.js | `geo start/stop/status/init` |
| 코드 품질 | Biome (lint/format) | 탭 들여쓰기, 더블 쿼트, 세미콜론 |
| 테스트 | vitest | |
| 기본 LLM | GPT-4o (OpenAI) | 대시보드에서 변경 가능 |
| LLM 인증 | API Key + OAuth 모두 지원 | OpenAI/Anthropic/Google/Perplexity/Microsoft/Meta |

## GEO 점수 가중치 (확정)

- Citation Rate: 25%
- Citation Accuracy: 20%
- Info Recognition: 20%
- Coverage: 15%
- Rank Position: 10%
- Structured Score: 10%

## 파이프라인 상태 머신

```
INIT → ANALYZING → STRATEGIZING → OPTIMIZING → VALIDATING → COMPLETED
                                                              │
                                                    FAILED / PARTIAL_FAILURE
```

## 완료된 작업

### Phase 0: 아키텍처 설계
- [x] ARCHITECTURE.md 작성 (2500+ 줄)
- [x] P0 버그 5건 수정 (섹션 번호, Python 잔재, CLI 정합성, 타입 표기)
- [x] P1 항목 모두 완료:
  - 4-C: 12+ 핵심 데이터 타입 정의
  - 4-A: 6개 에이전트 시스템 프롬프트 + 편집 UI
  - 9-A: 에러 핸들링 (재시도, 타임아웃, 롤백)
  - 9-B: LLM 추상화 (GPT-4o 기본, 멀티 프로바이더, API Key + OAuth)
  - 9-C: 배포 흐름 (direct/cms_api/suggestion_only)
  - 9-D: SQLite 스키마 (7 테이블)

### Phase 1: 코드 구현 ✅

#### 모노레포 기반 설정 ✅
- root: package.json, tsconfig.json, biome.json
- packages/core: package.json, tsconfig.json
- packages/skills: package.json, tsconfig.json
- packages/dashboard: package.json, tsconfig.json
- packages/cli: package.json, tsconfig.json

#### Zod 스키마 모델 (packages/core/src/models/) ✅
- change-type.ts — ChangeType enum (10종)
- info-recognition.ts — InfoCategory, AccuracyLevel, InfoRecognitionPerLLM/Item/Score
- llm-probe.ts — QueryType, LLMProbe
- geo-score.ts — GeoScorePerLLM, GeoScore, GEO_SCORE_WEIGHTS
- target-profile.ts — CompetitorEntry, LLMPriority, DeploymentConfig, TargetProfile, Create/Update
- content-snapshot.ts — ContentSnapshot
- change-record.ts — ChangeRecord
- change-impact.ts — Verdict, ChangeImpact
- geo-time-series.ts — GeoTimeSeries
- analysis-report.ts — StructureQuality, CrawlerAccessResult, MachineReadability, ContentAnalysis, StructuredDataAudit, CompetitorGap, AnalysisReport
- optimization-plan.ts — OptimizationTask, OptimizationPlan
- validation-report.ts — ValidationLLMResult, ValidationReport
- effectiveness-index.ts — EffectivenessIndex
- semantic-change-record.ts — SemanticChangeRecord
- agent-prompt-config.ts — AgentId, ContextSlot, AgentPromptConfig
- error-event.ts — ErrorType, Severity, ErrorEvent
- llm-provider-config.ts — OAuthConfig, LLMAuthConfig, ModelRole, LLMModelConfig, LLMProviderConfig
- pipeline-state.ts — PipelineStage, PipelineState, RetryPolicy
- index.ts — barrel export

#### 코어 인프라 (packages/core/src/) ✅
- logger.ts — pino 기반 구조화 로깅
- config/settings.ts — AppSettings (workspace, DB path, port, 기본 모델) + GEO_WORKSPACE 환경변수 지원
- db/schema.ts — drizzle SQLite 테이블 7개 (targets, content_snapshots, change_records, change_impacts, geo_time_series, pipeline_runs, error_events)
- db/connection.ts — SQLite + drizzle 연결 (WAL mode) + 자동 테이블 생성 (ensureTables)
- db/repositories/target-repository.ts — CRUD Repository (JSON 직렬화 수정, 기본 알림 설정, delete 존재 여부 확인)
- prompts/defaults.ts — 6개 에이전트 기본 시스템 프롬프트
- prompts/prompt-loader.ts — load/save/reset + slot injection
- index.ts — 패키지 entry point

#### 대시보드 (packages/dashboard/src/) ✅
- server.ts — Hono 서버 (CORS, trimTrailingSlash, onError JSON 400, EADDRINUSE 처리)
- routes/targets.ts — Target CRUD REST API (initTargetsRouter로 공유 DB 주입)
- routes/settings.ts — Agent Prompt 관리 REST API

#### CLI (packages/cli/src/) ✅
- index.ts — `geo start/stop/status/init` 명령어

#### Skills (packages/skills/src/) ✅
- index.ts — SkillRegistry 인터페이스 + 기본 구현

### Phase 1.5: 빌드 수정, 버그 수정, 테스트 ✅

#### 빌드 수정 사항
- better-sqlite3 `^12.8.0` 업그레이드 (Node 24 prebuilt 지원)
- drizzle-orm `^0.45.1`, drizzle-kit `^0.31.10` 업그레이드
- pino-pretty 런타임 의존성 추가
- core/dashboard package.json exports 필드 추가

#### 발견 & 수정된 버그 9건

| # | 심각도 | 버그 | 수정 내용 |
|---|--------|------|-----------|
| 1 | P0 | JSON 이중 직렬화 (topics/competitors 등이 문자열로 반환) | JSON.stringify 제거, drizzle mode:"json"이 직렬화 처리 |
| 2 | P0 | notifications 미지정 시 null 반환 | DEFAULT_NOTIFICATIONS 객체로 폴백 |
| 3 | P0 | EADDRINUSE 시 프로세스 크래시 | server.on("error") + Promise reject 처리 |
| 4 | P0 | 잘못된 JSON body → 500 응답 | app.onError()에서 SyntaxError 캐치 → 400 |
| 5 | P0 | DB 테이블 자동 생성 안됨 | ensureTables() — CREATE TABLE IF NOT EXISTS 7개 |
| 6 | P1 | DELETE 존재하지 않는 대상에 200 반환 | findById 선확인 → false 반환 → 라우트에서 404 |
| 7 | P1 | 요청마다 새 DB 연결 생성 | initTargetsRouter(db) — 서버 시작 시 공유 DB 주입 |
| 8 | P1 | drizzle.config.ts 상대 경로 문제 | import.meta.url + path.resolve 절대 경로 |
| 9 | P1 | 후행 슬래시 /api/targets/ → 404 | trimTrailingSlash() 미들웨어 추가 → 301 리다이렉트 |

#### 테스트 (vitest) — 492 tests, 10 files ✅
- packages/core/src/models/models.test.ts — 304 tests (18개 Zod 스키마 전체)
- packages/core/src/config/settings.test.ts — 15 tests
- packages/core/src/db/connection.test.ts — 13 tests (WAL, FK, 자동 테이블 생성 회귀 포함)
- packages/core/src/db/repositories/target-repository.test.ts — 32 tests
- packages/core/src/prompts/prompt-loader.test.ts — 33 tests
- packages/core/src/bugs.test.ts — 17 tests (9개 버그 회귀 테스트)
- packages/dashboard/src/routes/targets.test.ts — 47 tests (CRUD + 버그 회귀 22개)
- packages/dashboard/src/routes/settings.test.ts — 22 tests
- packages/dashboard/src/server.test.ts — 1 test (EADDRINUSE)
- packages/skills/src/skills.test.ts — 8 tests

#### Smoke Test 통과 항목
- GET / — 서비스 정보 반환
- GET /health — ok + timestamp
- POST /api/targets — 전체 필드 생성, JSON 필드 정확한 타입 유지
- GET /api/targets/:id — 조회, JSON 필드 배열/객체 유지
- PUT /api/targets/:id — 부분 업데이트, updated_at 변경
- DELETE /api/targets/:id — 정상 삭제 200, 없는 대상 404
- POST 잘못된 JSON → 400
- 후행 슬래시 → 301 리다이렉트
- 기본 알림 설정 적용 확인
- GET /api/settings/agents/prompts — 6개 에이전트 프롬프트

## 다음 할 일 (우선순위 순)

1. **Dashboard 프론트엔드** — 현재 API만 구현, HTML/JS UI 구현 필요 (pi-web-ui 연동)
2. **LLM Provider 설정 API** — `/api/settings/llm-providers` 라우트 구현
3. **LLM 추상화 레이어** — provider-config.ts, geo-llm-client.ts, oauth-manager.ts, cost-tracker.ts
4. **파이프라인 인프라** — state-machine.ts, error-handler.ts, rollback.ts
5. **Bundled Skills 구현** — dual-crawl, schema-builder, geo-scorer 등 핵심 스킬

## 주요 아키텍처 참조

- ARCHITECTURE.md — 전체 시스템 설계서 (섹션 1~12 + 4-A/B/C, 9-A/B/C/D)
- 에이전트 6종: Orchestrator, Analysis, Strategy, Optimization, Validation, Monitoring
- 배포 모드 3종: direct, cms_api, suggestion_only
- InfoRecognition: 제품/가격/스펙 등 LLM 인식 정확도 검증 시스템
- Agent Memory: EffectivenessIndex (구조적) + SemanticChangeArchive (벡터 검색)
- CRAFT 프레임워크: Clarity, Relevance, Authority, Freshness, Traceability
