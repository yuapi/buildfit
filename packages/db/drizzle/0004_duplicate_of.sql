-- 같은 제품의 대표 레코드 가리키기 — docs/research/duplicate-parts.md
-- expand-contract T0: 컬럼 추가뿐이라 되돌릴 수 있다 (autonomous-pipeline-plan.md §7.1).
--
-- 합치지 않고 가리킨다. parts.id는 공유 URL이 담으므로(ADR-0012) 레코드를 없애면
-- 이미 뿌려진 링크가 깨진다. 목록·검색·sitemap만 대표를 보여준다.

ALTER TABLE "parts" ADD COLUMN "duplicate_of" uuid;
--> statement-breakpoint
-- 대표가 97.9%라 「대표 아님」만 담는 부분 인덱스로 둔다.
CREATE INDEX "parts_duplicate_of_idx" ON "parts" USING btree ("duplicate_of") WHERE "parts"."duplicate_of" is not null;
