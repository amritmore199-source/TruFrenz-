ALTER TABLE `subscription_receipts` MODIFY COLUMN `channel` enum('play','app-store','comp') NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `grantedBy` varchar(320);--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `grantedReason` varchar(500);