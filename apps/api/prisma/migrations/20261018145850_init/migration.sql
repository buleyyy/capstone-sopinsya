-- CreateTable
CREATE TABLE `Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Department_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `MaterialCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SopDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(60) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `departmentId` INTEGER NULL,
    `pdfUrl` VARCHAR(1024) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `SopDocument_code_key`(`code`),
    INDEX `SopDocument_categoryId_isPublished_idx`(`categoryId`, `isPublished`),
    INDEX `SopDocument_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditStandard` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuditStandard_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistVersion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `standardId` INTEGER NOT NULL,
    `versionLabel` VARCHAR(40) NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `retiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChecklistVersion_standardId_versionLabel_key`(`standardId`, `versionLabel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `versionId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `sopId` INTEGER NULL,
    `criteria` TEXT NOT NULL,
    `reference` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ChecklistItem_versionId_departmentId_sortOrder_idx`(`versionId`, `departmentId`, `sortOrder`),
    INDEX `ChecklistItem_sopId_idx`(`sopId`),
    UNIQUE INDEX `ChecklistItem_id_departmentId_key`(`id`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(160) NOT NULL,
    `checklistVersionId` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `expiresAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `auditorAccessUntil` DATETIME(3) NULL,
    `findingSeq` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditSession_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `AuditSession_checklistVersionId_idx`(`checklistVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Auditor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `inviteHash` VARCHAR(64) NOT NULL,
    `inviteExpiresAt` DATETIME(3) NOT NULL,
    `claimedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `tokenHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Auditor_inviteHash_key`(`inviteHash`),
    UNIQUE INDEX `Auditor_tokenHash_key`(`tokenHash`),
    INDEX `Auditor_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `Auditor_id_sessionId_key`(`id`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditorExclusion` (
    `auditorId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditorExclusion_departmentId_idx`(`departmentId`),
    PRIMARY KEY (`auditorId`, `departmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `auditorId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditAssignment_auditorId_sessionId_idx`(`auditorId`, `sessionId`),
    INDEX `AuditAssignment_departmentId_idx`(`departmentId`),
    UNIQUE INDEX `AuditAssignment_sessionId_auditorId_departmentId_key`(`sessionId`, `auditorId`, `departmentId`),
    UNIQUE INDEX `AuditAssignment_id_departmentId_key`(`id`, `departmentId`),
    UNIQUE INDEX `AuditAssignment_id_sessionId_key`(`id`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistAnswer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignmentId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,
    `result` ENUM('YA', 'TIDAK') NULL,
    `note` TEXT NULL,
    `evidenceUrl` VARCHAR(1024) NULL,
    `itemSnapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChecklistAnswer_itemId_departmentId_idx`(`itemId`, `departmentId`),
    INDEX `ChecklistAnswer_assignmentId_result_idx`(`assignmentId`, `result`),
    UNIQUE INDEX `ChecklistAnswer_assignmentId_itemId_key`(`assignmentId`, `itemId`),
    UNIQUE INDEX `ChecklistAnswer_id_assignmentId_key`(`id`, `assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Finding` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `assignmentId` INTEGER NOT NULL,
    `answerId` INTEGER NULL,
    `seq` INTEGER NOT NULL,
    `clientRequestId` VARCHAR(64) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `classification` ENUM('MAJOR', 'MINOR', 'OBSERVASI') NOT NULL,
    `problem` TEXT NOT NULL,
    `location` TEXT NOT NULL,
    `objectiveEvidence` TEXT NOT NULL,
    `reference` TEXT NOT NULL,
    `note` TEXT NULL,
    `evidenceUrl` VARCHAR(1024) NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Finding_sessionId_status_idx`(`sessionId`, `status`),
    INDEX `Finding_assignmentId_idx`(`assignmentId`),
    INDEX `Finding_answerId_assignmentId_idx`(`answerId`, `assignmentId`),
    INDEX `Finding_classification_idx`(`classification`),
    UNIQUE INDEX `Finding_assignmentId_clientRequestId_key`(`assignmentId`, `clientRequestId`),
    UNIQUE INDEX `Finding_sessionId_seq_key`(`sessionId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FindingStatusHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `findingId` INTEGER NOT NULL,
    `fromStatus` ENUM('OPEN', 'CLOSED') NULL,
    `toStatus` ENUM('OPEN', 'CLOSED') NOT NULL,
    `changedByAuditorId` INTEGER NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FindingStatusHistory_findingId_createdAt_idx`(`findingId`, `createdAt`),
    INDEX `FindingStatusHistory_changedByAuditorId_idx`(`changedByAuditorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SopDocument` ADD CONSTRAINT `SopDocument_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `MaterialCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SopDocument` ADD CONSTRAINT `SopDocument_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistVersion` ADD CONSTRAINT `ChecklistVersion_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `AuditStandard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistItem` ADD CONSTRAINT `ChecklistItem_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ChecklistVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistItem` ADD CONSTRAINT `ChecklistItem_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistItem` ADD CONSTRAINT `ChecklistItem_sopId_fkey` FOREIGN KEY (`sopId`) REFERENCES `SopDocument`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditSession` ADD CONSTRAINT `AuditSession_checklistVersionId_fkey` FOREIGN KEY (`checklistVersionId`) REFERENCES `ChecklistVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auditor` ADD CONSTRAINT `Auditor_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AuditSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditorExclusion` ADD CONSTRAINT `AuditorExclusion_auditorId_fkey` FOREIGN KEY (`auditorId`) REFERENCES `Auditor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditorExclusion` ADD CONSTRAINT `AuditorExclusion_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditAssignment` ADD CONSTRAINT `AuditAssignment_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AuditSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditAssignment` ADD CONSTRAINT `AuditAssignment_auditorId_sessionId_fkey` FOREIGN KEY (`auditorId`, `sessionId`) REFERENCES `Auditor`(`id`, `sessionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditAssignment` ADD CONSTRAINT `AuditAssignment_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistAnswer` ADD CONSTRAINT `ChecklistAnswer_assignmentId_departmentId_fkey` FOREIGN KEY (`assignmentId`, `departmentId`) REFERENCES `AuditAssignment`(`id`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistAnswer` ADD CONSTRAINT `ChecklistAnswer_itemId_departmentId_fkey` FOREIGN KEY (`itemId`, `departmentId`) REFERENCES `ChecklistItem`(`id`, `departmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Finding` ADD CONSTRAINT `Finding_assignmentId_sessionId_fkey` FOREIGN KEY (`assignmentId`, `sessionId`) REFERENCES `AuditAssignment`(`id`, `sessionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Finding` ADD CONSTRAINT `Finding_answerId_assignmentId_fkey` FOREIGN KEY (`answerId`, `assignmentId`) REFERENCES `ChecklistAnswer`(`id`, `assignmentId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FindingStatusHistory` ADD CONSTRAINT `FindingStatusHistory_findingId_fkey` FOREIGN KEY (`findingId`) REFERENCES `Finding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FindingStatusHistory` ADD CONSTRAINT `FindingStatusHistory_changedByAuditorId_fkey` FOREIGN KEY (`changedByAuditorId`) REFERENCES `Auditor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
