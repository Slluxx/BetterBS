# 🔥 BetterBS

**Ein komplett neues, modernes Gesicht für Burning Series.**

Müde von der alten, klobigen BS-Oberfläche? BetterBS ersetzt sie durch ein schnelles,
aufgeräumtes Interface — mit allem, was ihr euch schon immer gewünscht habt: automatische
Benachrichtigungen bei neuen Folgen, ein Verlauf, der wirklich funktioniert, und einen Player,
der einfach nicht nervt. Installieren, fertig. 🎉

</br>
<p align="center">
  <a href="https://chromewebstore.google.com/detail/fhhfodhjkllgbgnhppeiegpfafibfegb"><img src="https://img.shields.io/badge/Chrome-Jetzt%20installieren-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Für Chrome installieren"></a>
  <a href="https://addons.mozilla.org/de/firefox/addon/betterbs/"><img src="https://img.shields.io/badge/Firefox-Jetzt%20installieren-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Für Firefox installieren"></a>
  <br>
  <img src="https://img.shields.io/chrome-web-store/v/fhhfodhjkllgbgnhppeiegpfafibfegb?style=flat-square" alt="Chrome Web Store Version">
  <img src="https://img.shields.io/amo/v/%40betterbs?style=flat-square" alt="Mozilla Add-on Version">
</p>

</br>

> 🔒 **Deine Daten bleiben deine Daten.** BetterBS läuft komplett lokal in deinem Browser.
> Es werden niemals Daten an Dritte gesendet — alles bleibt zwischen dir und BS.
</br>


<img src="https://i.imgur.com/1cP79zU.jpeg"/>


---

## ✨ Was BetterBS besser macht

| | |
|---|---|
| 🎨 **Frisches Design** | Keine überladene, altbackene Seite mehr — alles neu, aufgeräumt und schnell. |
| 🏠 **Bessere Startseite** | Zuletzt angesehen, Favoriten und neueste Folgen auf einen Blick. |
| 🔔 **Benachrichtigungen** | Wird automatisch benachrichtigt, sobald eine neue Folge deiner Favoriten online ist. |
| ▶️ **Angenehmer Player** | Sprach- und Hosterauswahl, Vorwärts/Zurück-Navigation, echtes Vollbild ohne Ärger. |
| 🔍 **Live-Suche** | Tippen, Vorschläge sehen, klicken — überall in der App verfügbar. |
| ❤️ **Favoriten & Verlauf** | Nie wieder die Folge verlieren, bei der man aufgehört hat. |
| 💬 **Live-Chat** | Direkt eingebaut, ohne die Seite zu verlassen. |
| 📱 **Funktioniert überall** | Vom großen Monitor bis zum kleinen Laptop-Fenster. |



## 🌐 Unterstützte Seiten

BetterBS funktioniert auf den offiziellen Burning-Series-Domains:
**burningseries.ac**, **burningseries.cx** und **bs.cine.to**

---

<details>
<summary>🛠️ Technische Details (für Entwickler)</summary>

### Technik

- **WXT** (Manifest V3) als Framework
- **Vue 3** + **Pinia** (Stores) + **vue-router** (Hash-Routing)
- **Tailwind CSS 4** + **daisyUI 5**
- **vue3-carousel** für die Karussells
- TypeScript-Typchecks via `vue-tsc`

### Wie es funktioniert

Die Erweiterung rendert eine komplette Vue-App in einem Shadow DOM über der Originalseite
(die darunter verborgen bleibt). Storage läuft parallel über `localStorage` und
`browser.storage.local` mit Zeitstempel-Abgleich — Daten überleben Reloads, Updates und
den Wechsel zwischen den BS-Mirror-Domains.

### Projektstruktur

### Entwicklung

```bash
npm install            # Abhängigkeiten installieren
npm run dev            # Chrome-Entwicklungsmodus starten
npm run dev:firefox    # Firefox-Entwicklungsmodus
```

### Build

```bash
npm run compile        # TypeScript/Vue-Typcheck (vue-tsc --noEmit)
npm run build          # Produktions-Build (Chrome) -> .output/chrome-mv3
npm run buildprod      # Produktions-Build mit Produktions-Modus
npm run build:firefox  # Firefox-Build
npm run zip            # Chrome-Zip erzeugen
npm run zip:firefox    # Firefox-Zip erzeugen
```

</details>