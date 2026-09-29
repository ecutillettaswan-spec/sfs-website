CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`topic` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inquiries_status_date` ON `inquiries` (`status`,`submitted_at`);