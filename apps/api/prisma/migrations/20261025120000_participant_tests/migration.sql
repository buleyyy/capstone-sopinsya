-- Pre-test / Post-test peserta (dikerjakan langsung di website, bukan Google Form).
-- Ditulis manual mengikuti konvensi Prisma; jalankan `prisma migrate dev` untuk memverifikasi tidak ada drift.

-- CreateTable
CREATE TABLE `Test` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programSlug` VARCHAR(80) NOT NULL,
    `meetingNo` INTEGER NOT NULL,
    `type` ENUM('PRE', 'POST') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Test_programSlug_meetingNo_type_key`(`programSlug`, `meetingNo`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestQuestion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `testId` INTEGER NOT NULL,
    `orderNo` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `TestQuestion_testId_orderNo_idx`(`testId`, `orderNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestOption` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `questionId` INTEGER NOT NULL,
    `label` VARCHAR(1) NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `isCorrect` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `TestOption_questionId_label_key`(`questionId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestAttempt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `testId` INTEGER NOT NULL,
    `participantName` VARCHAR(120) NOT NULL,
    `participantInstitution` VARCHAR(160) NOT NULL,
    `clientRequestId` VARCHAR(64) NOT NULL,
    `correctCount` INTEGER NOT NULL,
    `totalQuestions` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TestAttempt_testId_submittedAt_idx`(`testId`, `submittedAt`),
    UNIQUE INDEX `TestAttempt_testId_clientRequestId_key`(`testId`, `clientRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestAttemptAnswer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attemptId` INTEGER NOT NULL,
    `questionId` INTEGER NOT NULL,
    `optionId` INTEGER NULL,
    `isCorrect` BOOLEAN NOT NULL,

    INDEX `TestAttemptAnswer_questionId_idx`(`questionId`),
    INDEX `TestAttemptAnswer_optionId_idx`(`optionId`),
    UNIQUE INDEX `TestAttemptAnswer_attemptId_questionId_key`(`attemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TestQuestion` ADD CONSTRAINT `TestQuestion_testId_fkey` FOREIGN KEY (`testId`) REFERENCES `Test`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestOption` ADD CONSTRAINT `TestOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `TestQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestAttempt` ADD CONSTRAINT `TestAttempt_testId_fkey` FOREIGN KEY (`testId`) REFERENCES `Test`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestAttemptAnswer` ADD CONSTRAINT `TestAttemptAnswer_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `TestAttempt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestAttemptAnswer` ADD CONSTRAINT `TestAttemptAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `TestQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TestAttemptAnswer` ADD CONSTRAINT `TestAttemptAnswer_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `TestOption`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
