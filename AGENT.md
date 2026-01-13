# **Master-Konfiguration und Arbeitsanweisungen für SvelteKit**

Dieses Dokument definiert die verbindlichen Regeln, Prozesse und den Kontext für alle Interaktionen. Es dient als primäre Anweisungsgrundlage für die Entwicklung von SvelteKit-Webanwendungen.

## **1\. Primärer Arbeitsprozess: Der 5-Phasen-Prozess**

Jede Anfrage, die die Analyse, Erstellung oder Änderung von Code beinhaltet, **muss** streng nach dem folgenden 5-Phasen-Prozess abgearbeitet werden.

### **Phase 1: Problem-Definition und Analyse**

- **Verständnis sichern:** Das gemeldete Problem oder Ziel wird in eigenen Worten zusammengefasst, um das Verständnis zu validieren.
- **Kontext abfragen:** Alle potenziell fehlenden Informationen werden proaktiv über eine feste Checkliste angefordert:
  - Verwendete SvelteKit-Version (aus package.json).
  - Relevante Konfigurationsdateien (svelte.config.js, vite.config.js).
  - Der exakte Code der betroffenen Route, Komponente oder des Moduls.
  - Die vollständige Ausgabe von svelte-check und eslint für die betroffenen Dateien.

### **Phase 2: Entwicklung und Vorstellung von Lösungsvorschlägen**

- **Optionen erarbeiten:** Es werden intern **mindestens vier** konzeptionell unterschiedliche Lösungsansätze entwickelt. Diese müssen die Design-Prinzipien von Svelte (Reaktivität, Kapselung) und SvelteKit (Routing-, Data-Loading-Konventionen) berücksichtigen.
- **Vorschläge präsentieren:** Die vier Ansätze werden mit ihren jeweiligen Vor- und Nachteilen vorgestellt. Bewertungskriterien sind: Performance (SSR/CSR-Auswirkungen), Komplexität des State Managements, Wartbarkeit und Bundle-Size.
- **Empfehlung abgeben:** Eine begründete Empfehlung für den bevorzugten Ansatz wird ausgesprochen.

### **Phase 3: Detaillierte Implementierungsplanung**

- **Plan erstellen:** Nach der Wahl eines Ansatzes durch den User wird ein detaillierter Schritt-für-Schritt-Plan für die Umsetzung erstellt.
- **Auswirkungsanalyse:** Für jeden Schritt im Plan werden die genaue Änderung, der Grund und die erwarteten Auswirkungen auf die SvelteKit-Anwendung beschrieben (z.B. "Änderung der load-Funktion in Route /profile", "Erstellung einer neuen API-Route \+server.js für Form-Actions", "Anpassung des globalen Stores").

### **Phase 4: Schrittweise Implementierung mit Prüfung**

- **Sequenzielle Ausführung:** Der Plan wird exakt einen Schritt nach dem anderen ausgeführt.
- **Qualitäts-Gate nach jedem Schritt:** Nach jedem einzelnen Implementierungsschritt **muss** eine Verifikation mittels svelte-check und eslint \--fix für die geänderten Dateien durchgeführt werden. Falls Unit- oder E2E-Tests betroffen sind (Vitest, Playwright), wird auf deren notwendige Anpassung hingewiesen. Der nächste Schritt wird erst nach einem vollständig fehlerfreien Durchlauf dieser Tools begonnen.

### **Phase 5: Abschluss**

- **Präsentation des Ergebnisses:** Der finale, saubere Code wird präsentiert. Der Code wird in einer Form bereitgestellt, die für die direkte Verarbeitung durch die Jules-Plattform optimiert ist (z.B. als vollständige, kopierbare Codeblöcke pro zu ändernder Datei).
- **Zusammenfassung:** Die implementierte Lösung und das gelöste Problem werden abschließend zusammengefasst.

## **2\. SvelteKit-Entwicklungsprinzipien**

Zusätzlich zum Arbeitsprozess gelten folgende Entwicklungsprinzipien:

- **Tooling-Konformität:** Code muss stets konform mit svelte-check und den konfigurierten ESLint-Regeln sein. Diese Tools definieren den Mindeststandard für Code-Qualität.
- **Konvention vor Konfiguration:** Die Standard-Dateistruktur und die Konventionen von SvelteKit (z.B. für Routing, Layouts, API-Endpunkte) sind strikt einzuhalten.
- **Accessibility (A11Y):** Alle erstellten UI-Komponenten müssen den Web-Accessibility-Standards genügen. Die Regeln von eslint-plugin-svelte-a11y sind zu befolgen.
- **Performance by Design:** Lösungsansätze sollen SvelteKits Stärken für eine hohe Performance nutzen (z.B. Datenladen in \+page.server.js, um clientseitige Wasserfälle zu vermeiden; effizienter Einsatz von Stores).
- **Testabdeckung:** Für wiederverwendbare Funktionen oder komplexe Geschäftslogik wird die Erstellung von Unit-Tests mit Vitest empfohlen und im Implementierungsplan vorgesehen.

## **3\. Sicherheitsrichtlinie: Defensives Löschen**

Das Löschen von Code ist eine kritische Operation und unterliegt strengen Regeln:

- **Vermeidung prüfen:** Es wird immer zuerst geprüft, ob das Ziel ohne Löschen erreichbar ist.
- **Freigabe anfordern:** Falls das Löschen unumgänglich ist, werden der Grund und die vollen Konsequenzen detailliert erklärt.
- **Explizite Zustimmung:** Der User wird explizit um Zustimmung gefragt. Die Löschung erfolgt erst nach einer klaren Bestätigung.

## **4\. Allgemeine Verhaltensregeln**

- **Sprache:** Die Kommunikation erfolgt ausschließlich auf Deutsch.
- **Ton:** Der Stil ist reiner Klartext – direkt, bodenständig, in ganzen Sätzen und ohne Füllfragen.
- **Faktenbasis:** Antworten basieren nur auf gesicherten Fakten. Quellen werden genannt. Wissenslücken werden klar kommuniziert.
- **Fehlerkultur:** Bei Fehlern wird nicht entschuldigt, sondern direkt korrigiert.
- **Präzision:** Antworten sind kurz, präzise und haben eine hohe Informationsdichte.
- **Nutzerkontext:** Auf bereits bekannte Informationen des Users (Interessen, etc.) wird in den Antworten nicht erneut eingegangen.

## 5. Umgebung für UI-Verifizierung (Playwright)

Um die Zuverlässigkeit von automatisierten UI-Tests mit Playwright zu gewährleisten und die aufgetretenen Probleme zu vermeiden, sind folgende Konventionen zu beachten:

1.  **Playwright `webServer` Konfiguration verwenden:** Für jede Aufgabe, die eine UI-Verifizierung erfordert, **muss** Playwright so konfiguriert werden, dass es den Entwicklungsserver automatisch verwaltet.

    - **Aktion:** Erstellen oder bearbeiten Sie die Konfigurationsdatei `playwright.config.ts` im Stammverzeichnis.
    - **Inhalt:** Fügen Sie eine `webServer`-Konfiguration hinzu. Diese startet den `npm run dev`-Befehl, wartet, bis die URL erreichbar ist, und beendet den Server nach den Tests automatisch.
    - **Beispiel-Konfiguration:**

      ```typescript
      import { defineConfig } from "@playwright/test";

      export default defineConfig({
        webServer: {
          command: "npm run dev",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
        },
        testDir: "./tests/e2e", // Beispiel für Testverzeichnis
      });
      ```

2.  **Zuverlässige Installation mit `npm ci`:** In automatisierten Testläufen oder zur Sicherstellung einer konsistenten Umgebung sollte `npm ci` anstelle von `npm install` verwendet werden. Dies verhindert "zufällige" Fehler durch inkonsistente Abhängigkeiten.

3.  **Robuste Test-Skripte:**
    - Verwenden Sie `click()` auf ein Element, um den `:focus`-Zustand zu simulieren, anstatt sich auf `:hover` zu verlassen, da dies in Testumgebungen zuverlässiger ist.
    - Verwenden Sie `expect(locator).toBeVisible()` und andere Web-First-Assertions, um explizit auf das Erscheinen von Elementen zu warten, anstatt manuelle `waitForTimeout`-Verzögerungen zu nutzen.

## 6. Versionierung und automatisierte Releases

Das Projekt verwendet `semantic-release`, um den Release-Prozess vollständig zu automatisieren. Dies hat direkte Auswirkungen auf die Art und Weise, wie Commits erstellt werden müssen.

- **Automatisierter Prozess:** Bei jedem Push auf den `main`-Branch analysiert ein GitHub-Actions-Workflow die Commit-Nachrichten. Basierend auf diesen Nachrichten wird automatisch:

  - Die nächste Versionsnummer bestimmt (nach Semantic Versioning).
  - Die `package.json` und `package-lock.json` aktualisiert.
  - Ein `CHANGELOG.md` erstellt oder aktualisiert.
  - Ein neuer Git-Tag und ein GitHub-Release erstellt.

- **Verbindliche Commit-Konvention:** Damit dieser Automatismus funktioniert, **müssen alle Commits ausnahmslos** dem [Conventional Commits](https://www.conventionalcommits.org/)-Standard folgen. Der Agent ist dafür verantwortlich, diese Konvention bei jeder Code-Änderung anzuwenden.

- **Commit-Typen und ihre Auswirkungen:**

  - `feat`: Für neue Funktionalitäten. Führt zu einem **Minor**-Release (z.B. 1.2.3 -> 1.3.0).
  - `fix`: Für Fehlerbehebungen. Führt zu einem **Patch**-Release (z.B. 1.2.3 -> 1.2.4).
  - **Breaking Change:** Für Änderungen, die die Abwärtskompatibilität brechen. Dies wird durch einen `BREAKING CHANGE:`-Footer im Commit-Text signalisiert und führt zu einem **Major**-Release (z.B. 1.2.3 -> 2.0.0).
  - Andere Typen (`docs`, `chore`, `refactor`, `test`, etc.) führen zu **keinem** Release.

- **Beispiel für einen Commit:**

  ```
  feat: Implementierung der Benutzer-Authentifizierung via E-Mail

  Ermöglicht Benutzern das Erstellen eines Kontos und das Anmelden.
  ```

- **Beispiel für einen Breaking Change Commit:**

  ```
  refactor: Überarbeitung der API-Endpunkte für Konsistenz

  BREAKING CHANGE: Der Endpunkt `/api/user` wurde zu `/api/users` umbenannt.
  ```
