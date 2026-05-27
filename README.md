# VCMS Mitgliederverwaltung

## Entwicklung starten

```bash
npm install
npx prisma generate
npm run dev
```

Die Anwendung läuft danach standardmäßig unter [http://localhost:3000](http://localhost:3000).

## Datenbank / Prisma

Für die neuen Rundmail-Tabellen muss das aktualisierte Prisma-Schema in die Datenbank übernommen werden.

```bash
npx prisma generate
npx prisma db push
```

Wenn ihr stattdessen Migrationen verwendet, ersetzt `db push` entsprechend durch euren üblichen Migrations-Workflow.

## Rundmail

Die neue Seite ist unter `/rundmail` erreichbar.

Funktionen:

- Filterbox analog zur Mitgliederliste (Gruppe, Status, Hausvereinsmitglied)
- zusätzliches Ausschlussfeld per RegEx, z. B. für Dummy-Adressen
- Betreff, Inhalt und mehrere Anhänge
- Versand an einzelne Empfänger
- Speicherung des Versands in neuen Rundmail-Tabellen
- optionaler PDF-Download des Versandprotokolls nach dem Versand

### Benötigte Environment-Variablen

Für Berechtigung und Versand werden zusätzlich zu den bestehenden Keycloak-/NextAuth-Variablen folgende Werte benötigt:

```env
RUNDMAIL_ROLES=rolle-a;rolle-b;rolle-c
Custom_Corporation=Meine_Verbindung
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smtp-user
SMTP_PASS=smtp-passwort
SMTP_FROM=VCMS <noreply@example.org>
# optional
RUNDMAIL_ATTACHMENT_DIR=/pfad/zu/rundmail-attachments
```

Hinweise:

- `RUNDMAIL_ROLES` akzeptiert mehrere Rollen; Trennung per Semikolon.
- `Custom_Corporation` steuert den sichtbaren Absendernamen im Format `Custom_Corporation im Auftrag von Vorname Nachname`.
- Eine Rundmail darf nur von Benutzern mit mindestens einer der konfigurierten Rollen versendet bzw. als PDF geladen werden.
- `RUNDMAIL_ATTACHMENT_DIR` ist optional. Ohne Angabe werden Anhänge unter `var/rundmail-attachments` im Projekt gespeichert.

## Qualitätssicherung

Vor dem Commit wurden folgende Prüfungen erfolgreich ausgeführt:

```bash
npx prisma generate
npx tsc --noEmit
npm run lint
```
