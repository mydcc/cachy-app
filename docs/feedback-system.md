# Benutzerfeedback System - Für spätere Implementation

## Warum wichtig?

Google Bewertungen (aggregateRating) können die Klickrate in der Suche um 20-30% erhöhen.
Aber: Nur mit **echten** Bewertungen verwenden!

## Feedback sammeln - Ideen

### 1. In-App Feedback Widget

```javascript
// Nach 5 erfolgreichen Trades:
if (journalStore.length >= 5) {
  showFeedbackModal();
}
```

### 2. GitHub Discussions

- Feature Requests
- User Stories
- Bewertungen sammeln

### 3. ProductHunt Launch

- Veröffentliche Cachy auf ProductHunt
- Sammle Bewertungen und Upvotes
- Link: <https://www.producthunt.com/>

### 4. Reddit Feedback

- r/algotrading
- r/Daytrading
- r/CryptoTrading

### 5. Simple Feedback Form

Auf der Website einbauen:

```html
<div class="feedback">
  <h3>Wie gefällt dir Cachy?</h3>
  <input type="range" min="1" max="5" />
  <button>Bewertung abgeben</button>
</div>
```

## Später aggregateRating hinzufügen

Wenn du 20+ echte Bewertungen hast:

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",  // Durchschnitt deiner echten Bewertungen
  "ratingCount": "23",   // Anzahl echter Bewertungen
  "bestRating": "5",
  "worstRating": "1"
}
```

In `src/app.html` nach `"isAccessibleForFree": true` einfügen.

## Bewertungsquellen dokumentieren

- Screenshot von GitHub Stars
- ProductHunt Reviews
- Reddit Kommentare
- In-App Ratings

Google kann nachfragen woher die Zahlen kommen!
