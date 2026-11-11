-- Hapus lunak temuan dan tautan bukti tindakan peningkatan (Observasi).
-- Hanya menambah kolom opsional; data lama tetap valid dan tidak diubah.
-- deletedByAuditorId sengaja bukan foreign key: jejak penghapus tetap ada walau penugasan auditor dicabut.
ALTER TABLE `Finding`
    ADD COLUMN `improvementEvidenceUrl` VARCHAR(1024) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedByAuditorId` INTEGER NULL;
