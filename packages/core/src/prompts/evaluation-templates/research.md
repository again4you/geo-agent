# GEO Evaluation Template: 연구소 대표 Site
> Site Type: `research` | Version: 1.0
> 적용 대상: research.samsung.com, research.google, research.microsoft.com 등 기업 연구소 사이트

---

## ── CONFIGURATION BLOCK ──────────────────────────────────────

```yaml
TARGET:
  site_name: "{{SITE_NAME}}"
  base_url: "{{BASE_URL}}"
  root_url: "{{ROOT_URL}}"
  locale: "{{LOCALE}}"
  site_type: "research"

RESEARCH_SECTIONS:                     # 주요 연구 섹션 (최대 5개)
  {{#RESEARCH_SECTIONS}}
  - name: "{{name}}"                   # e.g., "AI Research", "Semiconductor"
    url: "{{url}}"                     # 섹션 메인 URL
    publications_url: "{{publications_url}}"  # 논문 목록 URL (선택)
    projects_url: "{{projects_url}}"          # 프로젝트 목록 URL (선택)
  {{/RESEARCH_SECTIONS}}

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

평가 관점: **일반 LLM 서비스(ChatGPT, Claude, Gemini, Perplexity 등)의 크롤러**가 해당 연구소 사이트를 읽을 때 어떤 정보를 얻을 수 있는지를 측정합니다.

핵심 원칙:
- 연구소 사이트의 핵심 역할은 **연구 성과(논문, 특허, 프로젝트)를 LLM이 정확하게 인용하고 참조**하도록 하는 것입니다.
- 학술 정보는 정확성과 출처 추적이 특히 중요합니다.
- 연구자 프로필과 연구 분야 간 연결이 LLM의 전문성 판단에 직접 영향합니다.
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
  - 논문/연구 페이지 경로 허용 여부
  - PDF 파일 접근 허용 여부
RECORD AS: infra.robots_txt

FETCH: {root_url}/llms.txt
RECORD: HTTP 상태코드 및 파일 내용 (404이면 "부재" 기록)
RECORD AS: infra.llms_txt

FETCH: {base_url}/sitemap.xml  (또는 {root_url}/sitemap.xml)
RECORD: 존재 여부, lastmod 날짜 범위, 논문 URL 포함 여부
RECORD AS: infra.sitemap
```

### 1-B. 홈페이지 조직 스키마

```
FETCH: {base_url}/
EXTRACT:
  - 모든 JSON-LD 블록의 @type 값 목록
  - Organization/ResearchOrganization 스키마 전문
    → sameAs 배열 (소셜, Wikipedia, Wikidata, Google Scholar, DBLP 등)
    → foundingDate, address, parentOrganization 포함 여부
  - WebSite 스키마 (SearchAction 포함 여부)
  - 주요 연구 분야 목록이 구조화되어 있는지
  - meta title, description, og:tags
RECORD AS: infra.homepage_schema
```

---

## ── PHASE 2: RESEARCH CONTENT ANALYSIS ──────────────────────

RESEARCH_SECTIONS의 각 항목에 대해 아래 작업을 수행합니다.

### 2-A. 연구 분야 랜딩 페이지

```
FETCH: {section.url}
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - 연구 분야 설명 텍스트 존재 여부 및 길이
  - 연구자 목록 (Person 스키마 존재 여부)
  - 관련 논문/프로젝트 링크 존재 여부
  - BreadcrumbList 존재 여부
RECORD AS: section[N].landing_schema
```

### 2-B. 논문/출판물 목록 페이지

```
FETCH: {section.publications_url}  (존재하는 경우)
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - ScholarlyArticle / TechArticle / Article 스키마 존재 여부
  - 각 논문 항목의 포함 필드:
      headline(title) / author / datePublished / publisher /
      abstract / doi / url / citation / keywords
  - ItemList 스키마로 논문 목록이 구조화되어 있는지
  - 연도별/분야별 필터링이 정적 HTML에 있는지
  - PDF 직접 다운로드 링크 존재 여부
RECORD AS: section[N].publications_schema
```

### 2-C. 대표 논문 상세 페이지

```
FETCH: {대표 논문 URL}  (논문 목록에서 최근 1개 선택)
EXTRACT:
  - JSON-LD 스키마 @type 목록
  - ScholarlyArticle 스키마 상세:
    → headline, author[], datePublished, publisher
    → abstract (전문 텍스트 vs 요약만)
    → citation (피인용 정보)
    → isPartOf (학회/저널 정보)
    → keywords / about
  - 저자별 Person 스키마 (affiliation, sameAs[ORCID, Google Scholar])
  - 정적 HTML에서 추출 가능한 정보량
  - PDF 접근 경로 (직접 링크 vs 외부 리다이렉트)
  - 관련 논문/프로젝트 링크
RECORD AS: section[N].paper_detail_schema
```

### 2-D. 연구자 프로필 페이지 (존재하는 경우)

```
FETCH: {대표 연구자 프로필 URL}
EXTRACT:
  - Person 스키마 존재 여부
    → name, jobTitle, affiliation, sameAs[ORCID, Google Scholar, DBLP]
    → alumniOf, award, knowsAbout
  - 논문 목록이 구조화되어 있는지
  - 연구 분야 태그 존재 여부
RECORD AS: section[N].researcher_profile
```

---

## ── PHASE 3: STRUCTURED DATA AUDIT ──────────────────────────

### 스키마 구현 현황 체크리스트

| 스키마 타입 | 홈 | 분야 랜딩 | 논문 목록 | 논문 상세 | 연구자 |
|---|---|---|---|---|---|
| Organization/ResearchOrganization | ✓/✗ | - | - | - | - |
| WebPage | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| ScholarlyArticle | - | - | ✓/✗ | ✓/✗ | - |
| Person (연구자) | - | ✓/✗ | - | ✓/✗ | ✓/✗ |
| ItemList (논문/프로젝트) | - | ✓/✗ | ✓/✗ | - | ✓/✗ |
| BreadcrumbList | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Dataset | - | - | - | ✓/✗ | - |
| SoftwareSourceCode | - | - | - | ✓/✗ | - |
| SpeakableSpecification | ✓/✗ | - | - | - | - |

### 학술 메타데이터 품질 분석

대표 논문에 대해:
- DOI 링크 존재 여부
- 저자 ORCID 연결 여부
- 피인용 수 구조화 여부
- abstract 전문이 정적 HTML에 존재하는지
- 키워드/태그의 구조화 수준

---

## ── PHASE 4: SYNTHETIC PROBE SUITE ──────────────────────────

연구소 사이트 전용 8개 프로브:

```
P-01: "[연구소명]의 AI 연구 분야와 주요 성과"
  TARGET: 연구 분야 랜딩 페이지
  MEASURE: 연구 분야 목록 + 대표 성과(논문/특허) 최소 2개 답변 가능 여부
  VERDICT: 분야+성과 모두 → PASS / 분야만 → PARTIAL / 없음 → FAIL

P-02: "[연구자명]의 연구 분야와 대표 논문"
  TARGET: 연구자 프로필 페이지
  MEASURE: 연구 분야 + 논문 제목 최소 2편 + 소속 답변 가능 여부
  VERDICT: 3개 모두 → PASS / 1~2개 → PARTIAL / 0개 → FAIL

P-03: "[논문 제목]의 저자, 학회, 발표일"
  TARGET: 논문 상세 페이지
  MEASURE: 저자 전원, 학회/저널명, 발표 연도 답변 가능 여부
  VERDICT: 3개 모두 ScholarlyArticle에서 추출 → PASS / 일부 → PARTIAL / 없음 → FAIL

P-04: "[연구소명]의 최근 1년 논문 목록"
  TARGET: 논문 목록 페이지
  MEASURE: 최근 1년 논문 제목 + 저자 최소 5편 답변 가능 여부
  VERDICT: 5편 이상 구조화 데이터에서 추출 → PASS / 1~4편 → PARTIAL / 불가 → FAIL

P-05: "[연구 분야]에서 [연구소명]의 기여"
  TARGET: 분야 랜딩 + 관련 논문
  MEASURE: 구체적 연구 성과 + 수치(논문 수, 인용 수 등) 답변 가능 여부
  VERDICT: 성과+수치 모두 → PASS / 성과만 → PARTIAL / 없음 → FAIL

P-06: "[논문A] vs [논문B] 비교" (같은 연구소 내)
  TARGET: 두 논문 상세 페이지
  MEASURE: 주제 차이, 방법론, 결과 비교 답변 가능 여부
  VERDICT: abstract + 키워드에서 비교 가능 → PASS / 제목만 → PARTIAL / 불가 → FAIL

P-07: "[연구소명]에서 공개한 데이터셋/코드"
  TARGET: 연구 자원 페이지 또는 논문 상세
  MEASURE: 데이터셋/코드 저장소 링크 + 설명 답변 가능 여부
  VERDICT: Dataset/SoftwareSourceCode 스키마로 구조화 → PASS / 링크만 → PARTIAL / 없음 → FAIL

P-08: "[연구소명]의 특허 또는 기술 이전 현황"
  TARGET: 기술/특허 페이지 (있는 경우)
  MEASURE: 특허 목록 또는 기술 이전 사례 답변 가능 여부
  VERDICT: 구조화된 특허 정보 → PASS / 텍스트 언급만 → PARTIAL / 없음 → FAIL
```

---

## ── PHASE 5: SCORING RUBRIC ─────────────────────────────────

7개 차원에 대해 0~100점으로 채점합니다.

### S-1. LLM 크롤링 접근성 (가중치: 15%)

```
기준:
  100: 주요 AI 봇 모두 명시 허용 + 논문/연구 페이지 접근 허용
       llms.txt 존재 + PDF 접근 허용
  80:  주요 AI 봇 대부분 허용, 연구 페이지 접근 가능, llms.txt 없음
  60:  일부 봇 허용, PDF 차단 없음
  40:  봇 명시 없음, 일부 연구 페이지 차단
  20:  AI 봇 차단 또는 주요 연구 페이지 차단
  0:   전체 차단

감점 요인:
  -10: PDF 파일 접근 차단
  -5:  sitemap.xml에 논문 URL 미포함
  -5:  연구자 프로필 페이지 차단
```

### S-2. 학술 데이터 구조화 품질 (가중치: 25%)

```
기준:
  100: ScholarlyArticle 완전 구현 (author, datePublished, publisher,
       abstract, DOI, citation, keywords) + Person 스키마 (ORCID, affiliations)
  80:  ScholarlyArticle 기본 필드 + Person 있으나 ORCID 없음
  60:  Article 타입만 사용, 학술 전용 필드 부재
  40:  WebPage 스키마만, 논문 구조화 없음
  20:  스키마 없음, 논문 정보 비구조화
  0:   JSON-LD 없음

가산점:
  +5: Dataset/SoftwareSourceCode 스키마 포함
  +5: 피인용 수(citation count) 구조화
  +3: BreadcrumbList 전면 구현
감점:
  -10: abstract가 정적 HTML에 없음 (JS-only)
```

### S-3. 논문 정보 기계가독성 (가중치: 20%)

```
기준:
  100: 논문 제목, 저자, abstract, 학회, 날짜, DOI가 모두 ScholarlyArticle로 구조화
       연구자 ORCID + Google Scholar 연결
  80:  주요 필드 구조화, DOI 연결, ORCID 없음
  60:  제목+저자+날짜 구조화, abstract 비구조화
  40:  제목만 정적 HTML, 나머지 JS-only 또는 PDF 내부
  20:  논문 정보 대부분 PDF 내부에만 존재
  0:   논문 목록 없음 또는 접근 불가

측정 방법:
  정적 HTML에서 추출 가능한 논문 메타데이터 필드 수 / 전체 가능 필드 수
```

### S-4. 연구 콘텐츠 깊이 (가중치: 10%)

```
기준:
  100: 연구 분야별 상세 설명 + 구체적 성과 수치 + 논문/특허 링크
  75:  분야 설명 + 일부 성과
  50:  분야 목록만, 상세 설명 없음
  25:  연구 분야 비명시, 일반적 소개만
  0:   연구 내용 없음
```

### S-5. 연구소 신뢰도·권위 지표 (가중치: 10%)

```
기준:
  100: 모기관 연결 + Wikidata/Wikipedia sameAs + 수상 이력 구조화
       외부 학술 DB 연결 (Google Scholar, DBLP, Semantic Scholar)
  80:  모기관 연결 + 일부 외부 연결
  60:  기본 Organization 스키마만
  40:  조직 정보 비구조화
  20:  조직 정보 없음

가산점:
  +5: Award 스키마로 수상 이력 구조화
  +5: 파트너/협력 기관 구조화
```

### S-6. AI 친화적 인프라 (가중치: 10%)

```
기준:
  100: llms.txt + Wikidata sameAs + Sitemap lastmod 최신 + 학술 메타태그
  70:  Sitemap + Wikidata, llms.txt 없음
  40:  Sitemap만 있음
  15:  robots.txt만 있음
  0:   아무것도 없음

가산점:
  +5: Dublin Core 또는 Highwire Press 메타태그 (학술 표준)
```

### S-7. 콘텐츠 탐색·연결 구조 (가중치: 10%)

```
기준:
  100: BreadcrumbList + 분야→논문→연구자 양방향 링크 + 관련 연구 추천
  70:  BreadcrumbList + 기본 내부 링크
  40:  내부 링크 있으나 스키마 없음
  10:  탐색 구조 미흡
  0:   없음
```

### 최종 점수 산출

```
최종_점수 = S1×0.15 + S2×0.25 + S3×0.20 + S4×0.10 + S5×0.10 + S6×0.10 + S7×0.10

등급:
  90-100: Excellent (학술 GEO 최적화 완료)
  75-89:  Good (주요 영역 최적화, 세부 개선 필요)
  55-74:  Needs Improvement (핵심 영역 취약)
  35-54:  Poor (학술 데이터 구조화 전반 미흡)
  0-34:   Critical (LLM 거의 연구 정보 없음)
```

---

## ── PHASE 6: IMPROVEMENT MATRIX ─────────────────────────────

각 항목:
```yaml
- id: "R-1"  # R=연구탐색형, A=학술비교형, X=공통
  title: "항목명"
  scenario: "연구탐색형 | 학술비교형 | 공통"
  current_state: "현재 상태"
  recommendation: "구체적 개선 방향"
  impact_score: 1-5
  difficulty: 1-5
  effort_estimate: "N일/주"
  sprint: 1|2|3
  affected_dimensions: ["S1", "S2"]
```

**시나리오 프레임 원칙:**
- 연구탐색형: 사용자가 특정 연구 분야/연구자/논문에 대해 LLM에 질의하는 경우
- 학술비교형: 사용자가 여러 연구기관 또는 연구 성과를 비교 질의하는 경우
  → 목표: 해당 연구소의 성과 데이터가 정확·완전하게 LLM에 전달되는 것

---

## ── PHASE 7: OUTPUT ─────────────────────────────────────────

Phase 7은 공통 대시보드 출력 사양을 따릅니다.
→ ARCHITECTURE.md 섹션 9-E.5 "Interactive Dashboard 출력 사양" 참조

---

## ── PHASE 8: DIFF MODE ──────────────────────────────────────

`previous_run_id`가 null이 아닌 경우 실행합니다.
→ 제조사 템플릿과 동일한 DIFF 구조 적용
