CREATE TABLE `TrainingResource` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `programSlug` VARCHAR(80) NOT NULL,
  `meetingNo` INTEGER NOT NULL,
  `type` ENUM('SILABUS', 'MATERI', 'STUDI_KASUS', 'VIDEO', 'BLOOKET', 'LINK_LAIN') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `url` VARCHAR(1024) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isPublished` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `TrainingResource_programSlug_meetingNo_isPublished_sortOrder_idx` (`programSlug`, `meetingNo`, `isPublished`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;