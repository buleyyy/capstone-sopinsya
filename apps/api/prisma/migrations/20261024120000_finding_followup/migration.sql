-- Tindak lanjut temuan (Laporan Ketidaksesuaian dan Tindakan Korektif). Semua kolom opsional.
ALTER TABLE `Finding`
    ADD COLUMN `rootCause` TEXT NULL,
    ADD COLUMN `correction` TEXT NULL,
    ADD COLUMN `correctionPic` VARCHAR(160) NULL,
    ADD COLUMN `correctionTarget` VARCHAR(80) NULL,
    ADD COLUMN `correctiveAction` TEXT NULL,
    ADD COLUMN `correctiveActionPic` VARCHAR(160) NULL,
    ADD COLUMN `correctiveActionTarget` VARCHAR(80) NULL,
    ADD COLUMN `improvementAction` TEXT NULL,
    ADD COLUMN `improvementPic` VARCHAR(160) NULL,
    ADD COLUMN `improvementTarget` VARCHAR(80) NULL;
