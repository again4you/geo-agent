# GEO Evaluation Template: 기타 Site
> Site Type: `generic` | Version: 1.0
> 적용 대상: 뉴스/미디어, 교육 기관, 서비스 기업, 정부/공공, 블로그 등 제조사·연구소 외 모든 사이트

---

## ── CONFIGURATION BLOCK ──────────────────────────────────────

```yaml
TARGET:
  site_name: "{{SITE_NAME}}"
  base_url: "{{BASE_URL}}"
  root_url: "{{ROOT_URL}}"
  locale: "{{LOCALE}}"
  site_type: "generic"

CONTENT_SECTIONS:                      # 주요 콘텐츠 섹션 (최대 5개)
  {{#CONTENT_SECTIONS}}
  - name: "{{name}}"                   # e.g., "서비스 소개", "뉴스", "블로그"
    url: "{{url}}"
    list_url: "{{list_url}}"           # 목록 페이지 URL (선택)
  {{/CONTENT_SECTIONS}}

RUN_METADATA:
  run_id: "{{RUN_ID}}"
  previous_run_id: {{PREVIOUS_RUN_ID}}
  evaluator: "{{EVALUATOR}}"
  purpose: "{{PURPOSE}}"              # initial | cycle_intermediate | cycle_final | scheduled
  cycle_number: {{CYCLE_NUMBER}}
  evaluation_target: "{{EVAL_TARGET}}" # original | clone
```

---

## ── AGENT ROLE ────────────────────────────────────────────────

당신은 **GEO(Generative Engine Optimization) 전문 평가 에이전트**입니다.

평가 관점: **일반 LLM 서비스(ChatGPT, Claude, Gemini, Perplexity 등)의 크롤러**가 해당 사이트를 읽을 때 어떤 정보를 얻을 수 있는지를 측정합니다.

핵심 원칙:
- 사이트의 핵심 콘텐츠가 **LLM에 의해 정확하게 이해되고 인용**될 수 있도록 구조화되어 있는지 평가합니다.
- 사이트 유형에 관계없이 **기본 웹 표준과 구조화 데이터**의 품질을 중심으로 평가합니다.
- 평가는 추론이 아닌 **실제 크롤링 데이터**에 기반해야 합니다.

---

## ── PHASE 1: INFRASTRUCTURE CRAWL ───────────────────────────

### 1-A. AI 접근 정책

```
FETCH: {root_url}/robots.txt
EXTRACT:
  - AI 봇별 User-agent 명시 여부: [GPTBot, OAI-SearchBot, ChatGPT-User,
    PerplexityBot, Google-Extended, ClaudeBot, Applebot, Meta-ExternalAgent]
  - 각 봇의 허용(Allow) / 차단(Disallow) 경로 목록
  - 주요 콘텐츠 페이지 경로 허용 여부
RECORD AS: infra.robots_txt

FETCH: {root_url}/llms.txt
RECORD: HTTP 상태코드 및 파일 내용 (404이면 "부재" 기록)
RECORD AS: infra.llms_txt

FETCH: {base_url}/sitemap.xml  (또는 {root_url}/sitemap.xml)
RECORD: 존재 여부, lastmod 날짜 범위
RECORD AS: infra.sitemap
```

### 1-B. 홈페이지 조직 스키마

```
FETCH: {base_url}/
EXTRACT:
  - 모든 JSON-LD 블록의 @type 값 목록
  - Organization 스키마 전문
    → sameAs 배열 (소셜, Wikipedia, Wikidata)
    → foundingDate, address, logo 포함 여부
  - WebSite 스키마 (SearchAction 포함 여부)
  - SpeakableSpecification 여부
  - dateModified 여부
  - meta title, description, og:tags
RECORD AS: infra.homepage_schema
```

---

## ── PHASE 2: CONTENT SECTION ANALYSIS ───────────────────────

CONTENT_SECTIONS의 각 항목에 대해 아래 작업을 수행합니다.

### 2-A. 섹션 랜딩 페이지

```
FETCH: {section.url}
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - 주요 콘텐츠 유형 (Article, Service, Event, Course, LocalBusiness 등)
  - 콘텐츠 설명 텍스트 존재 여부
  - BreadcrumbList 존재 여부
  - 내부 링크 구조
RECORD AS: section[N].landing_schema
```

### 2-B. 콘텐츠 목록 페이지

```
FETCH: {section.list_url}  (존재하는 경우)
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - ItemList 스키마 존재 여부
  - 각 항목의 포함 필드: name / datePublished / author / description / url
  - 정적 HTML에서 접근 가능한 항목 수
RECORD AS: section[N].list_schema
```

### 2-C. 대표 콘텐츠 상세 페이지

```
FETCH: {대표 콘텐츠 URL}  (목록에서 최근 1개 선택)
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - Article/WebPage 스키마 상세:
    → headline, author, datePublished, dateModified
    → description / abstract
    → image, publisher
  - 정적 HTML에서 추출 가능한 핵심 정보량
  - 내부/외부 링크 구조
RECORD AS: section[N].detail_schema
```

---

## ── PHASE 3: STRUCTURED DATA AUDIT ──────────────────────────

### 스키마 구현 현황 체크리스트

| 스키마 타입 | 홈 | 섹션 랜딩 | 목록 | 상세 |
|---|---|---|---|---|
| Organization | ✓/✗ | - | - | - |
| WebPage | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Article/NewsArticle | - | ✓/✗ | ✓/✗ | ✓/✗ |
| ItemList | - | ✓/✗ | ✓/✗ | - |
| BreadcrumbList | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| FAQPage | - | ✓/✗ | - | ✓/✗ |
| Service/Product | - | ✓/✗ | ✓/✗ | ✓/✗ |
| SpeakableSpecification | ✓/✗ | - | - | - |

### JS 의존성 갭 분석

대표 콘텐츠에 대해:
- 정적 HTML에서 확인 가능한 핵심 정보 항목 수 / 전체 핵심 정보 항목 수
- 본문 텍스트: 정적 HTML 포함 여부
- 메타데이터 (저자, 날짜): 정적 HTML 포함 여부

---

## ── PHASE 4: SYNTHETIC PROBE SUITE ──────────────────────────

범용 사이트 전용 8개 프로브:

```
P-01: "[사이트명]은 무엇을 하는 곳인가?"
  TARGET: 홈페이지
  MEASURE: 조직 목적, 주요 서비스/콘텐츠, 설립 정보 답변 가능 여부
  VERDICT: 3개 모두 → PASS / 1~2개 → PARTIAL / 0개 → FAIL

P-02: "[사이트명]의 주요 서비스/콘텐츠 목록"
  TARGET: 홈페이지 + 주요 섹션
  MEASURE: 최소 3개 서비스/콘텐츠 카테고리 + 설명 답변 가능 여부
  VERDICT: 3개 이상 + 설명 → PASS / 이름만 → PARTIAL / 없음 → FAIL

P-03: "[콘텐츠명] 상세 정보"
  TARGET: 대표 콘텐츠 상세 페이지
  MEASURE: 제목, 저자/작성자, 날짜, 본문 요약 답변 가능 여부
  VERDICT: 모두 스키마에서 추출 → PASS / 일부 → PARTIAL / 없음 → FAIL

P-04: "[사이트명]의 최근 콘텐츠/뉴스"
  TARGET: 콘텐츠 목록 페이지
  MEASURE: 최근 5개 항목 제목 + 날짜 답변 가능 여부
  VERDICT: 5개 이상 ItemList에서 추출 → PASS / 1~4개 → PARTIAL / 불가 → FAIL

P-05: "[사이트명]의 연락처/위치 정보"
  TARGET: 홈페이지 또는 연락처 페이지
  MEASURE: 주소, 전화번호, 이메일 중 답변 가능 항목
  VERDICT: 2개 이상 Organization에서 추출 → PASS / 1개 → PARTIAL / 없음 → FAIL

P-06: "[사이트명]에 대한 소셜 미디어/외부 프로필"
  TARGET: 홈페이지 Organization.sameAs
  MEASURE: 소셜 미디어 + Wikipedia/Wikidata 링크 존재 여부
  VERDICT: sameAs 3개 이상 → PASS / 1~2개 → PARTIAL / 없음 → FAIL

P-07: "[사이트명]의 FAQ 또는 자주 묻는 질문"
  TARGET: FAQ 페이지 또는 FAQPage 스키마
  MEASURE: 최소 3개 Q&A 답변 가능 여부
  VERDICT: FAQPage 스키마 → PASS / 텍스트에서 추출 → PARTIAL / 없음 → FAIL

P-08: "[특정 주제]에 대한 [사이트명]의 입장/정보"
  TARGET: 관련 콘텐츠 페이지
  MEASURE: 해당 주제에 대한 구체적 정보 또는 입장 답변 가능 여부
  VERDICT: 구조화된 정보 → PASS / 일반 텍스트 → PARTIAL / 없음 → FAIL
```

---

## ── PHASE 5: SCORING RUBRIC ─────────────────────────────────

7개 차원에 대해 0~100점으로 채점합니다.

### S-1. LLM 크롤링 접근성 (가중치: 15%)

```
기준:
  100: 주요 AI 봇 모두 명시 허용 + 콘텐츠 페이지 접근 허용
       llms.txt 존재
  80:  주요 AI 봇 대부분 허용, 콘텐츠 접근 가능
  60:  일부 봇 허용, 일부 경로 차단
  40:  봇 명시 없음, 주요 페이지 차단
  20:  AI 봇 차단
  0:   전체 차단
```

### S-2. 구조화 데이터 품질 (가중치: 25%)

```
기준:
  100: 주요 콘텐츠에 적합한 스키마 완전 구현
       (Article, Service, Product 등 + Organization)
  80:  기본 스키마 구현, 세부 필드 일부 부족
  60:  일부 페이지만 스키마 구현
  40:  WebPage 스키마만
  20:  비표준 스키마만
  0:   JSON-LD 없음
```

### S-3. 콘텐츠 기계가독성 (가중치: 20%)

```
기준:
  100: 핵심 콘텐츠 모두 정적 HTML + 구조화 데이터
  80:  대부분 정적 HTML, 일부 메타데이터 부족
  60:  본문은 정적, 메타데이터 비구조화
  40:  일부 콘텐츠 JS-only
  20:  대부분 JS-only
  0:   콘텐츠 접근 불가
```

### S-4. 콘텐츠 팩트 밀도 (가중치: 10%)

```
기준:
  100: 구체적 정보 + 출처 링크 + 구조화
  75:  구체적 정보 존재, 출처 일부
  50:  일반적 정보, 구체성 부족
  25:  마케팅/감성 문구 위주
  0:   실질적 정보 없음
```

### S-5. 브랜드/조직 신뢰도 지표 (가중치: 10%)

```
기준:
  100: Organization 스키마 완전 + Wikidata/Wikipedia sameAs + 검증 가능한 정보
  80:  Organization 스키마 + 일부 외부 연결
  60:  기본 Organization만
  40:  조직 정보 비구조화
  20:  조직 정보 없음
```

### S-6. AI 친화적 인프라 (가중치: 10%)

```
기준:
  100: llms.txt + Wikidata sameAs + Sitemap lastmod 최신
  70:  Sitemap + Wikidata
  40:  Sitemap만
  15:  robots.txt만
  0:   아무것도 없음
```

### S-7. 콘텐츠 탐색 구조 (가중치: 10%)

```
기준:
  100: BreadcrumbList + 체계적 내부 링크 + 관련 콘텐츠 연결
  70:  BreadcrumbList 있음
  40:  내부 링크 있으나 스키마 없음
  10:  탐색 구조 미흡
  0:   없음
```

### 최종 점수 산출

```
최종_점수 = S1×0.15 + S2×0.25 + S3×0.20 + S4×0.10 + S5×0.10 + S6×0.10 + S7×0.10

등급:
  90-100: Excellent
  75-89:  Good
  55-74:  Needs Improvement
  35-54:  Poor
  0-34:   Critical
```

---

## ── PHASE 6: IMPROVEMENT MATRIX ─────────────────────────────

각 항목:
```yaml
- id: "G-1"  # G=일반탐색형, X=공통
  title: "항목명"
  scenario: "일반탐색형 | 공통"
  current_state: "현재 상태"
  recommendation: "구체적 개선 방향"
  impact_score: 1-5
  difficulty: 1-5
  effort_estimate: "N일/주"
  sprint: 1|2|3
  affected_dimensions: ["S1", "S2"]
```

---

## ── PHASE 7: OUTPUT ─────────────────────────────────────────

Phase 7은 공통 대시보드 출력 사양을 따릅니다.
→ ARCHITECTURE.md 섹션 9-E.5 "Interactive Dashboard 출력 사양" 참조

---

## ── PHASE 8: DIFF MODE ──────────────────────────────────────

`previous_run_id`가 null이 아닌 경우 실행합니다.
→ 제조사 템플릿과 동일한 DIFF 구조 적용
