CREATE TABLE `member_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`peerId` varchar(64) NOT NULL,
	`connectionState` enum('accepted','requested','incoming','declined') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_connections_pair_idx` UNIQUE(`memberId`,`peerId`)
);
