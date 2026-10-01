CREATE TABLE `member_group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`groupId` varchar(96) NOT NULL,
	`memberRef` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`groupRole` enum('admin','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_group_members_unique_idx` UNIQUE(`memberId`,`groupId`,`memberRef`)
);
--> statement-breakpoint
CREATE TABLE `member_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`groupId` varchar(96) NOT NULL,
	`name` varchar(60) NOT NULL,
	`groupLifecycle` enum('active','closed') NOT NULL DEFAULT 'active',
	`closedReason` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_groups_group_idx` UNIQUE(`memberId`,`groupId`)
);
--> statement-breakpoint
CREATE INDEX `member_group_members_group_idx` ON `member_group_members` (`memberId`,`groupId`);--> statement-breakpoint
CREATE INDEX `member_groups_member_idx` ON `member_groups` (`memberId`);