CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approved_emails` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text,
	`role` text NOT NULL,
	`added_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cabinet_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text,
	`source_fingerprint` text,
	`import_batch_id` text,
	`source_row` integer,
	`cabinet_id` text NOT NULL,
	`checked_at` text NOT NULL,
	`original_timestamp` text,
	`source_timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`checker_name` text,
	`user_id` text,
	`door_status` text,
	`trash_present` integer DEFAULT false NOT NULL,
	`bg_needed` integer DEFAULT false NOT NULL,
	`is_empty` integer,
	`snack_summary` text,
	`notes` text,
	`validation_issues` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'mission-control' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_checks_external_id_unique` ON `cabinet_checks` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_checks_source_fingerprint_unique` ON `cabinet_checks` (`source_fingerprint`);--> statement-breakpoint
CREATE TABLE `cabinets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`floor` integer NOT NULL,
	`location` text NOT NULL,
	`capacity` integer DEFAULT 300 NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer NOT NULL,
	`sensor_ready` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `donations` (
	`id` text PRIMARY KEY NOT NULL,
	`donor_label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`received_at` text NOT NULL,
	`campaign` text,
	`restriction` text,
	`status` text DEFAULT 'received' NOT NULL,
	`attributed_snacks` integer DEFAULT 0 NOT NULL,
	`attribution_type` text DEFAULT 'estimated' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`mode` text DEFAULT 'review' NOT NULL,
	`requires_setup` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`cabinet_id` text NOT NULL,
	`kind` text NOT NULL,
	`product_request` text,
	`message` text,
	`status` text DEFAULT 'new' NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_reference` text NOT NULL,
	`imported_by` text,
	`imported_at` text NOT NULL,
	`parser_version` text NOT NULL,
	`total_rows` integer NOT NULL,
	`inserted_rows` integer NOT NULL,
	`duplicate_rows` integer NOT NULL,
	`warning_rows` integer NOT NULL,
	`quarantined_rows` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`cabinet_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer,
	`target_quantity` integer DEFAULT 40 NOT NULL,
	`last_counted_at` text,
	`last_counted_by` text,
	PRIMARY KEY(`cabinet_id`, `product_id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_events` (
	`id` text PRIMARY KEY NOT NULL,
	`cabinet_id` text NOT NULL,
	`product_id` text,
	`event_type` text NOT NULL,
	`quantity_delta` integer,
	`quantity_after` integer,
	`notes` text,
	`user_id` text,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`supplier` text,
	`package_size` text,
	`units_per_case` integer,
	`cost_per_case` real,
	`nutrition_score` integer DEFAULT 3 NOT NULL,
	`allergen_flags` text DEFAULT '[]' NOT NULL,
	`dietary_labels` text DEFAULT '[]' NOT NULL,
	`popularity_score` integer DEFAULT 50 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`purchased_at` text NOT NULL,
	`status` text DEFAULT 'recorded' NOT NULL,
	`receipt_url` text,
	`snack_units` integer,
	`donation_id` text,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`summary` text NOT NULL,
	`metrics_json` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE TABLE `sensors` (
	`id` text PRIMARY KEY NOT NULL,
	`cabinet_id` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`last_seen_at` text,
	`battery_percent` integer,
	`tare_grams` real,
	`calibration_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`cabinet_id` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_to` text,
	`due_at` text,
	`completed_at` text,
	`instructions` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'volunteer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `volunteer_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`volunteer_name` text NOT NULL,
	`shift_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL
);
