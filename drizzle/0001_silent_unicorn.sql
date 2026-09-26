CREATE TABLE `admin_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`totpSecret` varchar(64) NOT NULL,
	`adminRole` enum('owner','admin','moderator') NOT NULL DEFAULT 'moderator',
	`disabled` boolean NOT NULL DEFAULT false,
	`lastSignedIn` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `admin_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorEmail` varchar(320) NOT NULL,
	`actorRole` varchar(32) NOT NULL,
	`module` varchar(48) NOT NULL,
	`action` varchar(64) NOT NULL,
	`targetType` varchar(48) NOT NULL,
	`targetId` varchar(64) NOT NULL,
	`targetLabel` varchar(200) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`adminId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `blocked_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(120) NOT NULL,
	`keywordSeverity` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`hits` int NOT NULL DEFAULT 0,
	`addedBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_keywords_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_keywords_keyword_unique` UNIQUE(`keyword`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`segment` enum('all','verified','unverified','free','premium') NOT NULL DEFAULT 'all',
	`recipientCount` int NOT NULL DEFAULT 0,
	`sentBy` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` varchar(10) NOT NULL,
	`activeUsers` int NOT NULL DEFAULT 0,
	`newSignups` int NOT NULL DEFAULT 0,
	`verifiedUsers` int NOT NULL DEFAULT 0,
	`unverifiedUsers` int NOT NULL DEFAULT 0,
	`freeUsers` int NOT NULL DEFAULT 0,
	`paidUsers` int NOT NULL DEFAULT 0,
	`activeGroups` int NOT NULL DEFAULT 0,
	`callsMade` int NOT NULL DEFAULT 0,
	`matchesMade` int NOT NULL DEFAULT 0,
	CONSTRAINT `daily_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_metrics_day_unique` UNIQUE(`day`)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flagKey` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL,
	`description` text,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedBy` varchar(320),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feature_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_flags_flagKey_unique` UNIQUE(`flagKey`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`handle` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`age` int,
	`dateOfBirth` varchar(10),
	`homeArea` varchar(120),
	`verificationTier` enum('none','phone','id_selfie') NOT NULL DEFAULT 'none',
	`accountStatus` enum('active','warned','suspended','banned') NOT NULL DEFAULT 'active',
	`subscriptionTier` enum('free','premium') NOT NULL DEFAULT 'free',
	`available` boolean NOT NULL DEFAULT true,
	`reportCount` int NOT NULL DEFAULT 0,
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `members_id` PRIMARY KEY(`id`),
	CONSTRAINT `members_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectType` enum('profile','message','group') NOT NULL,
	`subjectId` int NOT NULL,
	`subjectLabel` varchar(160) NOT NULL,
	`reporterName` varchar(120) NOT NULL,
	`reason` varchar(160) NOT NULL,
	`contentExcerpt` text,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`reportCount` int NOT NULL DEFAULT 1,
	`autoFlagged` boolean NOT NULL DEFAULT false,
	`reportStatus` enum('open','warned','suspended','banned','dismissed') NOT NULL DEFAULT 'open',
	`resolvedBy` varchar(320),
	`resolutionNote` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`memberName` varchar(120) NOT NULL,
	`eventKind` enum('grant','revoke','refund') NOT NULL,
	`tier` varchar(32) NOT NULL,
	`amountCents` int NOT NULL DEFAULT 0,
	`reason` text,
	`actorEmail` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verification_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`memberName` varchar(120) NOT NULL,
	`submittedName` varchar(120) NOT NULL,
	`submittedDob` varchar(10) NOT NULL,
	`selfieRef` varchar(255),
	`idDocumentRef` varchar(255),
	`riskScore` int NOT NULL DEFAULT 0,
	`submissionStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`reviewedBy` varchar(320),
	`reviewedAt` timestamp,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_submissions_id` PRIMARY KEY(`id`)
);
