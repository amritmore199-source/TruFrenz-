CREATE TABLE `signin_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` varchar(64) NOT NULL,
	`channel` enum('phone','email') NOT NULL,
	`destination` varchar(320) NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`purpose` enum('signup','login') NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`verifiedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signin_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `signin_challenges_challenge_id` UNIQUE(`challengeId`),
	CONSTRAINT `signin_challenges_channel_destination` UNIQUE(`channel`,`destination`)
);
--> statement-breakpoint
ALTER TABLE `members` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `members` ADD `emailBouncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `members` ADD `emailNotices` boolean DEFAULT true NOT NULL;