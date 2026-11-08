ALTER TABLE `cook_sessions` ADD COLUMN `stage_start_probe` integer;
--> statement-breakpoint
ALTER TABLE `cook_sessions` ADD COLUMN `alarm_acked_keys` text DEFAULT '' NOT NULL;
