PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cabinets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`floor` integer NOT NULL,
	`location` text NOT NULL,
	`capacity` integer DEFAULT 250 NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer NOT NULL,
	`sensor_ready` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_cabinets`("id", "name", "floor", "location", "capacity", "status", "active", "sort_order", "sensor_ready", "created_at") SELECT "id", "name", "floor", "location", "capacity", "status", "active", "sort_order", "sensor_ready", "created_at" FROM `cabinets`;--> statement-breakpoint
DROP TABLE `cabinets`;--> statement-breakpoint
ALTER TABLE `__new_cabinets` RENAME TO `cabinets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;