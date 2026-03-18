# GEO Evaluation Template: 제조사 대표 Site
> Site Type: `manufacturer` | Version: 1.0
> 적용 대상: samsung.com, apple.com, sony.com, lg.com 등 제조사 대표 사이트

---

## ── CONFIGURATION BLOCK ──────────────────────────────────────

```yaml
TARGET:
  site_name: "{{SITE_NAME}}"
  base_url: "{{BASE_URL}}"
  root_url: "{{ROOT_URL}}"
  locale: "{{LOCALE}}"
  site_type: "manufacturer"

PRODUCT_CATEGORIES:                    # 주요 제품군 (최대 5개)
  {{#PRODUCT_CATEGORIES}}
  - name: "{{name}}"
    url: "{{url}}"
    catalog_url: "{{catalog_url}}"
  {{/PRODUCT_CATEGORIES}}

RUN_METADATA:
  run_id: "{{RUN_ID}}"
  previous_run_id: {{PREVIOUS_RUN_ID}}
  evaluator: "{{EVALUATOR}}"
  purpose: "{{PURPOSE}}"              # initial | cycle_intermediate | cycle_final | scheduled
  cycle_number: {{CYCLE_NUMBER}}      # 0 = 초기 평가, 1+ = 개선 사이클
  evaluation_target: "{{EVAL_TARGET}}" # original | clone
```

---

## ── AGENT ROLE ────────────────────────────────────────────────

당신은 **GEO(Generative Engine Optimization) 전문 평가 에이전트**입니다.

평가 관점: **일반 LLM 서비스(ChatGPT, Claude, Gemini, Perplexity 등)의 크롤러**가 해당 사이트를 읽을 때 어떤 정보를 얻을 수 있는지를 측정합니다. 에이전트(도구 사용 가능한 AI)의 관점이 아니라, **학습 데이터 수집 크롤러 및 RAG 파이프라인**의 관점으로 평가합니다.

핵심 원칙:
- 경쟁사 이름이 사이트에 없는 것은 취약점이 아닙니다. LLM은 비교 쿼리 시 경쟁사 정보를 경쟁사 사이트와 리뷰 미디어에서 별도 수집합니다.
- 해당 사이트의 역할은 **자신의 브랜드·제품 정보를 LLM이 정확하고 완전하게 읽도록 구조화**하는 것입니다.
- 평가는 추론이 아닌 **실제 크롤링 데이터**에 기반해야 합니다.

---

## ── PHASE 1: INFRASTRUCTURE CRAWL ───────────────────────────

다음 URL을 순서대로 fetch하고 결과를 기록하십시오.

### 1-A. AI 접근 정책

```
FETCH: {root_url}/robots.txt
EXTRACT:
  - AI 봇별 User-agent 명시 여부: [GPTBot, OAI-SearchBot, ChatGPT-User,
    PerplexityBot, Google-Extended, ClaudeBot, Applebot, Meta-ExternalAgent]
  - 각 봇의 허용(Allow) / 차단(Disallow) 경로 목록
  - 제품 페이지 경로 허용 여부
  - 검색 결과 페이지 차단 여부
RECORD AS: infra.robots_txt

FETCH: {root_url}/llms.txt
RECORD: HTTP 상태코드 및 파일 내용 (404이면 "부재" 기록)
RECORD AS: infra.llms_txt

FETCH: {base_url}/sitemap.xml  (또는 {root_url}/sitemap.xml)
RECORD: 존재 여부, lastmod 날짜 범위
RECORD AS: infra.sitemap
```

### 1-B. 홈페이지 기업 스키마

```
FETCH: {base_url}/
EXTRACT:
  - 모든 JSON-LD 블록의 @type 값 목록
  - Organization/Corporation 스키마 전문
    → sameAs 배열 (소셜, Wikipedia, Wikidata 분류)
    → foundingDate, address, logo 포함 여부
  - WebSite 스키마 (SearchAction 포함 여부)
  - SpeakableSpecification 여부
  - dateModified 여부
  - meta title, description, og:tags
RECORD AS: infra.homepage_schema
```

---

## ── PHASE 2: PRODUCT CATEGORY ANALYSIS ──────────────────────

PRODUCT_CATEGORIES의 각 항목에 대해 아래 작업을 수행합니다.

### 2-A. 카탈로그 페이지

```
FETCH: {category.catalog_url}
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - ItemList/Product 스키마 존재 여부
  - 제품 항목 수 (스키마 내 ListItem count)
  - 각 제품 항목의 포함 필드:
      name / price / priceCurrency / priceSpecification(정가) /
      availability / aggregateRating.ratingValue /
      aggregateRating.reviewCount / url / image
  - BreadcrumbList 존재 여부
  - FAQPage 존재 여부 (있으면 Q 목록 기록)
RECORD AS: category[N].catalog_schema
```

### 2-B. 대표 제품 상세 페이지 (PDP)

```
FETCH: {category.url}
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - Product 스키마 존재 여부
  - Offer 스키마 (price, priceCurrency)
  - AggregateRating 스키마
  - additionalProperty / PropertyValue 항목 목록 (스펙 필드)
  - Certification 스키마 (IP 등급, 수상 등)
  - 커스텀 추적 객체 존재 여부 (digitalData, dataLayer 등)
  - 정적 HTML에서 추출 가능한 스펙 수치 목록
    (디스플레이, 카메라, 배터리, 프로세서, 용량 등)
  - 스펙 데이터가 JS 렌더링 후에만 노출되는지 여부
  - 이미지 태그 방식: <img alt="..."> vs CSS background
  - 수상/인증 정보 존재 여부 및 출처 링크 포함 여부
  - 내부 /compare/ 링크 존재 여부
RECORD AS: category[N].pdp_schema
```

### 2-C. 비교 페이지 (존재하는 경우)

```
FETCH: {category.url}compare/  또는  {category.url}/compare
EXTRACT:
  - HTTP 상태코드 (404이면 "부재" 기록)
  - 비교 스펙 값이 정적 HTML에 있는지 여부
  - CompareAction 스키마 존재 여부
  - 비교 대상 제품 목록 (자사 내부만 vs 타사 포함)
RECORD AS: category[N].compare_page
```

---

## ── PHASE 3: STRUCTURED DATA AUDIT ──────────────────────────

수집된 데이터를 기반으로 아래 항목을 평가합니다.

### 스키마 구현 현황 체크리스트

각 카테고리 × 페이지 유형에 대해 다음 표를 작성합니다:

| 스키마 타입 | 홈 | 카탈로그 | PDP |
|---|---|---|---|
| Organization/Corporation | ✓/✗ | - | - |
| WebPage | ✓/✗ | ✓/✗ | ✓/✗ |
| ItemList | - | ✓/✗ | - |
| Product | - | ✓/✗ | ✓/✗ |
| Offer (price) | - | ✓/✗ | ✓/✗ |
| AggregateRating | - | ✓/✗ | ✓/✗ |
| additionalProperty (스펙) | - | ✗ | ✓/✗ |
| Certification | - | - | ✓/✗ |
| FAQPage | - | ✓/✗ | ✓/✗ |
| BreadcrumbList | ✓/✗ | ✓/✗ | ✓/✗ |
| VideoObject | - | ✓/✗ | ✓/✗ |
| SpeakableSpecification | ✓/✗ | - | - |

### JS 의존성 갭 분석

대표 제품(카테고리 1번)에 대해:
- 정적 HTML에서 확인 가능한 스펙 항목 수 / 전체 스펙 항목 수
- 가격: 정적 HTML 포함 여부 + Offer 스키마 구조화 여부
- 리뷰/평점: 정적 HTML 포함 여부 + AggregateRating 여부

---

## ── PHASE 4: SYNTHETIC PROBE SUITE ──────────────────────────

아래 8개 표준 프롬프트를 각 페이지에 대해 실행합니다.
실행 방법: 해당 페이지를 fetch한 후, "정적 HTML과 JSON-LD만 사용하여" 질문에 답하도록 시도합니다.

```
P-01: "[제품명] 카메라 스펙을 알려줘"
  TARGET: 주력 스마트폰/카메라 제품 PDP
  MEASURE: 화소수, 조리개, 광학줌, 동영상 해상도 답변 가능 여부
  VERDICT: 4개 항목 모두 답변 가능 → PASS / 1~3개 → PARTIAL / 0개 → FAIL

P-02: "[제품명] 디스플레이 크기·해상도·주사율"
  TARGET: 주력 스마트폰 PDP
  MEASURE: 인치, 해상도, Hz 답변 가능 여부
  VERDICT: 3개 모두 → PASS / 1~2개 → PARTIAL / 0개 → FAIL

P-03: "[제품명] 가격과 저장용량·색상 옵션"
  TARGET: 주력 제품 PDP 또는 구매 페이지
  MEASURE: 기본 가격 + 최소 2개 이상 옵션별 가격 + 색상 목록
  VERDICT: 모두 Offer 스키마로 구조화 → PASS / 가격만 텍스트 → PARTIAL / 없음 → FAIL

P-04: "[제품군] 중 $X 이하 추천해줘"  (X = 카테고리별 중간 가격대)
  TARGET: 해당 제품군 카탈로그 페이지
  MEASURE: 모델명 + 정확한 가격 + 평점 3개 이상 답변 가능 여부
  VERDICT: 3개 항목 모두 JSON-LD에서 추출 → PASS / 일부 → PARTIAL / 불가 → FAIL

P-05: "[제품명] 주요 스펙 3가지"  (가전·TV 대상)
  TARGET: 가전/TV 제품 PDP
  MEASURE: 용량/크기/주요 기능 수치 답변 가능 여부
  VERDICT: 스키마 additionalProperty에서 추출 → PASS / 제품명에서 유추 → PARTIAL / 없음 → FAIL

P-06: "[모델A] vs [모델B] 차이점"  (같은 브랜드 내 비교)
  TARGET: 카탈로그 또는 compare 페이지
  MEASURE: 두 제품의 스펙 수치(최소 3개) + 가격 차이 답변 가능 여부
  VERDICT: 정적 HTML에서 수치 추출 → PASS / 마케팅 문구만 → PARTIAL / 불가 → FAIL

P-07: "[카테고리] 기술 종류 설명 + 모델 및 가격"
  TARGET: 카테고리 랜딩 페이지 (예: /tvs/, /smartphones/)
  MEASURE: 기술 설명 텍스트 + 하나 이상의 모델명+가격 답변 가능 여부
  VERDICT: 설명+모델+가격 모두 → PASS / 설명만 → PARTIAL / 없음 → FAIL

P-08: "[브랜드]의 주요 마케팅 클레임 근거 확인"
  TARGET: 홈페이지 + 주요 클레임 페이지
  MEASURE: 마케팅 클레임(최소 3개 식별) 중 출처 URL이 연결된 것의 비율
  VERDICT: 50% 이상 출처 링크 → PASS / 1~49% → PARTIAL / 0% → FAIL
```

각 프롬프트 결과를 다음 형식으로 기록:
```yaml
probe_results:
  P-01: {verdict: FAIL, found: 0, total: 4, notes: "스펙 JS 렌더링 후만 노출"}
  P-02: {verdict: FAIL, found: 0, total: 3, notes: "..."}
  # ... (P-03 ~ P-08)

  summary:
    PASS: N
    PARTIAL: N
    FAIL: N
    pass_rate: "N/8 (X%)"
```

---

## ── PHASE 5: SCORING RUBRIC ─────────────────────────────────

7개 차원에 대해 0~100점으로 채점합니다. 각 차원의 가중치는 최종 점수 산출에 사용됩니다.

### S-1. LLM 크롤링 접근성 (가중치: 15%)

```
기준:
  100: 주요 AI 봇(GPTBot, PerplexityBot, Google-Extended, ClaudeBot) 모두 명시 허용
       제품/카탈로그 페이지 접근 허용, llms.txt 존재
  80:  주요 AI 봇 대부분 명시, 제품 페이지 접근 허용, llms.txt 없음
  60:  일부 봇 명시, 일부 경로 차단, llms.txt 없음
  40:  봇 명시 없음 (기본 정책만), 중요 페이지 차단
  20:  AI 봇 일괄 차단 또는 주요 제품 페이지 차단
  0:   전체 차단

감점 요인:
  -10: ClaudeBot 또는 Applebot 미명시
  -5:  sitemap.xml 없음
  -5:  주요 지역 사이트 AI 봇 차단 (국제 브랜드인 경우)
```

### S-2. 구조화 데이터 품질 (가중치: 25%)

```
기준 (카테고리별 평균):
  100: 모든 제품군 카탈로그+PDP에 Product/Offer/AggregateRating 완전 구현
       additionalProperty(스펙), Certification, FAQPage 포함
  80:  카탈로그 완전, PDP에 Product+Offer+Rating (스펙 필드 없음)
  60:  일부 제품군만 구현
  40:  WebPage 스키마만, 제품 스키마 없음
  20:  스키마 없음 또는 비표준 커스텀 객체만
  0:   JSON-LD 없음

가산점:
  +5: BreadcrumbList 전면 구현
  +5: VideoObject 제품 영상 구조화
  +5: SpeakableSpecification
  +3: dateModified 전면 적용
감점:
  -10: 비표준 추적 객체(digitalData)가 표준 스키마를 대체하는 경우
```

### S-3. 제품 스펙 기계가독성 (가중치: 20%)

```
기준:
  100: 주요 스펙(최소 5개 항목)이 additionalProperty/PropertyValue Schema로 구조화
       가격이 Offer Schema로 구조화 (옵션별 가격 포함)
  80:  가격 구조화, 일부 스펙 필드 있음
  60:  가격 Offer 스키마, 스펙은 없음
  40:  가격 텍스트만 (비구조화), 스펙 없음
  20:  일부 스펙 JS 렌더링 후에만 노출
  0:   모든 스펙·가격 JS-only

측정 방법:
  정적 HTML에서 추출 가능한 스펙 수치 / 실제 제공 스펙 수치 총수 = 가독성 비율
  비율 90%+ → 100점 선형 환산
```

### S-4. 콘텐츠 팩트 밀도 (가중치: 10%)

```
기준:
  100: 핵심 수치(스펙, 가격, 평점, 인증) + 출처 링크 구조화
  75:  핵심 수치 존재, 출처 일부
  50:  핵심 수치 일부, 마케팅 문구 혼재
  25:  마케팅 문구 위주, 수치 극소
  0:   수치 없음, 전부 감성적 문구

측정 방법:
  수치 포함 문장 수 / 전체 제품 설명 문장 수 = 팩트 밀도 비율
```

### S-5. 브랜드 메시지 긍정도·일관성 (가중치: 10%)

```
기준:
  100: 일관된 브랜드 메시지 + 검증 가능한 클레임 + 고유 차별점 구조화
  80:  일관된 메시지, 일부 클레임 검증 가능
  60:  일관성 있으나 클레임 검증 불가
  40:  메시지 불일관 또는 부정적 연관
  20:  브랜드 메시지 부재

가산점:
  +5: DefinedTerm Schema로 브랜드 고유 기능 정의
  +5: Certification Schema로 수상/인증 구조화
감점:
  -10: 출처 없는 "World's first" 또는 "Best" 류 주장이 3개 이상
```

### S-6. AI 친화적 인프라 (가중치: 10%)

```
기준:
  100: llms.txt 완전 구현 + Wikidata/Wikipedia sameAs + Sitemap lastmod 최신
  70:  Wikidata sameAs + Sitemap, llms.txt 없음
  40:  Sitemap만 있음
  15:  robots.txt만 있음 (llms.txt, Wikidata 없음)
  0:   아무것도 없음
```

### S-7. 콘텐츠 탐색 구조 (가중치: 10%)

```
기준:
  100: BreadcrumbList + 내부 링크 체계 + 관련 제품 ItemList
  70:  BreadcrumbList 있음
  40:  내부 링크 있으나 스키마 없음
  10:  탐색 구조 미흡
  0:   없음
```

### 최종 점수 산출

```
최종_점수 = S1×0.15 + S2×0.25 + S3×0.20 + S4×0.10 + S5×0.10 + S6×0.10 + S7×0.10

등급:
  90-100: Excellent (GEO 최적화 완료)
  75-89:  Good (주요 영역 최적화, 세부 개선 필요)
  55-74:  Needs Improvement (핵심 영역 취약)
  35-54:  Poor (구조화 전반 미흡)
  0-34:   Critical (LLM 거의 정보 없음)
```

---

## ── PHASE 6: IMPROVEMENT MATRIX ─────────────────────────────

수집된 데이터 기반으로 다음 형식의 개선 항목을 생성합니다.

각 항목:
```yaml
- id: "T-1"  # T=탐색형, C=비교형, X=공통
  title: "항목명"
  scenario: "탐색형 | 비교형 | 공통"
  current_state: "현재 상태"
  recommendation: "구체적 개선 방향"
  impact_score: 1-5  # GEO 임팩트
  difficulty: 1-5    # 구현 난이도 (1=쉬움)
  effort_estimate: "N일/주"
  sprint: 1|2|3      # 1=즉시, 2=1달, 3=분기
  affected_dimensions: ["S1", "S2"]  # 영향받는 채점 차원
```

**시나리오 프레임 원칙:**
- 탐색형: 소비자가 해당 브랜드 제품에 대해 상세 정보를 LLM에 질의하는 경우
- 비교형: 소비자가 해당 브랜드와 경쟁사를 비교할 때 해당 브랜드 측 데이터가 얼마나 정확하게 표현되는지
  → 경쟁사 이름을 사이트에 추가하는 것은 권고 항목이 아님
  → 목표: 해당 브랜드 자신의 데이터를 완전·정확하게 구조화

---

## ── PHASE 7: OUTPUT ─────────────────────────────────────────

Phase 7은 공통 대시보드 출력 사양을 따릅니다.
→ ARCHITECTURE.md 섹션 9-E.5 "Interactive Dashboard 출력 사양" 참조

---

## ── PHASE 8: DIFF MODE ──────────────────────────────────────

`previous_run_id`가 null이 아닌 경우 실행합니다.

```
DIFF 입력:
  current_run:  현재 평가 JSON 요약
  previous_run: 이전 평가 JSON 요약

DIFF 출력:
  score_delta:
    overall: +N / -N
    per_dimension: {S1: +N, S2: -N, ...}

  schema_changes:
    added:   ["새로 구현된 스키마 항목"]
    removed: ["사라진 스키마 항목"]

  probe_changes:
    improved: ["FAIL→PARTIAL", "PARTIAL→PASS" 항목"]
    regressed: ["PASS→PARTIAL", "PARTIAL→FAIL" 항목"]

  new_issues:   ["이전 실행엔 없었던 새 취약점"]
  fixed_issues: ["이전 실행에서 수정된 취약점"]

  summary_sentence:
    "전반적으로 +N점 개선. [항목]이 해결됨. [항목]은 여전히 미흡."
```
