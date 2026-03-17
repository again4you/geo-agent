# GEO Agent System Architecture

> **GEO (Generative Engine Optimization)**: LLM 서비스 및 AI 에이전트들이 Target Web Page의 데이터를 우선적으로, 정확하게 참조하도록 콘텐츠를 최적화하는 에이전트 시스템

---

## 1. 시스템 개요

### 1.1 목적

기존 SEO(Search Engine Optimization)가 검색 크롤러를 대상으로 했다면, GEO는 다음 대상을 위한 최적화를 목표로 한다:

- **LLM 서비스**: ChatGPT, Claude, Gemini, Perplexity, Copilot 등
- **AI 에이전트**: LLM API를 활용한 자동화 에이전트, RAG 파이프라인, Tool-use 에이전트 등
- **AI 검색**: Perplexity, Bing AI, Google AI Overview 등

### 1.2 핵심 가치

```
Target Web Page의 콘텐츠가 LLM이 질의에 응답할 때
  → 높은 빈도로 인용(Citation)되고
  → 정확하게 해석되며
  → 신뢰할 수 있는 출처로 참조되는 것
```

---

## 2. 전체 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                        GEO Agent System                              │
│                                                                      │
│  ┌─────────────────┐     ┌──────────────────────────────────────┐   │
│  │  Orchestrator   │────▶│           Agent Pipeline             │   │
│  │  (중앙 조율)    │     │                                      │   │
│  └─────────────────┘     │  1. Analysis Agent (분석)            │   │
│          │               │  2. Strategy Agent (전략 수립)       │   │
│          │               │  3. Optimization Agent (최적화 실행) │   │
│          │               │  4. Validation Agent (검증)          │   │
│          │               │  5. Monitoring Agent (모니터링)      │   │
│          │               └──────────────────────────────────────┘   │
│          │                                                           │
│  ┌───────▼──────────────────────────────────────────────────────┐   │
│  │                    Shared Infrastructure                      │   │
│  │  Vector DB │ Knowledge Base │ Task Queue │ Metrics Store     │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │         Change Tracking Store  (★ 핵심)              │    │   │
│  │  │  Content Snapshots │ Change Diffs │ GEO Time-series  │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
  ┌───────────────┐          ┌───────────────────┐
  │  Target Web   │          │   LLM Services    │
  │  Page(s)      │          │  (테스트 대상)    │
  └───────────────┘          └───────────────────┘
```

---

## 3. 에이전트 구성 및 역할

### 3.1 Orchestrator

- 전체 파이프라인의 실행 순서와 상태를 관리
- 각 에이전트에 태스크를 분배하고 결과를 수집
- 반복(iteration) 루프를 통한 지속적 최적화 주도
- 긴급 롤백 및 에러 핸들링 담당

### 3.2 Analysis Agent (분석 에이전트)

**목적**: Target Web Page의 현재 상태를 다각도로 분석

**수행 작업**:
- 페이지 크롤링 및 콘텐츠 추출 (HTML, 구조화 데이터, 메타데이터)
- 기존 Schema.org / JSON-LD 마크업 감사
- 콘텐츠 밀도, 명확성, 인용 가능성 점수 산출
- 경쟁 페이지 대비 GEO 격차 분석
- LLM별 인덱싱 현황 파악 (`robots.txt` AI 크롤러 허용 상태, `llms.txt` 존재 여부 확인)
- **기계 가독성 감사 (Machine Readability Audit)** — 아래 3.2-A 참조

**출력**: `AnalysisReport` (JSON 구조화 보고서)

#### 3.2-A. 기계 가독성 감사 (Machine Readability Audit)

Target Page가 과도한 `<div>` 중첩이나 JavaScript 의존으로 인해 LLM 크롤러가 콘텐츠를 제대로 수집하지 못하는 경우, 이후의 모든 GEO 최적화는 무의미하다. 따라서 Analysis Agent는 **최적화에 앞서** 기계 가독성을 진단한다.

**(1) 이중 크롤링 비교 (Dual Crawl Diff)**

동일 URL을 두 가지 방식으로 크롤링하여 콘텐츠 차이를 측정한다.

```
크롤링 A: Playwright (JS 실행, 풀 렌더링)
  → 사람이 브라우저에서 보는 것과 동일한 콘텐츠

크롤링 B: httpx (raw HTTP, JS 미실행)
  → LLM 크롤러(GPTBot, ClaudeBot 등)가 보는 것에 근사

비교 지표:
  js_dependency_ratio = 1 - (len(text_B) / len(text_A))
  → 0에 가까울수록 양호 (JS 없이도 콘텐츠 접근 가능)
  → 0.5 이상이면 위험 (콘텐츠 절반 이상이 JS 의존)
  → 0.9 이상이면 치명적 (SPA — 거의 빈 페이지)
```

**(2) DOM 구조 품질 점수 (Structure Quality Score)**

```
StructureQuality {
  semantic_tag_ratio   : float   # 시맨틱 태그 / 전체 태그 비율
                                 # <article>, <section>, <main>, <nav>,
                                 # <header>, <footer>, <aside>, <figure>
                                 # 0.3 이상 양호, 0.1 미만 불량

  avg_div_depth        : float   # 평균 div 중첩 깊이
                                 # 5 이하 양호, 10 이상 불량

  max_div_depth        : int     # 최대 div 중첩 깊이
                                 # 15 이상이면 파싱 위험

  text_to_markup_ratio : float   # 순수 텍스트 / HTML 전체 크기
                                 # 0.3 이상 양호, 0.1 미만 불량

  heading_hierarchy    : bool    # H1→H2→H3 순서가 올바른지
  has_main_landmark    : bool    # <main> 또는 role="main" 존재 여부
}
```

**(3) AI 크롤러 접근성 테스트**

주요 AI 크롤러의 User-Agent로 실제 요청하여 응답을 확인한다.

```
테스트 대상 User-Agent:
  - GPTBot          (OpenAI)
  - ClaudeBot       (Anthropic)
  - Google-Extended  (Google AI)
  - Bytespider      (ByteDance)
  - PerplexityBot   (Perplexity)
  - cohere-ai       (Cohere)

확인 항목:
  - HTTP 응답 코드 (200 vs 403/429 — 차단 여부)
  - 응답 본문에 실제 콘텐츠 포함 여부
  - robots.txt에서 해당 봇 차단 여부
```

**(4) 기계 가독성 종합 등급**

```
MachineReadabilityGrade:
  A: JS 의존도 낮음 + 시맨틱 구조 양호 + 크롤러 미차단
  B: 일부 개선 필요하나 핵심 콘텐츠는 접근 가능
  C: JS 의존도 높거나 시맨틱 구조 불량 — 최적화 전 구조 개선 필요
  F: SPA + 크롤러 차단 — GEO 최적화 불가, 근본 해결 선행 필수
```

등급이 C 이하인 경우, Strategy Agent는 콘텐츠 최적화보다 **구조 개선을 우선 태스크**로 배치한다.

### 3.3 Strategy Agent (전략 수립 에이전트)

**목적**: 분석 결과를 바탕으로 GEO 최적화 전략을 수립

**수행 작업**:
- GEO 점수 기반 우선순위 태스크 도출
- 타겟 LLM 서비스별 특성에 맞는 전략 커스터마이징
- 콘텐츠 수정, 구조 변경, 메타데이터 추가 계획 수립
- A/B 테스트 시나리오 설계
- ROI 예측 및 실행 로드맵 생성

**출력**: `OptimizationPlan` (우선순위 정렬된 태스크 목록)

### 3.4 Optimization Agent (최적화 실행 에이전트)

**목적**: 전략에 따라 실제 콘텐츠 최적화 작업 수행

**수행 작업**:

| 최적화 영역 | 세부 작업 |
|---|---|
| **기계 가독성 개선** (등급 C 이하 시 최우선) | 아래 3.4-A 참조 |
| 구조화 데이터 | Schema.org JSON-LD 생성/수정, FAQ/HowTo/Article 마크업 |
| 콘텐츠 강화 | 팩트 밀도 향상, 인용 가능한 통계·수치 삽입, 권위 있는 출처 연결 |
| 시맨틱 구조 | 명확한 H1-H6 계층, 논리적 단락 구조, 핵심 개념 강조 |
| AI 접근성 | AI 크롤러 허용 `robots.txt` 설정, `llms.txt` 생성 (실험적 — 아래 주의사항 참조) |
| 메타데이터 | OG 태그, 메타 설명, 캐노니컬 URL 최적화 |
| 콘텐츠 청킹 | LLM 컨텍스트 윈도우에 맞는 정보 단위 구조화 |
| 신뢰 시그널 | 저자 정보(E-E-A-T), 날짜/업데이트 명시, 출처 인용 강화 |

**출력**: 수정된 HTML/콘텐츠 패치, 구조화 데이터 파일

#### 3.4-A. 기계 가독성 개선 (Machine Readability Remediation)

Analysis Agent의 기계 가독성 등급이 C 이하인 경우, 콘텐츠 최적화에 앞서 구조 개선을 우선 실행한다. 등급별 대응 전략:

**등급 C (JS 의존도 높거나 시맨틱 구조 불량)**:

| 대응 | 설명 |
|---|---|
| div → 시맨틱 태그 전환 | `<div class="article">` → `<article>`, `<div class="nav">` → `<nav>` 등 매핑 규칙 기반 패치 생성 |
| heading 계층 정규화 | H1→H2→H3 순서 교정, 장식용 heading 제거 |
| `<main>` 랜드마크 추가 | 본문 영역을 `<main>`으로 감싸서 크롤러가 핵심 콘텐츠를 식별하도록 함 |
| JSON-LD 구조화 데이터 추가 | 구조 개선이 완료되기 전에도 핵심 정보를 기계 가독 형태로 즉시 제공 |
| llms.txt 병행 생성 (보조) | 저비용으로 클린 텍스트 버전 생성 — 단, 효과 미검증이므로 보조 수단으로만 취급 |

**등급 F (SPA + 크롤러 차단)**:

| 대응 | 설명 |
|---|---|
| SSR/Pre-rendering 권고 | 직접 적용 불가 시 권고 리포트 생성 (Next.js SSR, Prerender.io 등 구체적 방안 포함) |
| Dynamic Rendering 권고 | AI 크롤러 User-Agent 감지 시 pre-rendered HTML 제공하는 서버 설정 가이드 |
| robots.txt 차단 해제 | GPTBot, ClaudeBot 등이 차단되어 있는 경우 해제 패치 생성 |
| JSON-LD 우회 전략 | 페이지 본문이 JS 종속이더라도 JSON-LD는 초기 HTML에 포함 가능 — 핵심 정보를 구조화 데이터로 전달 |
| llms.txt 병행 생성 (보조) | 저비용으로 생성하되, 효과 미검증이므로 JSON-LD와 SSR/Pre-rendering을 우선 |
| 콘텐츠 API 엔드포인트 권고 | Tool-use 에이전트 대상으로 구조화된 API 제공 권고 |

**우선순위 원칙**: 기계 가독성 등급이 C 이하이면, `ChangeType.SEMANTIC_STRUCTURE` 태스크가 다른 모든 최적화 태스크보다 우선한다. 콘텐츠를 읽을 수 없는 상태에서 콘텐츠 품질을 개선하는 것은 무의미하기 때문이다.

#### 3.4-B. llms.txt에 대한 주의사항

> **현황 (2026-03 기준)**: llms.txt는 2024년 제안된 규격으로, LLM 서비스에게 사이트의 구조와 핵심 콘텐츠를 알려주기 위한 표준 파일이다. 그러나 주요 LLM 서비스(ChatGPT, Claude, Gemini, Perplexity 등)가 이를 실제로 크롤링하고 활용한다는 **공개된 증거가 없다.**

본 시스템에서 llms.txt의 취급 원칙:

| 원칙 | 설명 |
|---|---|
| **보조 수단으로만 취급** | llms.txt를 주요 최적화 전략으로 의존하지 않는다 |
| **낮은 비용으로 적용** | 생성 자체는 저비용이므로 "있으면 좋은 것" 수준으로 적용 |
| **효과 측정 대상** | Change Tracking에서 llms.txt 추가의 실제 효과를 데이터로 검증 |
| **검증된 수단 우선** | robots.txt, JSON-LD, 시맨틱 HTML, 메타데이터 등 효과가 입증된 기술을 항상 우선 |

llms.txt의 채택 현황은 Monitoring Agent가 주기적으로 확인하며, 주요 LLM 서비스에서 실제 활용이 확인되면 전략 우선순위를 상향 조정한다.

### 3.5 Validation Agent (검증 에이전트)

**목적**: 실제 LLM 서비스에 질의하여 최적화 효과를 측정

**수행 작업**:
- 다수의 LLM 서비스에 타겟 주제 관련 질의 자동 발송
- 응답에서 Target Page 인용 여부 및 빈도 측정
- 인용 정확도 (할루시네이션 여부) 평가
- 최적화 전/후 GEO 점수 비교
- 멀티 LLM 커버리지 리포트 생성

**테스트 대상 LLM 서비스**:
```
- OpenAI ChatGPT (GPT-4o, o-series)
- Anthropic Claude (claude-opus-4-6, claude-sonnet-4-6)
- Google Gemini (Gemini 2.0 Flash, Pro)
- Perplexity AI (sonar-pro)
- Microsoft Copilot (Bing AI)
- Meta AI (Llama 기반)
```

**출력**: `ValidationReport` (LLM별 인용률, 정확도, GEO 점수)

### 3.6 Monitoring Agent (모니터링 에이전트)

**목적**: 지속적으로 GEO 성과를 추적하고 이상 감지

**수행 작업**:
- 주기적 LLM 질의를 통한 인용률 트래킹
- LLM 서비스 업데이트 감지 및 영향 분석
- 경쟁 페이지의 GEO 변화 모니터링
- 알람 및 자동 재최적화 트리거

---

## 3-B. Change Tracking 시스템 (변경 효과 추적)

> **핵심 질문**: "어떤 콘텐츠 변경이 GEO 점수를 얼마나 바꿨는가?"

### 3-B.1 설계 원칙

```
변경(Change)  →  측정(Measure)  →  귀인(Attribution)  →  학습(Learn)
     │                │                   │                    │
  무엇을             얼마나             왜 바뀌었는가          다음 전략에
  바꿨는가          바뀌었는가                                   반영
```

모든 콘텐츠 변경은 **명시적 실험(experiment)** 단위로 관리된다.
변경 → 측정 → 귀인의 인과관계를 데이터로 추적하여, 어떤 유형의 변경이 어떤 LLM에서 얼마나 효과적인지 학습한다.

### 3-B.2 Content Snapshot (콘텐츠 스냅샷)

변경 전/후 페이지 상태를 버전으로 저장한다.

```
ContentSnapshot {
  snapshot_id   : UUID
  url           : str
  captured_at   : datetime
  html_hash     : str              # 변경 감지용 해시
  content_text  : str              # 순수 텍스트 추출본
  structured_data: dict            # JSON-LD, 메타데이터
  geo_score     : GeoScore         # 해당 시점 GEO 점수
  llm_responses : List[LLMProbe]   # 해당 시점 LLM 질의 결과
}
```

### 3-B.3 Change Record (변경 기록)

Optimization Agent가 변경을 적용할 때 반드시 Change Record를 생성한다.

```
ChangeRecord {
  change_id       : UUID
  experiment_id   : UUID              # 연관 실험 묶음
  url             : str
  changed_at      : datetime
  change_type     : ChangeType        # 아래 분류 참고
  change_summary  : str               # 변경 내용 자연어 요약
  diff            : UnifiedDiff       # 전/후 텍스트 diff
  snapshot_before : snapshot_id
  snapshot_after  : snapshot_id       # 측정 완료 후 채워짐
  triggered_by    : str               # 'auto' | 'manual' | 'scheduled'
  strategy_ref    : optimization_plan_id
}
```

**ChangeType 분류**:

| 코드 | 설명 |
|---|---|
| `CONTENT_DENSITY` | 팩트·통계·수치 추가 |
| `SEMANTIC_STRUCTURE` | 제목 계층, 단락 구조 변경 |
| `SCHEMA_MARKUP` | JSON-LD / Schema.org 추가·수정 |
| `LLMS_TXT` | llms.txt 생성·수정 (실험적 — 효과 검증 목적으로 추적) |
| `FAQ_ADDITION` | FAQ 섹션 추가 |
| `AUTHORITY_SIGNAL` | 저자·날짜·출처 신뢰 시그널 강화 |
| `METADATA` | OG 태그, 메타 설명 변경 |
| `CONTENT_CHUNKING` | 단락 분절 구조 변경 |
| `EXTERNAL` | 시스템 외부에서 발생한 변경 (감지됨) |

### 3-B.4 GEO Time-Series (시계열 추적)

```
GeoTimeSeries {
  url           : str
  llm_service   : str          # 'chatgpt' | 'claude' | 'gemini' | ...
  measured_at   : datetime
  geo_score     : float
  citation_rate : float
  citation_rank : int | None
  change_id     : UUID | None  # 직전 변경과 연결
  delta_score   : float        # 직전 측정 대비 점수 변화
}
```

이 시계열 데이터로 다음을 도출한다:

- **변경 직후 효과**: 변경 전 N회 평균 vs 변경 후 N회 평균
- **지연 효과**: LLM 인덱스 갱신 지연(lag)을 고려한 시차 분석
- **지속성**: 효과가 얼마나 오래 유지되는지 (감쇠 곡선)

### 3-B.5 Impact Attribution (효과 귀인)

각 Change Record에 대해 Validation Agent가 측정 후 다음을 산출한다.

```
ChangeImpact {
  change_id          : UUID
  measured_at        : datetime
  score_before       : float        # 변경 전 GEO 점수 (3회 평균)
  score_after        : float        # 변경 후 GEO 점수 (3회 평균)
  delta              : float        # score_after - score_before
  delta_pct          : float        # 변화율 (%)
  per_llm_impact     : dict         # LLM 서비스별 점수 변화
  confidence         : float        # 통계적 신뢰도 (0~1)
  confounders        : List[str]    # 동시 발생 변경 등 교란 요인
  verdict            : str          # 'positive' | 'negative' | 'neutral'
}
```

**신뢰도(confidence) 산출 방식**:
- 측정 횟수가 많을수록 높음
- 동시에 다른 변경이 없을수록 높음 (단일 변수 원칙)
- 결과의 분산이 낮을수록 높음

### 3-B.6 외부 변경 감지 (External Change Detection)

시스템이 적용하지 않은 변경도 감지하여 추적한다.

- Monitoring Agent가 주기적으로 페이지 해시를 체크
- 해시 변경 감지 시 → 자동으로 `ChangeType.EXTERNAL` 레코드 생성
- 변경 diff 추출 후 Impact 측정 파이프라인 트리거
- 관리자에게 알림 발송 (의도치 않은 GEO 저하 조기 경보)

### 3-B.7 Change History API

```
GET  /tracking/{url}/history          # 전체 변경 이력 목록
GET  /tracking/{url}/history/{id}     # 특정 변경 상세 (diff 포함)
GET  /tracking/{url}/timeline         # GEO 점수 시계열 그래프 데이터
GET  /tracking/{url}/impact-summary   # 변경 유형별 평균 효과 요약
GET  /tracking/{url}/best-changes     # 효과 상위 변경 TOP-N
GET  /tracking/insights               # 전체 URL 대상 변경 효과 인사이트
```

### 3-B.8 Agent Memory Layer (에이전트 기억 계층)

> **핵심 질문**: "에이전트가 다음 액션 결정 시 과거 효과를 실제로 어떻게 참조하는가?"

현재 ChangeImpact 데이터가 존재해도, 에이전트가 그것을 **어떤 형태로 쿼리하고 컨텍스트에 주입하는지**가 없으면 학습이 일어나지 않는다. 이를 위해 **Agent Memory Layer**를 별도로 정의한다.

#### (1) 구조적 기억: EffectivenessIndex

ChangeImpact를 집계하여 에이전트가 빠르게 조회할 수 있는 인덱스를 유지한다.

```
EffectivenessIndex {
  # 조회 키
  url           : str               # URL 특정 기록
  change_type   : ChangeType        # 변경 유형별 통계
  llm_service   : str | None        # LLM 서비스 특정 기록

  # 집계 지표
  sample_count  : int               # 누적 측정 횟수
  avg_delta     : float             # 평균 점수 변화
  success_rate  : float             # 'positive' 판정 비율
  best_delta    : float             # 최고 기록
  worst_delta   : float             # 최저 기록
  last_updated  : datetime
}
```

이 인덱스는 ChangeImpact가 저장될 때마다 자동 갱신된다(upsert).

#### (2) 의미 기억: Semantic Change Archive

구조적 인덱스로 찾기 어려운 **"이번과 유사한 상황"**을 벡터 검색으로 찾는다.

```
SemanticChangeRecord {
  change_id      : UUID
  embedding      : vector(1536)   # 변경 상황 임베딩
                                  # = url 특성 + change_summary + 분석 컨텍스트
  change_summary : str            # 변경 내용 자연어 요약
  impact_verdict : str            # 'positive' | 'negative' | 'neutral'
  delta          : float          # 실제 점수 변화
  lesson         : str            # LLM이 생성한 교훈 한 줄 요약
                                  # 예: "FAQ는 모바일 커머스 페이지에서 효과 없음"
}
```

Strategy Agent는 현재 분석 상황을 임베딩하여 **유사 과거 케이스 TOP-K**를 검색한다.

#### (3) 에이전트 도구(Tool)로의 노출

에이전트가 직접 호출할 수 있는 Tool 형태로 제공한다.

```typescript
// Strategy Agent가 사용할 수 있는 Tool 목록 (pi-agent-core Tool 형식)

const queryEffectiveness = defineTool({
  name: "query-effectiveness",
  description: "이 URL에서 특정 변경 유형의 과거 효과 통계를 조회한다",
  schema: {
    url: z.string(),
    changeType: z.nativeEnum(ChangeType).optional(),
    llmService: z.string().optional(),
  },
  async execute({ url, changeType, llmService }): Promise<EffectivenessIndex> { ... },
});

const findSimilarCases = defineTool({
  name: "find-similar-cases",
  description: "현재 상황과 유사한 과거 변경 사례를 시맨틱 검색으로 반환한다",
  schema: {
    context: z.string(),           // 현재 분석 상황 텍스트
    verdictFilter: z.string().optional(),  // 'positive'만 보기 등
    topK: z.number().default(5),
  },
  async execute({ context, verdictFilter, topK }): Promise<SemanticChangeRecord[]> { ... },
});

const getNegativePatterns = defineTool({
  name: "get-negative-patterns",
  description: "이 URL에서 효과가 없었거나 역효과가 난 변경 패턴을 반환한다",
  schema: { url: z.string() },
  async execute({ url }): Promise<string[]> { ... },
});

const getCrossUrlInsights = defineTool({
  name: "get-cross-url-insights",
  description: "전체 URL을 대상으로 특정 변경 유형의 효과 인사이트를 요약해 반환한다",
  schema: { changeType: z.nativeEnum(ChangeType) },
  async execute({ changeType }): Promise<string> { ... },
});
```

#### (4) Strategy Agent의 실제 활용 흐름

```
[Strategy Agent 실행 시]
        │
        ├─ query_effectiveness(url, change_type=FAQ_ADDITION)
        │      → "FAQ: 평균 +8.3점, 성공률 72%, 샘플 11건"
        │
        ├─ find_similar_cases(context=현재_분석_요약, verdict_filter='positive')
        │      → 유사 과거 케이스 5건 + 각 케이스의 lesson
        │
        ├─ get_negative_patterns(url)
        │      → ["METADATA 변경은 3회 시도 모두 neutral",
        │          "CONTENT_CHUNKING은 Gemini에서 역효과 (-4.1점)"]
        │
        └─ [위 정보를 LLM 프롬프트 컨텍스트에 주입]
              → 근거 있는 OptimizationPlan 생성
                 "SCHEMA_MARKUP 우선 (ChatGPT +12.1점 실적),
                  CONTENT_CHUNKING 제외 (Gemini 역효과 기록)"
```

#### (5) 기억의 신선도(Freshness) 관리

과거 기록이 무조건 신뢰되지 않도록 가중치를 적용한다.

| 상황 | 처리 방식 |
|---|---|
| 6개월 이상 된 기록 | `stale` 플래그, 신뢰도 가중치 0.5× 적용 |
| LLM 서비스 메이저 업데이트 감지 후 | 해당 LLM의 기존 기록 전체 `invalidated` 표시 |
| 샘플 수 3 미만 기록 | `low_confidence` 표시, 참고용으로만 제시 |

---

## 4. GEO 최적화 원칙

### 4.1 LLM 인용 최적화 원칙 (CRAFT 프레임워크)

```
C - Clarity      : LLM이 오해 없이 파싱할 수 있는 명확한 문장 구조
R - Relevance    : 특정 질의 의도에 정확히 매칭되는 콘텐츠 배치
A - Authority    : E-E-A-T 신호 강화 (경험, 전문성, 권위, 신뢰)
F - Freshness    : 최신 정보 명시 및 주기적 업데이트
T - Traceability : 인용 가능한 출처, 데이터, 통계 제공
```

### 4.2 구조화 우선 원칙

- 모든 핵심 정보는 LLM이 청크로 추출할 수 있도록 독립적 단락으로 구성
- FAQ 형식으로 예상 질의-응답 쌍을 명시적으로 제공
- 테이블, 리스트를 활용한 비교·정의·순위 정보 구조화
- 핵심 주장은 첫 문장에 배치 (역피라미드 구조)

### 4.3 다중 LLM 커버리지 원칙

- 특정 LLM에 종속되지 않는 범용 최적화 우선
- LLM별 학습 데이터 특성 및 검색 연동 방식 고려한 차별화 전략 병행
- RAG 파이프라인 친화적 콘텐츠 분절 지원

---

## 5. 기반 소프트웨어 및 기술 스택

### 5.1 에이전트 엔진: pi-mono

> **핵심 결정**: 에이전트 런타임으로 [pi-mono](https://github.com/badlogic/pi-mono) (TypeScript 모노레포)를 채용한다. 이에 따라 시스템 전체가 TypeScript 기반으로 구현된다.

pi-mono에서 사용하는 패키지:

| 패키지 | 역할 | GEO 시스템에서의 용도 |
|---|---|---|
| **@mariozechner/pi-ai** | 통합 멀티 프로바이더 LLM API (OpenAI, Anthropic, Google 등) | 분석·전략 생성용 LLM 호출, Validation Agent의 멀티 LLM 질의 |
| **@mariozechner/pi-agent-core** | 에이전트 런타임 (Tool calling + 상태 관리) | Orchestrator, Analysis/Strategy/Optimization/Validation/Monitoring Agent 실행 |
| **@mariozechner/pi-web-ui** | AI 채팅 인터페이스 웹 컴포넌트 | localhost 대시보드 UI (섹션 5.5 참조) |
| **@mariozechner/pi-tui** | 터미널 UI 라이브러리 | CLI 인터페이스 (스킬 관리, 에이전트 실행) |

**pi-agent-core 활용 구조**:

```
┌─────────────────────────────────────────────────────┐
│                  pi-agent-core                       │
│                                                      │
│  Agent Runtime                                       │
│    ├─ Tool Registry  ← GEO 도구들 등록               │
│    ├─ State Manager  ← 에이전트 실행 상태 추적        │
│    └─ Agent Loop     ← LLM ↔ Tool 반복 실행          │
│                                                      │
│  pi-ai (LLM Provider)                               │
│    ├─ Anthropic (Claude) ← 에이전트 오케스트레이션용  │
│    ├─ OpenAI (GPT)       ← Validation 테스트 대상    │
│    ├─ Google (Gemini)    ← Validation 테스트 대상    │
│    └─ ...                                            │
└─────────────────────────────────────────────────────┘
```

**에이전트-Tool 매핑**: pi-agent-core의 Tool calling 프레임워크를 통해, 각 에이전트가 호출할 수 있는 Tool을 명시적으로 등록한다.

```typescript
// 예시: Analysis Agent의 Tool 등록
const analysisAgent = createAgent({
  name: "analysis-agent",
  model: piAi.model("anthropic", "claude-sonnet-4-6"),
  tools: [
    dualCrawlTool,         // 이중 크롤링 (Playwright + fetch)
    structureAuditorTool,  // DOM 구조 품질 감사
    crawlerSimulatorTool,  // AI 크롤러 접근성 테스트
    geoScorerTool,         // GEO 점수 산출
  ],
  systemPrompt: analysisSystemPrompt,
});
```

### 5.2 스킬 시스템: openclaw 호환

> **핵심 결정**: [openclaw](https://github.com/openclaw/openclaw)의 스킬 체계를 참고하여, 에이전트가 스스로 필요한 스킬을 생성·등록·재사용할 수 있도록 한다. openclaw 스킬과의 호환성도 확보한다.

#### 5.2.1 스킬 아키텍처 개요

```
┌────────────────────────────────────────────────────────┐
│                     Skill Platform                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Bundled     │  │   Managed    │  │  Workspace   │  │
│  │   Skills      │  │   Skills     │  │  Skills      │  │
│  │ (GEO 핵심)   │  │ (ClawHub)    │  │ (사용자 생성)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └──────────────────┼──────────────────┘         │
│                            ▼                            │
│                  ┌─────────────────┐                    │
│                  │  Skill Registry  │                    │
│                  │  (통합 등록소)   │                    │
│                  └────────┬────────┘                    │
│                           ▼                             │
│              ┌────────────────────────┐                 │
│              │  pi-agent-core Tools   │                 │
│              │  (Tool calling 연동)   │                 │
│              └────────────────────────┘                 │
└────────────────────────────────────────────────────────┘
```

**3-tier 스킬 체계**:

| 계층 | 설명 | 예시 |
|---|---|---|
| **Bundled Skills** | GEO 시스템에 기본 내장된 핵심 스킬 | 이중 크롤링, DOM 감사, JSON-LD 생성, GEO 점수 산출 |
| **Managed Skills** | ClawHub 레지스트리에서 검색·설치 가능한 검증된 스킬 | SEO 분석, 경쟁사 비교, 소셜 시그널 수집 |
| **Workspace Skills** | 사용자가 직접 생성하거나 에이전트가 자동 생성한 커스텀 스킬 | 특정 CMS 연동, 도메인 특화 분석 |

#### 5.2.2 스킬 정의 형식

각 스킬은 독립 디렉터리에 다음 구조로 정의된다:

```
skills/
├── geo-dual-crawl/
│   ├── SKILL.md              # 스킬 메타데이터 + 설명 (openclaw 호환)
│   ├── index.ts              # 스킬 진입점 (Tool 정의)
│   ├── schema.json           # 입출력 JSON Schema
│   └── tests/
│       └── skill.test.ts
├── geo-schema-builder/
│   ├── SKILL.md
│   ├── index.ts
│   └── schema.json
└── ...
```

**SKILL.md 형식** (openclaw 호환):

```markdown
---
name: geo-dual-crawl
version: 1.0.0
description: JS 실행/미실행 이중 크롤링으로 기계 가독성을 진단한다
author: geo-agent-system
tags: [geo, crawling, analysis, machine-readability]
install_gate:                    # 조건부 활성화
  requires: [playwright]
ui:
  icon: globe
  category: Analysis
---

# Dual Crawl Tool

Target URL을 Playwright(JS 실행)와 raw fetch(JS 미실행)로 각각 크롤링하여
콘텐츠 차이를 측정한다. js_dependency_ratio를 산출하여 LLM 크롤러 접근성을 진단한다.

## Parameters
- url (string, required): 크롤링 대상 URL
- timeout_ms (number, optional): 타임아웃 (기본 30000)

## Returns
- text_with_js: JS 실행 후 추출 텍스트
- text_without_js: JS 미실행 추출 텍스트
- js_dependency_ratio: 0~1 (높을수록 JS 의존도 높음)
- grade: A | B | C | F
```

**index.ts** (pi-agent-core Tool로 등록):

```typescript
import { defineTool } from "@mariozechner/pi-agent-core";
import schema from "./schema.json";

export default defineTool({
  name: "geo-dual-crawl",
  description: "JS 실행/미실행 이중 크롤링으로 기계 가독성을 진단한다",
  schema,
  async execute({ url, timeout_ms = 30000 }) {
    // Playwright 크롤링 + raw fetch 크롤링
    // js_dependency_ratio 산출
    // ...
    return { text_with_js, text_without_js, js_dependency_ratio, grade };
  },
});
```

#### 5.2.3 에이전트의 자동 스킬 생성

Strategy Agent 또는 Optimization Agent가 작업 중 필요한 도구가 없으면, **스킬을 자동 생성**할 수 있다:

```
[Strategy Agent 실행 중]
    │
    ├─ "이 사이트는 WordPress REST API가 있는데,
    │    해당 API를 통한 콘텐츠 업데이트 도구가 없다"
    │
    ├─ [자동 스킬 생성 트리거]
    │   ├─ SKILL.md 작성 (메타데이터, 설명)
    │   ├─ index.ts 생성 (WordPress REST API 연동 코드)
    │   ├─ schema.json 생성 (입출력 정의)
    │   └─ skills/workspace/wp-content-updater/ 에 저장
    │
    └─ [Skill Registry에 등록 → 즉시 사용 가능]
```

**자동 생성 제약 조건**:
- Workspace Skills 계층에만 생성 가능 (Bundled/Managed는 수동 관리)
- 생성된 스킬은 `auto_generated: true` 플래그가 붙으며, 관리자 검토 전까지 sandbox 모드 실행
- 실행 권한은 파일시스템 읽기/쓰기, HTTP 요청으로 제한 (시스템 명령 실행 불가)

#### 5.2.4 openclaw 스킬 호환성

openclaw의 스킬을 GEO 시스템에서 재사용할 수 있도록 호환 레이어를 제공한다:

```
┌─────────────────────┐       ┌──────────────────────┐
│   openclaw Skill     │       │   GEO Skill          │
│  (SKILL.md + tools)  │──────▶│  (SKILL.md + index.ts│
│                      │ 변환  │   + schema.json)     │
└─────────────────────┘       └──────────────────────┘
         │
         ▼
  openclaw의 Tool 정의를
  pi-agent-core Tool로 래핑
```

| 호환 방향 | 방식 |
|---|---|
| **openclaw → GEO** | `geo skill import --from-openclaw <skill-name>` CLI로 변환·설치 |
| **GEO → openclaw** | `geo skill export --to-openclaw <skill-name>`으로 openclaw 형식 출력 |
| **ClawHub 검색** | `geo skill search <keyword>`로 ClawHub 레지스트리 검색 및 설치 |

#### 5.2.5 CLI 인터페이스

스킬 관리 및 에이전트 실행을 위한 CLI를 제공한다:

```bash
# === 스킬 관리 ===
geo skill list                          # 설치된 스킬 목록
geo skill create <name>                 # 새 스킬 스캐폴딩 생성
geo skill test <name>                   # 스킬 단위 테스트 실행
geo skill install <name>               # ClawHub에서 스킬 설치
geo skill remove <name>                # 스킬 제거
geo skill search <keyword>             # ClawHub 레지스트리 검색
geo skill import --from-openclaw <name> # openclaw 스킬 가져오기
geo skill export --to-openclaw <name>   # openclaw 형식으로 내보내기

# === 에이전트 실행 ===
geo analyze <url>                       # Analysis Agent 단독 실행
geo optimize <url>                      # 전체 파이프라인 실행
geo validate <url>                      # Validation Agent 단독 실행
geo monitor <url> --interval 6h         # Monitoring Agent 시작

# === 대시보드 ===
geo dashboard                           # localhost 웹 대시보드 시작
geo dashboard --port 3000               # 포트 지정

# === 스킬 자동 생성 (에이전트 위임) ===
geo skill generate "WordPress REST API로 포스트를 업데이트하는 도구"
    # → Strategy Agent가 스킬을 자동 생성하고 workspace에 등록
```

### 5.3 웹 인터랙션

| 구분 | 선택 | 용도 |
|---|---|---|
| **브라우저 자동화** | Playwright (Node.js) | JS 실행 풀 렌더링 크롤링 (사용자 시점) |
| **HTTP 클라이언트** | undici / node-fetch | JS 미실행 크롤링 (LLM 크롤러 시점 시뮬레이션), API 호출 |
| **HTML 파싱** | cheerio + htmlparser2 | DOM 분석, 시맨틱 태그 비율 산출, 메타데이터 추출 |
| **가독성 추출** | @mozilla/readability + linkedom | div soup에서도 본문 핵심 텍스트 추출 |

### 5.4 데이터 저장 및 처리

| 구분 | 선택 | 용도 |
|---|---|---|
| **벡터 데이터베이스** | ChromaDB (로컬) / Pinecone (클라우드) | 콘텐츠 임베딩 저장, 유사도 검색 |
| **문서 저장소** | better-sqlite3 (로컬) / PostgreSQL (운영) | 분석 보고서, 최적화 이력 |
| **Change Tracking DB** | PostgreSQL (시계열 확장) / TimescaleDB | ContentSnapshot, ChangeRecord, GeoTimeSeries, ChangeImpact |
| **캐시** | Redis | LLM 응답 캐싱, 태스크 큐 |
| **파일 저장** | 로컬 파일시스템 / S3 호환 | 크롤링 원본, HTML diff 파일, 패치 파일 |

### 5.5 UI: localhost 웹 대시보드

> **v1 범위**: localhost에서만 제공. Remote web 접근은 차기 버전 대상.

pi-web-ui 웹 컴포넌트를 기반으로 localhost에 대시보드를 제공한다.

```
┌────────────────────────────────────────────────────────┐
│  localhost:3000  GEO Agent Dashboard                    │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  pi-web-ui Chat Interface                         │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ [에이전트 대화형 인터페이스]                  │  │  │
│  │  │  "example.com을 분석해줘"                    │  │  │
│  │  │  → Analysis Agent 실행 중...                 │  │  │
│  │  │  → 기계 가독성 등급: B                       │  │  │
│  │  │  → GEO 점수: 42/100                         │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐   │
│  │ GEO Score   │ │ Change       │ │ LLM Coverage   │   │
│  │ Timeline    │ │ Impact Map   │ │ Matrix         │   │
│  │ (시계열)    │ │ (효과 귀인)  │ │ (LLM별 현황)  │   │
│  └─────────────┘ └──────────────┘ └────────────────┘   │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐   │
│  │ Skill       │ │ Agent        │ │ Machine        │   │
│  │ Manager     │ │ Activity Log │ │ Readability    │   │
│  │ (스킬 관리) │ │ (실행 이력)  │ │ Report         │   │
│  └─────────────┘ └──────────────┘ └────────────────┘   │
└────────────────────────────────────────────────────────┘
```

**기술 구성**:

| 구분 | 선택 | 용도 |
|---|---|---|
| **프론트엔드** | pi-web-ui 웹 컴포넌트 + Lit/Preact | 대화형 에이전트 UI, 대시보드 |
| **차트/시각화** | D3.js 또는 Chart.js | GEO 점수 시계열, 변경 효과 차트 |
| **백엔드 API** | Hono (TypeScript) | REST API 서버 (localhost) |
| **실시간 통신** | WebSocket | 에이전트 실행 상태 스트리밍 |
| **알림** | 이메일 / Slack Webhook | 최적화 완료, 이상 감지 알림 |

**localhost 제한 사항 (v1)**:
- 인증/인가 시스템 미포함 (localhost만이므로 불필요)
- HTTPS 미지원 (localhost 환경)
- 동시 사용자 1명 가정

**차기 버전 (remote web) 예정 사항** → Known Issue KI-8 참조

### 5.6 태스크 오케스트레이션

| 구분 | 선택 | 용도 |
|---|---|---|
| **워크플로우** | pi-agent-core Agent Loop + BullMQ | 에이전트 파이프라인 스케줄링 |
| **메시지 큐** | Redis Streams 또는 BullMQ | 에이전트 간 비동기 통신 |
| **상태 관리** | Zod schemas (TypeScript) | 에이전트 입출력 스키마 정의·검증 |

### 5.7 모니터링 및 관찰성

| 구분 | 선택 | 용도 |
|---|---|---|
| **메트릭** | Prometheus + Grafana | GEO 점수 추이, 에이전트 성능 |
| **로깅** | pino (structured JSON logging) | 에이전트 실행 로그 |
| **트레이싱** | Langfuse 또는 Arize AI | LLM 호출 추적 및 비용 관리 |

### 5.8 개발 환경

| 구분 | 선택 |
|---|---|
| **언어** | TypeScript 5.x (Node.js 20+) |
| **패키지 관리** | npm (pi-mono 모노레포 호환) |
| **코드 품질** | biome (lint/format — pi-mono 표준) |
| **테스트** | vitest |
| **컨테이너** | Docker + Docker Compose |

---

## 6. 데이터 흐름

```
[사용자 입력: Target URL]
         │
         ▼
[Orchestrator: 파이프라인 초기화]
         │
         ├──▶ [Analysis Agent]
         │         │ 이중 크롤링 (Playwright + httpx raw)
         │         │ 구조 분석, GEO 현황 점수
         │         │ ★ 기계 가독성 감사 (js_dependency_ratio, DOM 품질, 크롤러 접근성)
         │         ▼
         │    AnalysisReport (기계 가독성 등급 포함) + ContentSnapshot(before)
         │         │
         │         ├─ 등급 A/B ──▶ 정상 진행
         │         └─ 등급 C/F ──▶ Strategy Agent에 "구조 개선 우선" 플래그 전달
         │
         ├──▶ [Strategy Agent]
         │         │ AnalysisReport + 과거 ChangeImpact 피드백 수신
         │         │ 기계 가독성 등급 C/F → 구조 개선 태스크 최우선 배치
         │         │ 우선순위 최적화 태스크 생성
         │         ▼
         │    OptimizationPlan
         │
         ├──▶ [Optimization Agent]
         │         │ OptimizationPlan 수신
         │         │ 콘텐츠 패치 생성
         │         │ ★ ChangeRecord 생성 (change_type, diff, snapshot_before)
         │         ▼
         │    수정된 HTML/JSON-LD (+ llms.txt 보조)
         │         │
         │         ▼
         │    [배포 or 스테이징 저장]
         │
         ├──▶ [Validation Agent]
         │         │ 배포된 콘텐츠 대상
         │         │ 6개+ LLM에 질의 발송 (LLM 인덱스 갱신 대기 후)
         │         │ 인용 여부 및 정확도 측정
         │         │ ★ ContentSnapshot(after) + GeoTimeSeries 저장
         │         │ ★ ChangeImpact 산출 (delta, confidence, per_llm)
         │         ▼
         │    ValidationReport + ChangeImpact ──▶ Change Tracking Store
         │
         ├──▶ [Orchestrator: 목표 달성 판단]
         │         │
         │    GEO 목표 미달 ──▶ Strategy Agent로 재순환 (ChangeImpact 반영)
         │         │
         │    GEO 목표 달성 ──▶ Monitoring Agent 등록
         │
         ├──▶ [Monitoring Agent - 상시 동작]
         │         │ 주기적 페이지 해시 체크
         │         │ ★ 외부 변경 감지 → EXTERNAL ChangeRecord 자동 생성
         │         │ 주기적 LLM 질의 → GeoTimeSeries 누적
         │         ▼
         │    지속적 ChangeImpact 업데이트
         │
         └──▶ [Change History 대시보드 표시]
                   변경 타임라인 / 효과 귀인 / LLM별 반응 차트
```

---

## 7. GEO 점수 체계

```
GEO Score (0~100) = Σ(가중치 × 세부 지표)

세부 지표:
  - Citation Rate     (30%): LLM 응답에서 인용된 빈도
  - Citation Accuracy (25%): 인용 내용의 정확도 (vs 원문)
  - Coverage          (20%): 타겟 LLM 서비스 커버리지
  - Rank Position     (15%): 복수 출처 응답 시 인용 순위
  - Structured Score  (10%): Schema.org, 시맨틱 HTML, 메타데이터 적용 완성도
```

---

## 8. 보안 및 윤리 원칙

- **화이트햇 원칙**: 콘텐츠의 실제 품질 향상을 통한 최적화만 수행. LLM 오염이나 프롬프트 인젝션 기법 사용 금지
- **투명성**: 최적화 적용 내역을 모두 로깅하고 감사 가능하도록 유지
- **LLM ToS 준수**: 각 LLM 서비스의 API 이용 약관 및 사용 정책 준수
- **API 키 관리**: 모든 자격증명은 환경변수 및 시크릿 매니저로 관리. 코드 내 하드코딩 금지
- **Rate Limiting**: LLM API 호출 시 속도 제한 및 재시도 정책 적용

---

## 9. 디렉터리 구조

```
geo-agent/
├── packages/
│   ├── core/                          # GEO 핵심 로직
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   │   ├── orchestrator.ts        # 파이프라인 조율
│   │   │   │   ├── analysis-agent.ts      # 분석 에이전트
│   │   │   │   ├── strategy-agent.ts      # 전략 수립 (ChangeImpact 피드백 수신)
│   │   │   │   ├── optimization-agent.ts  # 최적화 실행 (ChangeRecord 생성)
│   │   │   │   ├── validation-agent.ts    # 검증 (ChangeImpact 산출)
│   │   │   │   └── monitoring-agent.ts    # 모니터링 (외부 변경 감지)
│   │   │   ├── tracking/                  # ★ Change Tracking 시스템
│   │   │   │   ├── snapshot.ts            # ContentSnapshot 캡처·저장
│   │   │   │   ├── change-record.ts       # ChangeRecord 생성·관리
│   │   │   │   ├── impact-analyzer.ts     # ChangeImpact 귀인 분석
│   │   │   │   ├── time-series.ts         # GeoTimeSeries 저장·조회
│   │   │   │   ├── external-detector.ts   # 외부 변경 감지 (해시 비교)
│   │   │   │   └── agent-memory/          # ★ Agent Memory Layer
│   │   │   │       ├── effectiveness-index.ts   # 구조적 기억
│   │   │   │       ├── semantic-archive.ts      # 의미 기억 (벡터 검색)
│   │   │   │       ├── memory-tools.ts          # 에이전트 Tool 정의 (4종)
│   │   │   │       └── freshness-manager.ts     # 기억 신선도 관리
│   │   │   ├── models/                    # Zod 스키마 정의
│   │   │   │   ├── analysis-report.ts
│   │   │   │   ├── optimization-plan.ts
│   │   │   │   ├── validation-report.ts
│   │   │   │   ├── content-snapshot.ts    # ★ ContentSnapshot
│   │   │   │   ├── change-record.ts       # ★ ChangeRecord
│   │   │   │   ├── change-impact.ts       # ★ ChangeImpact
│   │   │   │   └── geo-time-series.ts     # ★ GeoTimeSeries
│   │   │   └── config/
│   │   │       └── settings.ts            # 설정 관리 (Zod validated)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── skills/                            # ★ 스킬 패키지
│   │   ├── bundled/                       # 기본 내장 스킬 (Bundled)
│   │   │   ├── geo-dual-crawl/
│   │   │   │   ├── SKILL.md               # openclaw 호환 메타데이터
│   │   │   │   ├── index.ts               # Tool 정의
│   │   │   │   └── schema.json            # 입출력 스키마
│   │   │   ├── geo-structure-auditor/
│   │   │   ├── geo-crawler-simulator/
│   │   │   ├── geo-schema-builder/
│   │   │   ├── geo-llms-txt-builder/      # (실험적)
│   │   │   ├── geo-llm-tester/
│   │   │   ├── geo-scorer/
│   │   │   └── geo-readability/
│   │   ├── registry.ts                    # Skill Registry (통합 등록소)
│   │   ├── loader.ts                      # 스킬 로더 (SKILL.md 파싱)
│   │   ├── openclaw-compat.ts             # openclaw 호환 레이어
│   │   └── generator.ts                   # 에이전트 자동 스킬 생성
│   │
│   ├── cli/                               # ★ CLI 패키지
│   │   ├── src/
│   │   │   ├── index.ts                   # 진입점 (geo 커맨드)
│   │   │   ├── commands/
│   │   │   │   ├── skill.ts               # geo skill <sub-command>
│   │   │   │   ├── analyze.ts             # geo analyze <url>
│   │   │   │   ├── optimize.ts            # geo optimize <url>
│   │   │   │   ├── validate.ts            # geo validate <url>
│   │   │   │   ├── monitor.ts             # geo monitor <url>
│   │   │   │   └── dashboard.ts           # geo dashboard
│   │   │   └── util/
│   │   │       └── pi-tui-helpers.ts      # pi-tui 기반 터미널 UI
│   │   └── package.json
│   │
│   └── dashboard/                         # ★ localhost 웹 대시보드
│       ├── src/
│       │   ├── server.ts                  # Hono API 서버 (localhost)
│       │   ├── routes/
│       │   │   ├── tracking.ts            # /tracking/** 엔드포인트
│       │   │   ├── agents.ts              # /agents/** 에이전트 실행 API
│       │   │   └── skills.ts              # /skills/** 스킬 관리 API
│       │   ├── ws/
│       │   │   └── agent-stream.ts        # WebSocket 에이전트 상태 스트리밍
│       │   └── ui/
│       │       ├── index.html             # 대시보드 진입점
│       │       ├── components/            # pi-web-ui 기반 웹 컴포넌트
│       │       │   ├── chat-interface.ts   # 에이전트 대화형 UI
│       │       │   ├── geo-timeline.ts     # GEO 점수 시계열 차트
│       │       │   ├── change-impact.ts    # 변경 효과 시각화
│       │       │   ├── llm-matrix.ts       # LLM별 커버리지 매트릭스
│       │       │   ├── skill-manager.ts    # 스킬 관리 UI
│       │       │   └── readability-report.ts # 기계 가독성 리포트
│       │       └── styles/
│       └── package.json
│
├── workspace/                             # ★ 사용자 작업 공간
│   ├── skills/                            # Workspace Skills (사용자/자동 생성)
│   │   └── (사용자가 생성한 커스텀 스킬)
│   ├── data/                              # 로컬 데이터 저장
│   │   ├── snapshots/
│   │   ├── reports/
│   │   └── db/                            # SQLite DB 파일
│   └── config.json                        # 사용자 설정 (API 키, 대상 URL 등)
│
├── docker-compose.yml
├── package.json                           # 모노레포 루트
├── tsconfig.json
├── biome.json                             # biome 설정 (pi-mono 표준)
└── ARCHITECTURE.md
```

---

## 10. Known Issues (v1 한계)

> 아래 항목들은 현재 아키텍처의 알려진 구조적 한계이며, 차기 버전에서 해결한다.

### KI-1. 인용 감정(Citation Sentiment) 분석 부재 — 심각도: 높음

**문제**: GEO Score가 인용의 "존재 여부"만 측정하며, 인용이 긍정·부정·중립 어떤 맥락에서 이루어졌는지 판정하지 않는다. Target Page가 빈번히 인용되더라도 부정적 프레이밍으로 인용되는 경우를 "성공"으로 오판한다.

**영향 범위**: GEO Score 전체 신뢰도, "긍정적 인식" 목표 달성 불가

**차기 해결 방향**:
- GEO Score에 `Citation Sentiment (가중치 TBD)` 지표 추가
- Validation Agent가 인용 발견 시 해당 문맥의 감정 분석 수행
- 긍정 인용률 / 부정 인용률 / 중립 인용률 분리 추적
- Change Impact에 sentiment delta 포함

---

### KI-2. 외부 평판 환경 분석 부재 — 심각도: 높음

**문제**: LLM의 Target Page에 대한 인식은 페이지 자체보다 웹 전체에서의 평판에 더 크게 좌우된다. 현 아키텍처는 Target Page 내부만 분석·개선하며, 외부에서 Target에 대해 어떻게 언급하고 있는지를 파악하지 못한다.

**영향 범위**: Strategy Agent의 전략 수립이 내부 요인에만 의존하여 효과 제한적

**차기 해결 방향**:
- **Reputation Scout Agent** 신규 도입
  - 경쟁 페이지 콘텐츠에서 Target 관련 서술 수집
  - 포럼, 뉴스, 리뷰 사이트에서 Target 평판 분석
  - Wikipedia 등 권위 출처에서의 표현 방식 추적
- 외부 평판 점수를 Strategy Agent 컨텍스트에 주입
- 외부 평판 개선이 필요한 경우 별도 권고 리포트 생성

---

### KI-3. LLM 지식 획득 경로 미구분 — 심각도: 중간

**문제**: Pre-training 학습 데이터, 실시간 검색(RAG), 에이전트 직접 탐색 등 LLM이 웹 콘텐츠를 "아는" 경로가 근본적으로 다르지만, 현 아키텍처는 이를 구분하지 않고 동일한 최적화를 적용한다.

**구체적 문제 상황**:

| LLM 경로 | 현 아키텍처의 최적화 효과 |
|---|---|
| Pre-training (ChatGPT/Claude 기본) | JSON-LD, 시맨틱 구조 등 페이지 수정 → **즉시 반영 안 됨** |
| Search-RAG (Perplexity, Copilot) | 효과 있으나 **전통 SEO 순위가 전제 조건** (미다룸) |
| Agent 직접 탐색 | 구조화 데이터 최적화 → **효과 있음** |

**차기 해결 방향**:
- LLM Knowledge Pathway Model 도입 (Pre-training / Search-RAG / Agent 3분류)
- Strategy Agent가 경로별 최적화 가능 범위를 인지하고 차별화된 전략 수립
- Search-RAG 경로의 경우 전통 SEO 요소와의 연계 전략 포함

---

### KI-4. 테스트 질의(Query Universe) 설계 체계 부재 — 심각도: 중간

**문제**: Validation Agent가 "타겟 주제 관련 질의를 발송"하지만, 어떤 질의를 어떻게 설계·선정하는지 체계가 없다. 질의 세트가 편향되면 GEO Score 전체가 왜곡된다.

**구체적 위험**:
- 동일 최적화도 질의 유형에 따라 효과가 반대일 수 있음
- "A사 추천해줘"에서는 성공, "A사 vs B사"에서는 실패 → 평균으로 묻힘
- 사용자들이 실제로 LLM에 하는 질의와 테스트 질의가 괴리될 수 있음

**차기 해결 방향**:
- **Query Universe Engine** 도입
  - 타겟 주제에 대한 예상 질의를 자동 생성·분류 (정보형 / 비교형 / 추천형 / 검증형)
  - 질의 유형별 GEO Score 분리 측정
  - "어떤 유형의 질의에서 약한가" 진단 리포트
- 질의 중요도 가중치 (검색 볼륨 유사 개념) 적용

---

### KI-5. 간접 인용 감지(Indirect Citation Detection) 부재 — 심각도: 중간

**문제**: 대부분의 LLM API는 출처 인용(source citation)을 제공하지 않는다.

| LLM 서비스 | 인용 출처 제공 | 현 아키텍처의 측정 가능성 |
|---|---|---|
| Perplexity | O (URL 포함) | 직접 측정 가능 |
| Copilot | O (출처 표시) | 직접 측정 가능 |
| ChatGPT Browsing | 부분적 | 제한적 |
| ChatGPT API 기본 | **X** | **측정 불가** |
| Claude API | **X** | **측정 불가** |
| Gemini API | **X** | **측정 불가** |

Citation Rate가 GEO Score의 30%인데, 타겟 LLM 절반 이상에서 직접 측정이 불가능하다.

**차기 해결 방향**:
- 출처 미표기 LLM 응답에서 Target 콘텐츠와의 **시맨틱 유사도** 기반 간접 인용 추정
- 핵심 팩트·수치·고유 표현의 일치 여부로 간접 인용 확률 산출
- 직접 인용 / 간접 인용(추정) / 미인용 3단계 분류
- GEO Score 산출 시 간접 인용은 confidence 가중치 적용

---

### KI-6. 배포 경계(Deployment Boundary) 미정의 — 심각도: 낮음

**문제**: Optimization Agent가 "수정된 HTML/콘텐츠 패치"를 출력하지만, 실제 배포 가능 여부는 Target Page의 소유 형태에 따라 다르다.

| Target 유형 | 실행 가능 범위 |
|---|---|
| 자체 소유 사이트 | 직접 배포 (API/FTP/Git) |
| CMS 기반 (WordPress 등) | CMS API 연동 배포 |
| 타사 플랫폼 (마켓플레이스 등) | **직접 수정 불가**, 제안서만 출력 |

**차기 해결 방향**:
- Deployment Mode를 3종으로 정의 (`direct` / `cms_api` / `suggestion_only`)
- Orchestrator 초기 설정 시 Target의 배포 모드를 지정
- `suggestion_only` 모드에서는 사람이 읽을 수 있는 개선 제안서 자동 생성

---

### KI-7. LLM 신뢰 형성 모델(Trust Model) 부재 — 심각도: 낮음

**문제**: LLM이 출처를 "신뢰"하게 되는 메커니즘이 다층적인데, 현 아키텍처는 페이지 내 E-E-A-T 시그널 추가만을 다룬다.

```
LLM 신뢰 형성 요인:
  1. 학습 데이터 내 출처 빈도           ← 제어 불가 (과거 데이터)
  2. 타 출처와의 정보 일관성            ← KI-2에 의존
  3. 도메인 권위 (학습 시점 기준)       ← 제어 불가 (장기 과제)
  4. 검색 엔진 순위 (실시간 검색형)     ← KI-3에 의존
  5. 페이지 내 자기 신뢰 시그널         ← ★ 현재 유일하게 다루는 부분
```

**차기 해결 방향**:
- 요인 1~4에 대한 진단 능력을 Reputation Scout Agent(KI-2)에 통합
- "현재 제어 가능한 것 vs 불가능한 것"을 Strategy Agent에 명시적으로 제공
- 장기적으로 제어 불가 요인의 간접 개선 전략 (외부 인용 확보, 도메인 권위 구축 가이드)

---

### KI-8. Remote Web 대시보드 미지원 — 심각도: 낮음 (v1 의도적 제한)

**문제**: v1에서 대시보드는 localhost에서만 접근 가능하다. 팀 공유, 원격 모니터링, 모바일 접근이 불가하다.

**v1 의도적 제한 사유**: 인증/인가 시스템 없이 외부 노출 시 보안 위험

**차기 해결 방향**:
- 인증/인가 시스템 도입 (OAuth2 또는 API Key 기반)
- HTTPS 지원 (Let's Encrypt 또는 리버스 프록시)
- 멀티 사용자 세션 관리
- 읽기 전용 공유 링크 (GEO 리포트 외부 공유용)

---

### KI-9. 에이전트 자동 생성 스킬의 안전성 검증 — 심각도: 중간

**문제**: Strategy/Optimization Agent가 자동으로 스킬을 생성할 수 있는데, 생성된 코드의 안전성·정확성을 보장하는 체계가 미비하다.

**구체적 위험**:
- 자동 생성 코드에 보안 취약점 (인젝션, 무한 루프 등) 포함 가능
- 외부 API 호출 스킬의 rate limiting/비용 통제 미비
- 자동 생성 스킬 간 의존성 충돌 가능

**현재 대응** (v1 최소 안전장치):
- Workspace Skills 계층에만 생성 허용
- `auto_generated: true` 플래그 + sandbox 모드 실행
- 시스템 명령 실행 권한 차단

**차기 해결 방향**:
- 생성된 스킬의 정적 분석 (AST 검사, 위험 패턴 감지)
- 스킬 실행 리소스 제한 (시간, 메모리, 네트워크 요청 수)
- 관리자 승인 워크플로우 (auto → pending_review → approved)
- 스킬 실행 감사 로그 (어떤 스킬이 어떤 외부 API를 호출했는지)

---

### KI-10. pi-mono 업스트림 의존 관리 — 심각도: 낮음

**결정**: pi-mono는 업스트림을 추종하지 않고, **현재 최종 stable 버전으로 고정(pin)** 한다. 향후 업스트림 업데이트가 있더라도 자동 반영하지 않으며, 필요 시 수동으로 검토 후 선택적으로 반영한다.

**v1 대응** (즉시 적용):
- `package.json`에서 pi-mono 패키지를 정확한 버전으로 고정 (캐럿/틸드 없이 exact version)
- `package-lock.json` 커밋하여 의존성 트리 전체 고정
- pi-mono 소스를 vendor 디렉터리에 스냅샷 보관 (업스트림 소실 대비)

**잔여 위험 및 차기 해결 방향**:
- 고정 버전에서 보안 취약점 발견 시 패치 적용 절차 필요
- pi-agent-core 인터페이스에 대한 얇은 추상화 레이어 유지 → 장기적 교체 가능성 확보
- 핵심 인터페이스(Agent, Tool, LLM Provider)에 대해 자체 타입 정의 보유

---

### Known Issues 우선순위 로드맵

```
v2 (단기):  KI-1 인용 감정 분석   ←  측정 체계 보완의 핵심
            KI-4 Query Universe   ←  측정 신뢰도의 전제 조건
            KI-5 간접 인용 감지   ←  LLM 커버리지 확보
            KI-9 스킬 안전성 검증 ←  자동 스킬 생성 안정화

v3 (중기):  KI-2 외부 평판 분석   ←  Reputation Scout Agent 신규 개발
            KI-3 LLM 경로 구분   ←  Strategy Agent 대폭 개선
            KI-8 Remote Web      ←  팀 공유/원격 접근 지원

v4 (장기):  KI-6 배포 경계 정의   ←  운영 환경 다양화 대응
            KI-7 Trust Model     ←  KI-2, KI-3 완료 후 통합
            KI-10 pi-mono 의존   ←  장기 유지보수 전략
```

---

## 11. 향후 확장 계획

| Phase | 내용 |
|---|---|
| **Phase 1** | 단일 URL 분석 및 수동 최적화 제안 MVP |
| **Phase 2** | 자동 최적화 실행 및 멀티 LLM 검증 파이프라인 |
| **Phase 3** | 사이트 전체 GEO 자동화 (sitemap 기반 다중 URL) |
| **Phase 4** | 실시간 모니터링 대시보드 및 알림 시스템 |
| **Phase 5** | 경쟁사 GEO 인텔리전스 및 기회 자동 발굴 |

---

*최종 수정: 2026-03-17*
