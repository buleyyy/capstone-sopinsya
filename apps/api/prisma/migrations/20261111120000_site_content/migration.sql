-- ADITIF: tabel baru untuk konten situs yang dapat diedit Admin (mis. key "about" = halaman Tentang Kami).
-- Tidak mengubah atau menghapus tabel lain.

-- CreateTable
CREATE TABLE `SiteContent` (
  `key` VARCHAR(60) NOT NULL,
  `value` JSON NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
