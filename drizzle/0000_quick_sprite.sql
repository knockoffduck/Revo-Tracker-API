-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `bios_links` (
	`id` varchar(36) NOT NULL,
	`motherboard_id` int NOT NULL,
	`bios_version` varchar(100) NOT NULL,
	`download_url` varchar(1024) NOT NULL,
	`release_date` varchar(12),
	CONSTRAINT `bios_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_motherboard_version` UNIQUE(`motherboard_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`href` varchar(255) NOT NULL,
	`cid` int NOT NULL,
	`scrapeable_subcategories` tinyint(1) NOT NULL,
	`scrapeable_categories` tinyint(1) NOT NULL,
	`created` datetime NOT NULL,
	`updated` datetime NOT NULL,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_sets` (
	`id` varchar(36) NOT NULL,
	`date_fetched` varchar(255),
	`status` varchar(255),
	`created` datetime,
	CONSTRAINT `item_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` varchar(36) NOT NULL,
	`ple_code` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`RRP` double,
	`staff_price` double,
	`percentage_difference` double,
	`cost_difference` double,
	`MSRP` double,
	`percentage_difference_MSRP` double,
	`cost_difference_MSRP` double,
	`item_url` varchar(255),
	`img_url` varchar(255),
	`category` varchar(255),
	`model` varchar(255),
	`item_set` varchar(36),
	`created` datetime,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `motherboards` (
	`id` varchar(36) NOT NULL,
	`model_name` varchar(255) NOT NULL,
	`product_url` varchar(1024) NOT NULL,
	`mid` int NOT NULL,
	`last_checked` datetime,
	CONSTRAINT `motherboards_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_name` UNIQUE(`model_name`),
	CONSTRAINT `mid` UNIQUE(`mid`)
);
--> statement-breakpoint
CREATE TABLE `subcategories` (
	`id` varchar(36) NOT NULL,
	`cid` int,
	`name` varchar(255),
	`categories` varchar(15),
	`created` datetime,
	`updated` datetime,
	CONSTRAINT `subcategories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bios_links` ADD CONSTRAINT `bios_links_motherboard_id_motherboards_id_fk` FOREIGN KEY (`motherboard_id`) REFERENCES `motherboards`(`mid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_item_set_item_sets_id_fk` FOREIGN KEY (`item_set`) REFERENCES `item_sets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subcategories` ADD CONSTRAINT `subcategories_categories_categories_id_fk` FOREIGN KEY (`categories`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_motherboard_id` ON `bios_links` (`motherboard_id`);--> statement-breakpoint
CREATE INDEX `idx_item_set` ON `items` (`item_set`);
*/