CREATE INDEX `idx_checks_cabinet_date` ON `cabinet_checks` (`cabinet_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_checks_source` ON `cabinet_checks` (`source`);--> statement-breakpoint
CREATE INDEX `idx_checks_import_batch` ON `cabinet_checks` (`import_batch_id`,`source_row`);--> statement-breakpoint
CREATE INDEX `idx_donations_date` ON `donations` (`received_at`);--> statement-breakpoint
CREATE INDEX `idx_feedback_status_date` ON `feedback` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_events_cabinet_product_date` ON `inventory_events` (`cabinet_id`,`product_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_purchases_donation` ON `purchases` (`donation_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due` ON `tasks` (`status`,`due_at`);