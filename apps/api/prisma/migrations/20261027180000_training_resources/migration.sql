-- Add program resources for video, Blooket, case study, and syllabus links.
-- Existing program and document data is preserved.
CREATE TABLE `TrainingResource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoryId` INTEGER NOT NULL,
    `type` ENUM('VIDEO', 'BLOOKET', 'CASE_STUDY', 'SYLLABUS') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `TrainingResource_categoryId_isPublished_sortOrder_idx`(`categoryId`, `isPublished`, `sortOrder`),
    PRIMARY KEY (`id`),
    CONSTRAINT `TrainingResource_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `MaterialCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
