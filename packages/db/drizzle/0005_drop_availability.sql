-- 국내 유통 판정과 가격을 폐기한다 — ADR-0022
-- expand-contract의 contract다 (autonomous-pipeline-plan.md §7.1). 사용자 승인 2026-09-23.
--
-- 지우는 것은 한 번도 채워진 적이 없다 (네이버 쇼핑 API 매칭이 돌기 전에 API가 종료됐다).
-- 그래도 비었다고 가정하지 않는다 — 행이 있으면 여기서 멈춘다. CASCADE도 쓰지 않는다:
-- 모르는 의존이 있으면 조용히 같이 지우는 대신 실패해야 한다.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "skus") OR EXISTS (SELECT 1 FROM "importers")
     OR EXISTS (SELECT 1 FROM "parts" WHERE "kr_available" IS NOT NULL OR "kr_checked_at" IS NOT NULL) THEN
    RAISE EXCEPTION '국내 유통 데이터가 남아 있다. ADR-0022의 전제(0행)가 깨졌다 — 지우기 전에 확인할 것';
  END IF;
END $$;
--> statement-breakpoint
-- skus가 importers를 참조하므로 skus를 먼저 지운다
DROP TABLE "skus";--> statement-breakpoint
DROP TABLE "importers";--> statement-breakpoint
ALTER TABLE "parts" DROP COLUMN "kr_available";--> statement-breakpoint
ALTER TABLE "parts" DROP COLUMN "kr_checked_at";
