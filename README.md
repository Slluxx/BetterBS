# BetterBS

**BetterBS** ist eine Browser-Erweiterung für Chrome/Chromium und Firefox, die Burning Series mit einem
frischen, modernen Interface versieht. Die veraltete Originalseite wird komplett durch eine neue
Oberfläche ersetzt und um viele Quality-of-Life-Funktionen erweitert.

## Funktionen

- **Komplett neues UI** – Vue 3 + Tailwind CSS + daisyUI, gerendert in einem Shadow DOM über der
  Originalseite (die Seite bleibt darunter verborgen).
- **Startseite** – Hero-Banner, Karussells für "Zuletzt angesehen", "Favoriten" und "Neueste Folgen"
  sowie eine Liste der neuesten Serien.
- **Serienseite** – Infokarte mit Cover, Beschreibung, Genres und Favoriten-Herz; Folgen-Übersicht
  mit Staffel-Auswahl, Sprachfilter, "Als gesehen"-Markierung und Hoster-Buttons.
- **Player** – eingebetteter Stream mit Sprach- und Hosterwahl, Zurück/Weiter-Navigation und
  eigenem Vollbild-Button (der auf dem iframe selbst läuft, damit blockierte Hoster-Vollbilder
  umgangen werden).
- **Suche** – Live-Suche mit Autovervollständigung überall.
- **Anmeldung** – Login/Logout mit Sitzungs-Erkennung und "Angemeldet bleiben".
- **Favoriten** – hinzufügen/entfernen über die API der Seite, synchron mit der Navigation.
- **Verlauf** – 2Zuletzt angesehen" listet die zuletzt gespielten Serien/Folgen auf der Startseite.
- **Neue-Folgen-Benachrichtigungen** – wird für Favoriten automatisch geprüft, ob eine neue Folge
  erschienen ist. Neue Folgen erscheinen als Banner unter der Kopfzeile mit einem Button pro Folge
  (inkl. einzelnem Entfernen-Button). Einzelne Folgen werden entfernt, sobald sie besucht oder
  manuell abgehakt werden. Ein einstellbarer Modus entscheidet, ob *jede* neue Folge meldet oder
  nur Serien, bei denen man auf dem neuesten Stand ist (kein Backlog-Spam).
- **Live-Chat** – Nachrichten überall lesen und schreiben (anmelden erforderlich zum
  Schreiben).
- **Storage über zwei Backends** – Daten werden synchron in `localStorage` und in
  `browser.storage.local` geschrieben. Ein Zeitstempel-Abgleich stellt sicher, dass beim Laden
  immer die neueste Kopie gewinnt – Daten überleben Reloads, Erweiterungs-Updates und den
  Wechsel zwischen den Burning-Series-Mirror-Domains.
- **Responsive** – die Oberfläche funktioniert auch auf kleinen Bildschirmen; das
  Desktop-Layout bleibt ab 1024px unverändert.
- **Deep-Links** – Serien/Folgen/Hoster bleiben per Hash-Routing als Link teilbar und werden beim
  Neuladen wiederhergestellt.

### Wichtig:

Das Extension läuft innerhalb der originalen Seite. Einige Daten werden gespeichert und oder an BS gesendet (favorit hinzugefügt, chat, ...). Es werden **niemals** daten an außenstehende geschickt oder irgendwie anders verwertet als für das Extension (nur lokal) selber. **Deine Daten sind und bleiben sicher.**

## Unterstützte Domains

Die Erweiterung läuft nur auf den offiziellen Burning-Series-Domains:
`burningseries.ac/.cx` und `bs.cine.to`.

## Technik

- **WXT** (Manifest-V3) als Framework
- **Vue 3** + **Pinia** (Stores) + **vue-router** (Hash-Routing)
- **Tailwind CSS 4** + **daisyUI 5**
- **vue3-carousel** für die Karussells
- TypeScript-Typchecks via `vue-tsc`

## Projektstruktur

```
entrypoints/          Erweiterungs-Einstiegspunkte
  content.ts          Injektion der Vue-App in die Seite (Shadow DOM)
  background.ts       Hintergrund-Service-Worker (u. a. reCAPTCHA in der Main-World der Seite)
utils/                Scraper, Extractors, Storage, Streamloader, UrlParse, Sanitize …
vue/
  components/         UI-Komponenten (Header, SearchBox, MediaCarousel, PlayerSection, …)
  pages/              App, Home, Show
  stores/             Pinia-Stores (site, session, settings, favorites, history, notifications, player)
  router.js           Hash-Router
```

## Entwicklung

Voraussetzung: Node.js mit npm.

```bash
npm install            # Abhängigkeiten installieren
npm run dev            # Chrome-Entwicklungsmodus starten
npm run dev:firefox    # Firefox-Entwicklungsmodus
```

## Build

```bash
npm run compile        # TypeScript/Vue-Typcheck (vue-tsc --noEmit)
npm run build          # Produktions-Build (Chrome) -> .output/chrome-mv3
npm run buildprod      # Produktions-Build mit Produktions-Modus
npm run build:firefox  # Firefox-Build
npm run zip            # Chrome-Zip erzeugen
npm run zip:firefox    # Firefox-Zip erzeugen
```
