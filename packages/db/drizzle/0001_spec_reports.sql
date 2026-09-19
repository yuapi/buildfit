CREATE TABLE "spec_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"spec_key" text NOT NULL,
	"reported_value" text,
	"note" text,
	"client_token" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spec_reports" ADD CONSTRAINT "spec_reports_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spec_reports_part_idx" ON "spec_reports" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "spec_reports_status_idx" ON "spec_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "spec_reports_dedupe_uq" ON "spec_reports" USING btree ("part_id","spec_key","client_token");