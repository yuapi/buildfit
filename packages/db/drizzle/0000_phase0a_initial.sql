CREATE TABLE "importers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"support_url" text,
	"note" text,
	"confidence" text DEFAULT 'seed' NOT NULL,
	"source_url" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"confidence" numeric(4, 3),
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_specs" (
	"part_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"unit" text,
	"source_url" text,
	"verified_at" timestamp with time zone,
	"disputed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_specs_part_id_key_pk" PRIMARY KEY("part_id","key")
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"brand" text,
	"model_name" text NOT NULL,
	"release_year" integer,
	"discontinued" boolean DEFAULT false NOT NULL,
	"chip_id" uuid,
	"opendb_id" text,
	"mpn" text,
	"kr_available" boolean,
	"kr_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"importer_id" uuid,
	"display_name_ko" text NOT NULL,
	"gtin" text,
	"mall_product_id" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_aliases" ADD CONSTRAINT "part_aliases_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_specs" ADD CONSTRAINT "part_specs_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_importer_id_importers_id_fk" FOREIGN KEY ("importer_id") REFERENCES "public"."importers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "importers_name_uq" ON "importers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "part_aliases_part_raw_uq" ON "part_aliases" USING btree ("part_id","raw_name");--> statement-breakpoint
CREATE INDEX "part_aliases_raw_name_idx" ON "part_aliases" USING btree ("raw_name");--> statement-breakpoint
CREATE INDEX "part_specs_key_idx" ON "part_specs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "part_specs_disputed_idx" ON "part_specs" USING btree ("disputed") WHERE "part_specs"."disputed";--> statement-breakpoint
CREATE UNIQUE INDEX "parts_slug_uq" ON "parts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_opendb_id_uq" ON "parts" USING btree ("opendb_id");--> statement-breakpoint
CREATE INDEX "parts_category_idx" ON "parts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "parts_chip_id_idx" ON "parts" USING btree ("chip_id");--> statement-breakpoint
CREATE INDEX "parts_mpn_idx" ON "parts" USING btree ("mpn");--> statement-breakpoint
CREATE INDEX "skus_part_id_idx" ON "skus" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "skus_importer_id_idx" ON "skus" USING btree ("importer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skus_mall_product_uq" ON "skus" USING btree ("mall_product_id");