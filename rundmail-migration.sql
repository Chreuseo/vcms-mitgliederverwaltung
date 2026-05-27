-- Rundmail-Tabellen SQL-Statements für MySQL/MariaDB
-- Führe diese Statements nacheinander in deiner Fremddatenbank aus
-- Lösung für FK-Fehler 1005/150: Foreign Keys separat hinzufügen

-- SCHRITT 1: Foreign Keys temporär deaktivieren
SET FOREIGN_KEY_CHECKS = 0;

-- SCHRITT 2: Tabelle 1: Rundmail (Haupttabelle für Versände)
CREATE TABLE IF NOT EXISTS `rundmail` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `senderKeycloakId` VARCHAR(190),
  `senderEmail` VARCHAR(255),
  `senderName` VARCHAR(255),
  `senderUsername` VARCHAR(255),
  `subject` VARCHAR(255) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `excludeRegex` VARCHAR(500),
  `skipPdfDownload` BOOLEAN NOT NULL DEFAULT false,
  INDEX `createdAt_idx` (`createdAt`),
  INDEX `senderKeycloakId_idx` (`senderKeycloakId`)
) ENGINE=InnoDB;

-- SCHRITT 3: Tabelle 2: RundmailAttachment (deduplizierte Anhänge per SHA256)
CREATE TABLE IF NOT EXISTS `rundmail_attachment` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sha256` VARCHAR(64) NOT NULL UNIQUE,
  `storagePath` VARCHAR(500) NOT NULL UNIQUE,
  `mimeType` VARCHAR(255),
  `size` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `sha256_idx` (`sha256`),
  INDEX `createdAt_idx` (`createdAt`)
) ENGINE=InnoDB;

-- SCHRITT 4: Tabelle 3: RundmailRecipient (OHNE Foreign Keys initially)
CREATE TABLE IF NOT EXISTS `rundmail_recipient` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `rundmailId` INT NOT NULL,
  `personId` INT NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `recipientName` VARCHAR(255),
  `deliveryStatus` VARCHAR(32) NOT NULL DEFAULT 'sent',
  `errorMessage` VARCHAR(1000),
  `sentAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `rundmailId_idx` (`rundmailId`),
  INDEX `personId_idx` (`personId`)
) ENGINE=InnoDB;

-- SCHRITT 5: Tabelle 4: RundmailMailAttachment (OHNE Foreign Keys initially)
CREATE TABLE IF NOT EXISTS `rundmail_mail_attachment` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `rundmailId` INT NOT NULL,
  `attachmentId` INT NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `rundmailId_idx` (`rundmailId`),
  INDEX `attachmentId_idx` (`attachmentId`),
  UNIQUE KEY `unique_rundmail_attachment_filename` (`rundmailId`, `attachmentId`, `fileName`)
) ENGINE=InnoDB;

-- SCHRITT 6: Foreign Keys hinzufügen (nachdem alle Tabellen existieren)
ALTER TABLE `rundmail_recipient`
  ADD CONSTRAINT `rundmail_recipient_rundmailId_fk`
    FOREIGN KEY (`rundmailId`) REFERENCES `rundmail`(`id`) ON DELETE CASCADE;

ALTER TABLE `rundmail_recipient`
  ADD CONSTRAINT `rundmail_recipient_personId_fk`
    FOREIGN KEY (`personId`) REFERENCES `base_person`(`id`) ON DELETE RESTRICT;

ALTER TABLE `rundmail_mail_attachment`
  ADD CONSTRAINT `rundmail_mail_attachment_rundmailId_fk`
    FOREIGN KEY (`rundmailId`) REFERENCES `rundmail`(`id`) ON DELETE CASCADE;

ALTER TABLE `rundmail_mail_attachment`
  ADD CONSTRAINT `rundmail_mail_attachment_attachmentId_fk`
    FOREIGN KEY (`attachmentId`) REFERENCES `rundmail_attachment`(`id`) ON DELETE RESTRICT;

-- SCHRITT 7: Foreign Keys wieder aktivieren
SET FOREIGN_KEY_CHECKS = 1;

-- Fertig. Tabellen sind jetzt einsatzbereit.



