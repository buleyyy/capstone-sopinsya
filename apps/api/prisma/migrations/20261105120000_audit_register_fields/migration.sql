-- Register temuan (desain modul Audit): data auditee, tanggal formulir, verifikasi, tautan bukti tindakan,
-- dan header formulir yang dapat diubah Auditor. Semua kolom baru opsional sehingga data lama tetap valid.
ALTER TABLE `Finding`
    ADD COLUMN `auditeeName` VARCHAR(160) NULL,
    ADD COLUMN `reportedDate` VARCHAR(10) NULL,
    ADD COLUMN `followedUpDate` VARCHAR(10) NULL,
    ADD COLUMN `verifiedDate` VARCHAR(10) NULL,
    ADD COLUMN `verifierName` VARCHAR(160) NULL,
    ADD COLUMN `verificationResult` TEXT NULL,
    ADD COLUMN `correctionEvidenceUrl` VARCHAR(1024) NULL,
    ADD COLUMN `correctiveActionEvidenceUrl` VARCHAR(1024) NULL;

-- CreateTable
CREATE TABLE `AuditDocumentHeader` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `organization` VARCHAR(160) NOT NULL,
    `subtitle` VARCHAR(200) NOT NULL,
    `formTitle` VARCHAR(200) NOT NULL,
    `formCode` VARCHAR(40) NOT NULL,
    `revision` VARCHAR(40) NOT NULL,
    `issuedAt` VARCHAR(40) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AuditDocumentHeader_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuditDocumentHeader` ADD CONSTRAINT `AuditDocumentHeader_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AuditSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
