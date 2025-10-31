// Zentrale Konstanten & Typen für Mitglieder-Verwaltung
// Vermeidet Redundanz zwischen API-Routen und UI-Komponenten

export const ALL_FIELDS = [
  "id","anrede","titel","rang","vorname","praefix","name","suffix","geburtsname","zusatz1","strasse1","ort1","plz1","land1","telefon1","datum_adresse1_stand","zusatz2","strasse2","ort2","plz2","land2","telefon2","datum_adresse2_stand","region1","region2","mobiltelefon","email","skype","webseite","datum_geburtstag","beruf","heirat_partner","heirat_datum","tod_datum","tod_ort","gruppe","datum_gruppe_stand","status","semester_reception","semester_promotion","semester_philistrierung","semester_aufnahme","semester_fusion","austritt_datum","spitzname","leibmitglied","anschreiben_zusenden","spendenquittung_zusenden","vita","bemerkung","password_hash","validationkey","keycloak_id","hausvereinsmitglied"
] as const;

export type Field = typeof ALL_FIELDS[number];

// Standardspalten für Listenansicht
export const DEFAULT_LIST_FIELDS: Field[] = ["id","vorname","name","strasse1","plz1","ort1","datum_geburtstag","email"];

// Standardfelder für Edit-Ansicht
export const DEFAULT_EDIT_FIELDS: string[] = [
  "vorname","name","email","strasse1","plz1","ort1","telefon1","mobiltelefon","datum_geburtstag","gruppe","status","hausvereinsmitglied","semester_reception","semester_promotion","semester_philistrierung","semester_aufnahme"
];

export const DATE_FIELDS = new Set<string>([
  "datum_adresse1_stand","datum_adresse2_stand","datum_geburtstag","heirat_datum","tod_datum","datum_gruppe_stand","austritt_datum"
]);

export const BOOLEAN_FIELDS = new Set<string>([
  "anschreiben_zusenden","spendenquittung_zusenden","hausvereinsmitglied"
]);

export const INT_FIELDS = new Set<string>([
  "region1","region2","heirat_partner"
]);

// Editierbare Felder (id & leibmitglied ausgeschlossen)
export const EDITABLE_FIELDS: readonly Field[] = ALL_FIELDS.filter(f => f !== "id" && f !== "leibmitglied") as Field[];

// Labels für UI (nur Abweichungen / verkürzte Titel)
export const FIELD_LABELS: Record<string,string> = {
  name: "Name (Nachname)",
  vorname: "Vorname",
  zusatz1: "Adresszusatz",
  datum_geburtstag: "Geburtstag",
  datum_adresse1_stand: "Adr1 Stand",
  datum_adresse2_stand: "Adr2 Stand",
  datum_gruppe_stand: "Gruppe Stand",
  anschreiben_zusenden: "Anschreiben",
  spendenquittung_zusenden: "Spendenquittung",
  hausvereinsmitglied: "Hausverein",
};
