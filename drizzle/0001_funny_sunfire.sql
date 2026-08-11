CREATE TABLE `access_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`scope` text NOT NULL,
	`reviewer` text NOT NULL,
	`due` text NOT NULL,
	`progress` integer NOT NULL,
	`total` integer NOT NULL,
	`approved` integer NOT NULL,
	`revoked` integer NOT NULL,
	`pending` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `delegation_records` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user` text NOT NULL,
	`to_user` text NOT NULL,
	`role` text NOT NULL,
	`scope` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `identity_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`principal` text NOT NULL,
	`principal_type` text NOT NULL,
	`role` text NOT NULL,
	`scope` text NOT NULL,
	`source` text NOT NULL,
	`risk` text NOT NULL,
	`status` text NOT NULL,
	`valid_until` text,
	`owner` text NOT NULL,
	`updated_at` text NOT NULL
);
