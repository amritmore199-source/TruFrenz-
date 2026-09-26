CREATE TABLE `subscription_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`channel` enum('play','app-store') NOT NULL,
	`productId` varchar(120) NOT NULL,
	`planId` varchar(32) NOT NULL,
	`transactionId` varchar(200) NOT NULL,
	`purchaseTokenHash` varchar(64) NOT NULL,
	`status` enum('pending','active','expired','revoked') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`autoRenewing` boolean NOT NULL DEFAULT true,
	`cancelledAt` timestamp,
	`lastVerifiedAt` timestamp,
	`verifiedBy` varchar(16) NOT NULL DEFAULT 'sandbox',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_receipts_transactionId_unique` UNIQUE(`transactionId`)
);
