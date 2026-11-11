-- Berkas bukti yang diunggah Auditor (foto, PDF, Excel/Word), disimpan di database.
-- Tabel baru, tidak mengubah data yang sudah ada.
CREATE TABLE `AuditEvidenceFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `fileName` VARCHAR(200) NOT NULL,
    `contentType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvidenceFile_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuditEvidenceFile` ADD CONSTRAINT `AuditEvidenceFile_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AuditSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
