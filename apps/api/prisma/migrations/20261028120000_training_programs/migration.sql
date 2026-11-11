-- Program pelatihan ISO beserta pertemuan dan sumber belajarnya. ADITIF: hanya tabel baru + data awal.
-- Tidak menyentuh MaterialCategory (13 kamar BNSP), TrainingResource, Test, maupun data audit.
-- Data awal = isi data statis web sebelumnya (apps/web/src/lib/programs.ts), sehingga situs peserta tetap terisi.
-- SOP dan Silabus sebelumnya kosong (url null) dan sengaja tidak dibuat; Admin menambahkannya dari halaman Program.

-- CreateTable
CREATE TABLE `TrainingProgram` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(80) NOT NULL,
    `code` VARCHAR(10) NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `fullTitle` VARCHAR(120) NOT NULL,
    `subtitle` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(300) NOT NULL,
    `description` TEXT NOT NULL,
    `duration` VARCHAR(40) NOT NULL,
    `mode` VARCHAR(40) NOT NULL,
    `trainer` VARCHAR(120) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `tone` VARCHAR(10) NOT NULL DEFAULT 'blue',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TrainingProgram_slug_key`(`slug`),
    INDEX `TrainingProgram_isPublished_sortOrder_idx`(`isPublished`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramMeeting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `programId` INTEGER NOT NULL,
    `number` INTEGER NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProgramMeeting_programId_isPublished_sortOrder_idx`(`programId`, `isPublished`, `sortOrder`),
    UNIQUE INDEX `ProgramMeeting_programId_number_key`(`programId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingResource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `meetingId` INTEGER NOT NULL,
    `type` ENUM('SOP', 'SYLLABUS', 'MATERIAL', 'CASE_STUDY', 'BLOOKET', 'VIDEO') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MeetingResource_meetingId_type_isPublished_sortOrder_idx`(`meetingId`, `type`, `isPublished`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProgramMeeting` ADD CONSTRAINT `ProgramMeeting_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `TrainingProgram`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingResource` ADD CONSTRAINT `MeetingResource_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `ProgramMeeting`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data awal: empat program ISO (terbit), dua pertemuan masing-masing, dan sumber belajar dari Linktree klien.
INSERT INTO `TrainingProgram` (`slug`, `code`, `title`, `fullTitle`, `subtitle`, `summary`, `description`, `duration`, `mode`, `trainer`, `category`, `tone`, `sortOrder`, `isPublished`, `updatedAt`) VALUES
('iso-9001', '01', 'ISO 9001', 'ISO 9001: 2015', 'Sistem Manajemen Mutu', 'Fokus pada kualitas proses dan kepuasan pelanggan.', 'Pelatihan ini membahas persyaratan sistem manajemen mutu, penerapannya pada proses kerja, serta cara mengevaluasi pemenuhan persyaratan secara berkala.', '3 Hari', 'Offline', 'Ahmad Fadillah', 'ISO 9001', 'blue', 1, true, CURRENT_TIMESTAMP(3)),
('iso-14001', '02', 'ISO 14001', 'ISO 14001: 2015', 'Sistem Manajemen Lingkungan', 'Pahami pengelolaan dampak lingkungan.', 'Pelatihan ini membahas pengelolaan aspek dan dampak lingkungan, kewajiban kepatuhan, serta penerapan sistem manajemen lingkungan di organisasi.', '3 Hari', 'Offline', 'Ahmad Fadillah', 'ISO 14001', 'teal', 2, true, CURRENT_TIMESTAMP(3)),
('iso-45001', '03', 'ISO 45001', 'ISO 45001: 2018', 'Kesehatan & Keselamatan Kerja', 'Bangun lingkungan kerja yang lebih aman.', 'Pelatihan ini membahas identifikasi bahaya, penilaian risiko, dan pengendalian operasional untuk membangun lingkungan kerja yang lebih aman.', '3 Hari', 'Offline', 'Ahmad Fadillah', 'ISO 45001', 'navy', 3, true, CURRENT_TIMESTAMP(3)),
('iso-37001', '04', 'ISO 37001', 'ISO 37001: 2025', 'Sistem Manajemen Anti Penyuapan', 'Kenali pendekatan pencegahan penyuapan.', 'Pelatihan ini membekali peserta dengan pemahaman Sistem Manajemen Anti Penyuapan (SMAP) berdasarkan ISO 37001, mulai dari konteks organisasi dan penilaian risiko penyuapan hingga pelaksanaan audit internal dan pencatatan temuan.', '3 Hari', 'Offline', 'Ahmad Fadillah', 'ISO 37001', 'navy', 4, true, CURRENT_TIMESTAMP(3));

INSERT INTO `ProgramMeeting` (`programId`, `number`, `title`, `sortOrder`, `isPublished`, `updatedAt`)
SELECT p.`id`, n.`number`, CONCAT('Pertemuan ', n.`number`), n.`number`, true, CURRENT_TIMESTAMP(3)
FROM `TrainingProgram` p
JOIN (SELECT 1 AS `number` UNION ALL SELECT 2) n;

INSERT INTO `MeetingResource` (`meetingId`, `type`, `title`, `url`, `sortOrder`, `isPublished`, `updatedAt`)
SELECT m.`id`, 'MATERIAL', CONCAT('Materi Pelatihan ', p.`title`), 'https://drive.google.com/drive/folders/1AmQvrqtKZ5GD_TvkCW9aId20lagPufvQ?usp=sharing', 0, true, CURRENT_TIMESTAMP(3)
FROM `ProgramMeeting` m JOIN `TrainingProgram` p ON p.`id` = m.`programId`;

INSERT INTO `MeetingResource` (`meetingId`, `type`, `title`, `url`, `sortOrder`, `isPublished`, `updatedAt`)
SELECT m.`id`, 'CASE_STUDY', CONCAT('Studi Kasus ', p.`title`), 'https://drive.google.com/drive/folders/1Ac4qtHwp29A3ULBYimJ8MGYmxrssGTFd?usp=sharing', 0, true, CURRENT_TIMESTAMP(3)
FROM `ProgramMeeting` m JOIN `TrainingProgram` p ON p.`id` = m.`programId`;

INSERT INTO `MeetingResource` (`meetingId`, `type`, `title`, `url`, `sortOrder`, `isPublished`, `updatedAt`)
SELECT m.`id`, 'BLOOKET', 'Kuis Blooket', 'https://play.blooket.com/play', 0, true, CURRENT_TIMESTAMP(3)
FROM `ProgramMeeting` m;

INSERT INTO `MeetingResource` (`meetingId`, `type`, `title`, `url`, `sortOrder`, `isPublished`, `updatedAt`)
SELECT m.`id`, 'VIDEO', 'Video 1', 'https://youtu.be/TxuysbLRnEk', 0, true, CURRENT_TIMESTAMP(3)
FROM `ProgramMeeting` m;
