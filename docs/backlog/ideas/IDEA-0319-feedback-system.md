---
id: IDEA-0319
title: User feedback system
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: feedback
data_class: none
adr: none
depends_on: []
---

# IDEA-0319 — User feedback system

## Why

Google ratings (aggregateRating) can increase click-through rate by 20-30%.
But: only use **real** ratings!

## Ideas for collecting feedback

### 1. In-app feedback widget

After N successful trades, prompt user for rating.

### 2. GitHub Discussions

- Feature requests
- User stories
- Collect ratings

### 3. ProductHunt launch

- Publish Cachy on ProductHunt
- Collect ratings and upvotes
- Link: <https://www.producthunt.com/>

### 4. Reddit feedback

- r/algotrading
- r/Daytrading
- r/CryptoTrading

### 5. Simple feedback form

Embedded on website.

## aggregateRating (later)

Once 20+ real ratings exist:

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",
  "ratingCount": "23",
  "bestRating": "5",
  "worstRating": "1"
}
```

Insert into `src/app.html` after `"isAccessibleForFree": true`.

## Document rating sources

- GitHub Stars screenshot
- ProductHunt reviews
- Reddit comments
- In-app ratings

Google may ask where the numbers come from!
