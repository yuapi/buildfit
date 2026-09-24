-- 부품별 성능 측정값 — ADR-0023, 명세 §6.9
-- expand-contract T0: 테이블 추가뿐이라 되돌릴 수 있다 (autonomous-pipeline-plan.md §7.1).

CREATE TABLE "part_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"runs" integer NOT NULL,
	"device_name" text NOT NULL,
	"backend" text NOT NULL,
	"measured_version" text NOT NULL,
	"per_chip" boolean DEFAULT false NOT NULL,
	"source_url" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_benchmarks" ADD CONSTRAINT "part_benchmarks_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "part_benchmarks_part_axis_uq" ON "part_benchmarks" USING btree ("part_id","axis");