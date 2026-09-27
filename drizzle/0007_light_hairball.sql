CREATE TABLE `otp_send_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('send','failure') NOT NULL DEFAULT 'send',
	`channel` enum('phone','email') NOT NULL,
	`destination` varchar(320) NOT NULL,
	`callerKey` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otp_send_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `otp_send_attempts_destination_time` ON `otp_send_attempts` (`destination`,`createdAt`);--> statement-breakpoint
CREATE INDEX `otp_send_attempts_caller_time` ON `otp_send_attempts` (`callerKey`,`createdAt`);