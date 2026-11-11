-- Fase 2: autentikasi berbasis akun database + penugasan sesi per akun + sesi tanpa Master Checklist.
-- Additive dan aman untuk data lama: tidak ada tabel/kolom yang dihapus; kolom undangan lama tetap ada.

-- CreateTable
CREATE TABLE `UserAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(160) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `role` ENUM('ADMIN', 'AUDITOR') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAccount_email_key`(`email`),
    INDEX `UserAccount_role_isActive_idx`(`role`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Auditor: tautan opsional ke akun (NULL = auditor lama hasil undangan).
ALTER TABLE `Auditor` ADD COLUMN `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Auditor_userId_idx` ON `Auditor`(`userId`);

-- CreateIndex (satu akun hanya sekali per sesi; NULL pada data lama tidak saling bentrok di MySQL)
CREATE UNIQUE INDEX `Auditor_sessionId_userId_key` ON `Auditor`(`sessionId`, `userId`);

-- AddForeignKey
ALTER TABLE `Auditor` ADD CONSTRAINT `Auditor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sesi tidak lagi wajib memakai Master Checklist (data lama tetap menunjuk versi yang sama).
ALTER TABLE `AuditSession` MODIFY `checklistVersionId` INTEGER NULL;
