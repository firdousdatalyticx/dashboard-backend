-- Migration: Add topic_sub_categories table
-- Created: 2024-01-01

-- Create the topic_sub_categories table
CREATE TABLE `topic_sub_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_topic_id` int NOT NULL,
  `sub_category_title` varchar(191) NOT NULL,
  `topic_hash_tags` varchar(191) NOT NULL,
  `topic_urls` varchar(191) NOT NULL,
  `topic_keywords` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add index on customer_topic_id for better query performance
CREATE INDEX `topic_sub_categories_customer_topic_id_idx` ON `topic_sub_categories`(`customer_topic_id`);

-- Add foreign key constraint to link with customer_topics table (optional)
-- Uncomment the following line if you want to enforce referential integrity
-- ALTER TABLE `topic_sub_categories` ADD CONSTRAINT `topic_sub_categories_customer_topic_id_fkey` FOREIGN KEY (`customer_topic_id`) REFERENCES `customer_topics`(`topic_id`) ON DELETE RESTRICT ON UPDATE CASCADE; 