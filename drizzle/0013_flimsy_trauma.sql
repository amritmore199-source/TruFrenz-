ALTER TABLE `members` ADD `referredByCode` varchar(16);--> statement-breakpoint
ALTER TABLE `members` ADD `referredAt` timestamp;
CREATE INDEX `members_referredByCode_idx` ON `members` (`referredByCode`);
