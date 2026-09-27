CREATE TABLE `member_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`chatId` varchar(64) NOT NULL,
	`clientId` varchar(96) NOT NULL,
	`text` text NOT NULL,
	`time` varchar(32) NOT NULL,
	`messageKind` enum('text','photo','voice','location','plan') NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_messages_client_idx` UNIQUE(`memberId`,`clientId`)
);
--> statement-breakpoint
CREATE INDEX `member_messages_chat_idx` ON `member_messages` (`memberId`,`chatId`);