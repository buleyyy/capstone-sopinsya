ALTER TABLE `TrainingResource`
  DROP FOREIGN KEY `TrainingResource_categoryId_fkey`,
  DROP INDEX `TrainingResource_categoryId_isPublished_sortOrder_idx`,
  DROP COLUMN `categoryId`,
  ADD COLUMN `programSlug` VARCHAR(80) NOT NULL AFTER `id`,
  ADD COLUMN `meetingNo` INTEGER NOT NULL AFTER `programSlug`,
  MODIFY COLUMN `type` ENUM(
    'SILABUS',
    'MATERI',
    'STUDI_KASUS',
    'VIDEO',
    'BLOOKET',
    'LINK_LAIN'
  ) NOT NULL,
  MODIFY COLUMN `title` VARCHAR(160) NOT NULL,
  ADD INDEX `TrainingResource_programSlug_meetingNo_isPublished_sortOrder_idx`
    (`programSlug`, `meetingNo`, `isPublished`, `sortOrder`);