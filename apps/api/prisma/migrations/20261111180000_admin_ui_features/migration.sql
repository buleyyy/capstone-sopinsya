-- ADITIF: fitur mockup Admin (Kelola Program, Hasil Evaluasi, Rating & Ulasan, Studi Kasus).
-- Hanya menambah kolom NULL/ber-default dan tabel baru; tidak mengubah atau menghapus data yang ada.

-- AlterTable: petunjuk pengerjaan & acak urutan soal
ALTER TABLE `Test` ADD COLUMN `instructions` TEXT NULL,
    ADD COLUMN `shuffleQuestions` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: data diri peserta tambahan & hapus dari rekap (soft delete)
ALTER TABLE `TestAttempt` ADD COLUMN `participantEmail` VARCHAR(160) NULL,
    ADD COLUMN `participantPosition` VARCHAR(120) NULL,
    ADD COLUMN `participantPhone` VARCHAR(30) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- AlterTable: sampul program
ALTER TABLE `TrainingProgram` ADD COLUMN `coverUrl` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `StoredFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purpose` VARCHAR(20) NOT NULL,
    `fileName` VARCHAR(200) NOT NULL,
    `contentType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StoredFile_purpose_idx`(`purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programId` INTEGER NOT NULL,
    `reviewerName` VARCHAR(120) NOT NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `clientRequestId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProgramReview_programId_isVisible_createdAt_idx`(`programId`, `isVisible`, `createdAt`),
    UNIQUE INDEX `ProgramReview_programId_clientRequestId_key`(`programId`, `clientRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseStudySubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programId` INTEGER NOT NULL,
    `meetingNo` INTEGER NOT NULL,
    `participantName` VARCHAR(120) NOT NULL,
    `participantInstitution` VARCHAR(160) NOT NULL,
    `participantEmail` VARCHAR(160) NULL,
    `fileId` INTEGER NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `CaseStudySubmission_programId_submittedAt_idx`(`programId`, `submittedAt`),
    INDEX `CaseStudySubmission_fileId_idx`(`fileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProgramReview` ADD CONSTRAINT `ProgramReview_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `TrainingProgram`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseStudySubmission` ADD CONSTRAINT `CaseStudySubmission_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `TrainingProgram`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseStudySubmission` ADD CONSTRAINT `CaseStudySubmission_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `StoredFile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
