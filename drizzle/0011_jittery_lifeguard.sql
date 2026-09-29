UPDATE `members` SET `contactDiscoveryEnabled` = false;
--> statement-breakpoint
ALTER TABLE `members` MODIFY COLUMN `contactDiscoveryEnabled` boolean NOT NULL DEFAULT false;
