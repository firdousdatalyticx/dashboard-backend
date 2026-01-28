-- Migration: add video tracking tables (non-destructive)
-- This migration ONLY ADDS new tables + foreign keys + indexes.
-- It does not modify or drop existing data.

CREATE TABLE IF NOT EXISTS `video_analyses` (
  `video_analysis_id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `video_url` TEXT NULL,
  `video_file_path` TEXT NULL,
  `video_type` VARCHAR(10) NOT NULL COMMENT 'url or file',
  `video_metadata` JSON NULL,
  `chat_id` VARCHAR(255) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`video_analysis_id`),
  KEY `idx_video_analyses_customer_id` (`customer_id`),
  KEY `idx_video_analyses_created_at` (`created_at`),
  CONSTRAINT `fk_video_analyses_customer_id`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `video_chat_messages` (
  `message_id` INT NOT NULL AUTO_INCREMENT,
  `video_analysis_id` INT NOT NULL,
  `message` TEXT NOT NULL,
  `response` TEXT NULL,
  `is_user_message` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=user, 0=AI',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_video_chat_messages_video_analysis_id` (`video_analysis_id`),
  KEY `idx_video_chat_messages_created_at` (`created_at`),
  CONSTRAINT `fk_video_chat_messages_video_analysis_id`
    FOREIGN KEY (`video_analysis_id`) REFERENCES `video_analyses` (`video_analysis_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

