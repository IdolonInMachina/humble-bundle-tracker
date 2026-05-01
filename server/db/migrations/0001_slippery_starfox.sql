CREATE INDEX `bundles_purchased_at_idx` ON `bundles` (`purchased_at`);--> statement-breakpoint
CREATE INDEX `items_bundle_id_idx` ON `items` (`bundle_id`);--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `items_expires_at_idx` ON `items` (`expires_at`);