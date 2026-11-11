-- Akun Auditor individual (email + hash kata sandi). Menggantikan mekanisme undangan/token.
-- NON-DESTRUKTIF: hanya menambah tabel/kolom/indeks dan melonggarkan dua kolom lama menjadi NULL.
-- Tidak ada DROP, TRUNCATE, atau perubahan data. Kolom lama (inviteHash, inviteExpiresAt, claimedAt, tokenHash)
-- dipertahankan dan tidak lagi dibaca/ditulis aplikasi; hapus lewat migrasi terpisah setelah disetujui.

-- CreateTable
CREATE TABLE `AuditorAccount` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(160) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AuditorAccount_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: keanggotaan Auditor menaut ke akun; baris lama tetap utuh dengan accountId NULL.
-- inviteHash/inviteExpiresAt dilonggarkan agar keanggotaan baru tidak perlu mengisinya.
ALTER TABLE `Auditor`
    ADD COLUMN `accountId` INTEGER NULL,
    MODIFY `inviteHash` VARCHAR(64) NULL,
    MODIFY `inviteExpiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Auditor_accountId_idx` ON `Auditor`(`accountId`);

-- CreateIndex: satu akun hanya sekali per sesi (NULL pada baris lama tidak saling bentrok di MySQL).
CREATE UNIQUE INDEX `Auditor_sessionId_accountId_key` ON `Auditor`(`sessionId`, `accountId`);

-- AddForeignKey
ALTER TABLE `Auditor` ADD CONSTRAINT `Auditor_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `AuditorAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
