CREATE TABLE `subscription_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`receiptId` int NOT NULL,
	`reminderKind` varchar(16) NOT NULL,
	`periodEndsAt` timestamp NOT NULL,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	`noticeId` int,
	CONSTRAINT `subscription_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_reminders_receipt_kind` UNIQUE(`receiptId`,`reminderKind`)
);
--> statement-breakpoint
ALTER TABLE `member_notices` MODIFY COLUMN `noticeKind` enum('warning','suspension','ban','reinstatement','verification_approved','verification_rejected','announcement','refund','subscription_renewal','subscription_expired') NOT NULL;