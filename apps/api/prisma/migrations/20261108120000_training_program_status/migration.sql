-- ADITIF: menambah lifecycle Draft/Published/Archived ke TrainingProgram.
-- Tidak menghapus kolom isPublished (tetap disinkronkan oleh programService dari `status`,
-- isPublished = true <=> status = PUBLISHED) agar tidak ada migration destruktif dan tidak ada
-- baris lain yang bergantung pada kolom itu menjadi patah.

-- AlterTable
ALTER TABLE `TrainingProgram`
  ADD COLUMN `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT' AFTER `isPublished`;

-- Backfill dari data isPublished yang sudah ada (empat program seed sebelumnya isPublished = true).
UPDATE `TrainingProgram` SET `status` = IF(`isPublished` = 1, 'PUBLISHED', 'DRAFT');

-- CreateIndex
CREATE INDEX `TrainingProgram_status_sortOrder_idx` ON `TrainingProgram`(`status`, `sortOrder`);
