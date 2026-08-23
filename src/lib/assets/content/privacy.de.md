# Datenschutzerklärung

**Stand:** 2026

Wir bei Cachy nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Diese Datenschutzerklärung informiert Sie darüber, wie wir mit Ihren Daten umgehen, wenn Sie unsere Anwendung nutzen.

## 1. Verantwortliche Stelle

Bei Fragen zum Datenschutz wenden Sie sich bitte an:
**E-Mail:** feedback@cachy.app

## 2. Datenspeicherung

**Lokaler Speicher (Local Storage):**
Cachy ist als "Local-First"-Anwendung konzipiert. Der Großteil Ihrer Daten, einschließlich Handelshistorie, Einstellungen und Journaleinträgen, wird lokal auf Ihrem Endgerät im "Local Storage" Ihres Browsers gespeichert. Diese Daten verbleiben auf Ihrem Gerät und werden nicht zur dauerhaften Speicherung an unsere Server gesendet.

**Backup & Wiederherstellung:**
Sie haben die Möglichkeit, Backups Ihrer Daten zu erstellen. Dabei handelt es sich um JSON-Dateien, die auf Ihrem Gerät generiert werden. Sie sind selbst für die sichere Aufbewahrung dieser Dateien verantwortlich.

## 3. Externe Dienste & Schnittstellen (APIs)

Um Marktdaten und Funktionen bereitzustellen, interagiert die App mit folgenden externen Diensten:

- **Bitunix & Bitget:** Wir rufen Echtzeit-Marktdaten (Preise, Finanzierungsraten usw.) von diesen Börsen ab. Obwohl einige Anfragen über unsere Server geleitet werden (Proxy), speichern wir Ihre API-Schlüssel nicht auf unseren Servern. In den Einstellungen hinterlegte API-Schlüssel werden ausschließlich im Local Storage Ihres Browsers gespeichert.
- **ImgBB:** Wenn Sie Screenshots für Ihre Journaleinträge hochladen, werden diese Bilder an ImgBB gesendet. Bitte beachten Sie hierzu die Datenschutzbestimmungen von ImgBB.

## 4. Tracking & Analyse

**Matomo (strikt Opt-in):**
Wir nutzen Matomo für eine datenschutzfreundliche Analyse der App-Nutzung, um unser Angebot zu verbessern. Telemetrie ist **standardmäßig deaktiviert**: Es wird kein Analyse-Skript geladen und keine Daten gesendet, solange Sie „Nutzungsstatistiken" nicht ausdrücklich unter Einstellungen → System → Performance aktivieren. Da vor Ihrer Zustimmung nichts getrackt wird, zeigen wir keinen Cookie-Hinweis.

Bei Aktivierung gilt:

- Es werden anonyme Nutzungsereignisse erhoben (Theme, Marktdaten-Anbieter, Viewport, App-Version – nicht die von Ihnen betrachteten Symbole, nicht Ihr Journal, Ihre Einstellungen oder API-Schlüssel).
- Matomo wird von uns selbst gehostet (unter `s.cachy.app`), um die Datenhoheit zu gewährleisten; es handelt sich um ein First-Party-, Self-Hosting-Deployment.
- Wir verwenden IP-Anonymisierung.
- Diese Daten werden ausschließlich zur Nutzungsanalyse verwendet und nicht zu Werbezwecken an Dritte weitergegeben.

Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie den Schalter deaktivieren; ab diesem Zeitpunkt werden keine weiteren Ereignisse gesendet (ein Neuladen der Seite entlädt den Analyse-Container vollständig).

## 5. Ihre Rechte

Da Ihre Daten primär auf Ihrem Gerät gespeichert sind, haben Sie die volle Kontrolle darüber. Sie können Ihre Daten jederzeit löschen, indem Sie den Cache/Local Storage Ihres Browsers leeren oder die "Reset"-Funktionen innerhalb der App nutzen.
