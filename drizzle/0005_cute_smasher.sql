CREATE TABLE `stocking_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stocking_closures_end` ON `stocking_closures` (`end_date`);--> statement-breakpoint
CREATE TABLE `stocking_log` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_date` text,
	`weekday` integer,
	`action` text NOT NULL,
	`actor_name` text,
	`details` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stocking_log_created` ON `stocking_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `stocking_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stocking_roster` (
	`id` text PRIMARY KEY NOT NULL,
	`weekday` integer NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`is_lead` integer DEFAULT false NOT NULL,
	`phone` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stocking_roster_day_name` ON `stocking_roster` (`weekday`,`name_key`);--> statement-breakpoint
CREATE TABLE `stocking_rsvps` (
	`shift_date` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`status` text,
	`is_extra` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`shift_date`, `name_key`)
);
