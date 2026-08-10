CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`revision` integer NOT NULL,
	`operation_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`score` integer NOT NULL,
	`ante` integer NOT NULL,
	`status` text NOT NULL,
	`ruleset_version` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `mode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "runs_mode_check" CHECK(`mode` IN ('standard', 'endless')),
	CONSTRAINT "runs_status_check" CHECK(`status` IN ('active', 'won', 'lost', 'abandoned')),
	CONSTRAINT "runs_revision_check" CHECK(`revision` >= 1),
	CONSTRAINT "runs_score_check" CHECK(`score` >= 0),
	CONSTRAINT "runs_ante_check" CHECK(`ante` >= 1)
);
--> statement-breakpoint
CREATE TABLE `run_operations` (
	`user_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`mode` text NOT NULL,
	`applied_revision` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `operation_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_operations_mode_check" CHECK(`mode` IN ('standard', 'endless'))
);
--> statement-breakpoint
CREATE TABLE `community_uno_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_user_id` text NOT NULL,
	`creator_name` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`modules_json` text NOT NULL,
	`point_total` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "community_uno_cards_points_check" CHECK(`point_total` = 0),
	CONSTRAINT "community_uno_cards_likes_check" CHECK(`like_count` >= 0),
	CONSTRAINT "community_uno_cards_ratings_check" CHECK(`rating_sum` >= 0 AND `rating_count` >= 0)
);
--> statement-breakpoint
CREATE INDEX `community_uno_cards_created_idx` ON `community_uno_cards` (`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `community_card_likes` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `community_uno_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_card_ratings` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `community_uno_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "community_card_ratings_value_check" CHECK(`rating` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `guestbook_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`author_user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`message` text NOT NULL,
	`rating` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guestbook_entries_rating_check" CHECK(`rating` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `guestbook_entries_created_idx` ON `guestbook_entries` (`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `leaderboard_entries` (
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`display_name` text NOT NULL,
	`score` integer NOT NULL,
	`ante` integer NOT NULL,
	`run_revision` integer NOT NULL,
	`ruleset_version` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `mode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "leaderboard_entries_mode_check" CHECK(`mode` IN ('standard', 'endless')),
	CONSTRAINT "leaderboard_entries_score_check" CHECK(`score` >= 0),
	CONSTRAINT "leaderboard_entries_ante_check" CHECK(`ante` >= 1)
);
--> statement-breakpoint
CREATE INDEX `leaderboard_standard_idx` ON `leaderboard_entries` (`mode`,`score`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `leaderboard_endless_idx` ON `leaderboard_entries` (`mode`,`ante`,`score`);
