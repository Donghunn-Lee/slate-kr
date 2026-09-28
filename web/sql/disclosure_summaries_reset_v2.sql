-- Neon 콘솔에서 수동 실행. 저장소에는 추적용으로만 둔다 — 자동 마이그레이션 러너는 없다.
-- 절차: ① 프롬프트 v2·gemini-3.8-flash 전환이 프로덕션에 배포된 뒤 실행한다 — 먼저 지우면
--         배포 전 코드가 v1 요약을 다시 캐시한다
--       ② 검증 SELECT 로 모델별 행 수·생성 시각 범위 확인
--       ③ BEGIN~COMMIT 블록 실행. DELETE 카운트가 ② 합계와 다르면 ROLLBACK 하고 다시 확인
--
-- v1 프롬프트 요약도 3필드 스키마를 통과하므로 normalizeDisclosureSummary 가 캐시 미스로
--      걸러내지 않고, 캐시는 rcept_no 단위로 만료 없이 남는다 → 지우지 않으면 v1 요약이 계속 반환된다.
-- 전체 삭제 — 지운 공시는 다음 요약 요청 때 v2 프롬프트로 다시 생성된다.

-- ── 검증 SELECT (기대: 모델별 행 수 · 생성 시각 범위, 합계 = 예상 DELETE 카운트) ──
SELECT model_name,
       count(*)        AS rows,
       min(created_at) AS first_at,
       max(created_at) AS last_at
FROM disclosure_summaries
GROUP BY model_name
ORDER BY model_name;

BEGIN;

DELETE FROM disclosure_summaries;
-- 예상 DELETE 카운트: 검증 SELECT 의 rows 합계

-- 삭제 후 확인 (COMMIT 전 검수): SELECT count(*) FROM disclosure_summaries; → 0

COMMIT;

-- 롤백이 필요하면 COMMIT 대신 ROLLBACK;
