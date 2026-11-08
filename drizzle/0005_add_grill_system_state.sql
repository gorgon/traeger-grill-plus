ALTER TABLE `grill_state` ADD COLUMN `system_status` integer DEFAULT 99 NOT NULL;
--> statement-breakpoint
ALTER TABLE `grill_state` ADD COLUMN `system_state_label` text DEFAULT 'Offline' NOT NULL;
--> statement-breakpoint
ALTER TABLE `grill_state` ADD COLUMN `cook_id_present` integer DEFAULT 0 NOT NULL;
