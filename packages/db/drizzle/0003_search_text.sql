-- 검색용 평탄화 이름 — ADR-0017.
-- expand-contract T0: 컬럼 추가뿐이라 되돌릴 수 있다 (autonomous-pipeline-plan.md §7.1).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "search_text" text GENERATED ALWAYS AS (regexp_replace(lower(model_name || ' ' || coalesce(brand, '') || ' ' || coalesce(mpn, '')), '[^a-z0-9]', '', 'g')) STORED;
--> statement-breakpoint
CREATE INDEX "parts_search_text_trgm_idx" ON "parts" USING gin ("search_text" gin_trgm_ops);
