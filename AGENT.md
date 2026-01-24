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

1. **Playwright `webServer` Konfiguration verwenden:** Für jede Aufgabe, die eine UI-Verifizierung erfordert, **muss** Playwright so konfiguriert werden, dass es den Entwicklungsserver automatisch verwaltet.
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

2. **Zuverlässige Installation mit `npm ci`:** In automatisierten Testläufen oder zur Sicherstellung einer konsistenten Umgebung sollte `npm ci` anstelle von `npm install` verwendet werden. Dies verhindert "zufällige" Fehler durch inkonsistente Abhängigkeiten.

3. **Robuste Test-Skripte:**
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

# General development conventions

- NEVER make changes the user hasn't asked for without checking.
- Please modify files as minimally as possible to accomplish the task.
- Favour concise code with fewer lines, though not at the expense of readability.
- Make liberal use of debug statements with clear labels (e.g., `console.log('Processing data:', data)`) that identify location and context.
- Don't try to do too many things at once.
- Fix one thing at a time and test the code between every change.
- Build functionality in small steps, testing in between.
- Prototype with libraries to get them working before integrating them.
- Match the existing code style, naming conventions, and patterns unless specifically asked to change them.
- Think like you're making a clean git commit - changes should be focused, related, and minimal.
- Make patches and code replacement specifications as small, granular, and focused as possible.
- Restrict your changes to ONLY what was asked for. Ask before going beyond what was instructed.
- Don't make superfluous changes, whitespace changes, or changes to code that don't relate to the current goal.
- Do not add trailing whitespace to the end of lines. Maintain consistent indentation and line endings.
- Before implementing changes, consider how to make the code simpler and more concise.
- Break long lines of code at 80 characters.
- Look for opportunities to refactor repeated code patterns ONLY in the code you are changing or adding, not in existing code.
- Prefer built-ins to library calls wherever possible.
- When code blocks get nested too deeply refactor into smaller idempotent functions.
- Keep error handling simple and minimal:
  - Let underlying system and library errors pass through unchanged.
  - Don't catch and re-throw with new messages unless absolutely necessary.
  - Only add new error handling for logic in the code being modified.
  - Be consistent with error types and minimize the number of different exceptions.
  - Only handle the most essential errors relevant to the codebase.
- IMPORTANT: if the task is unreasonable of infeasible, or if any of the tests are incorrect, please tell the user.
- Do not hard-code any test cases. Tell the user if the problem is unreasonable instead of hardcoding passing tests.
- Never clean up any code unless the user asks you to.
- Favour small, functional, idempotent and immutable components.
- Decomplect. Break things out into smaller functions each with a single purpose.
- Just because you changed the code it doesn't mean the bug is fixed. Rely on empirical evidence and don't assume.
- Keep existing comments unless asked to modify them.
- Don't forget to chmod +x files you create that are intended to be run.

The user is a detail-oriented anal-retentive control freak. Only do things they specifically ask you to do.

# Modifying code

- Use the quoted code as the source of truth about the current state of the code in a file.
- Do not assume your previous patches have been applied.
- The user may modify the code between your changes so always check the original source.

# Debugging process

- Examine the program output or test output and the source code.
- Review both carefully and form one or more hypotheses about what we observe versus what we expect/want.
- Come up with debugging statements or other methods can we use to test the hypotheses.
- Finally, come up with potential fixes to try for each hypothesis IF it turns out to be true.

If the user asks you to follow "debugging process", perform the steps above and give answers in plain english.
When following the "debugging process" don't change any code until asked.

# --- DEBUGGING (CRITICAL RULES) ---

- Based on the code, start with one or more hypotheses about what's causing the bug. Do not jump to conclusions.
- If there is a test suite add one or more test cases that replicate the bug.
- Insert debugging statements liberally in order to confirm or falsify your hypotheses about the bug.
- Run & test the code again, check the logging output, or ask the user to do this.
- Iterate until you are sure you know how to fix the bug.
- Only once you know the cause of the bug should you issue a patch to fix it.
- Run the test cases, or ask the user to verify the bug is fixed.

## PRESERVING LOGS IS MANDATORY

This is a strict, non-negotiable rule.

1. **ALWAYS** keep all debugging and `console.log` statements that are added during the debugging process.
2. **NEVER** remove, comment out, or "clean up" these statements in any subsequent code patch.
3. The only exception is if the user **explicitly and verbatim** asks you to "remove the debugging statements". Do not infer this request.
4. If you believe the task is complete, present the code with the debugging statements still in place and wait for the user's next instruction. Do not move on to a "cleanup" step.

# Comment guidelines

- DO NOT add comments that explain changes made (like '// added x'). Comments should only explain what the code does.
- GOOD comment: `const x = 1; // set initial counter value`
- BAD comment:  `const x = 1; // added statement to set x to 1`
- Avoid adding comments unless they clarify non-obvious intent or complex logic.
- Do not add superfluous or verbose comments.

# Markdown style

- Always add one empty line after headings.

# Command line tools

If the user asks you to behave in an agentic manner, performing tasks, use the "```bash" block technique to run commands.

- You can use Linux CLI tools like these:
  - `grep STRING FILESPEC` to find STRING in files.
  - `cat FILE` to get a file's contents.
  - `echo "" > FILE` to zero out a file (useful for overwriting).
  - `ls PATH` to list files on a path.
  - `tree PATH` to display a tree of files.
  - `curl URL` to see the contents of a URL.
  - And you can call other Linux commands too like `find`.

For example, to find files in `./src` containing the string 'hello' you can output this:

```bash
rgrep src 'hello'
```

The user will then run this code and give you the response. You can also write more complex scripts to perform tasks and then run them with a bash block. Generally store these in `./bin`. NEVER split one-liners over multiple lines with a backslash ("\") as they won't be parsed correctly.

# Communication style

- The user is a senior software developer.
- You DO NOT need to tell the user (unless asked):
  - How to open index.html in the browser.
  - How to run a webserver to serve HTML.
  - To run the dev server.
  - To run `make watch`.

# Reporting outputs

A good general information heirarchy you should should use in Markdown reports and other outputs, is to show easy to read summary lists at the start and then more detailed content below.

# Common bugs to avoid

- You can't put comments in JSON importmaps.
- Avoid the string "data" with a colon directly after it. Assemble this string if you need it.
- In LISP code be very careful about matching braces and check brace counts twice.
- Don't name vars after built-ins like 'val'.

# STRONGLY FAVOURED PARADIGMS

- Immutability
- Idempotency
- Functional programming
- DRY
- Single source of truth
- Minimal deps
- YAGNI
- Under-engineering
- Root-cause fixes
- KISS
- Epistemic humility 👈️
