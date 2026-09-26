CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` varchar(10) NOT NULL,
	`eventType` varchar(48) NOT NULL,
	`memberId` int,
	`groupId` varchar(64),
	`metadata` text,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`noticeKind` enum('warning','suspension','ban','reinstatement','verification_approved','verification_rejected','announcement','refund') NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`actorEmail` varchar(320),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `members` ADD `phoneE164` varchar(20);--> statement-breakpoint
ALTER TABLE `members` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `members` ADD `statusReason` text;--> statement-breakpoint
ALTER TABLE `members` ADD `statusChangedBy` varchar(320);--> statement-breakpoint
ALTER TABLE `members` ADD `statusChangedAt` timestamp;--> statement-breakpoint
ALTER TABLE `members` ADD `resetTokenHash` varchar(64);--> statement-breakpoint
ALTER TABLE `members` ADD `resetRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `members` ADD CONSTRAINT `members_phoneE164_unique` UNIQUE(`phoneE164`);