---
id: BUG-0208
title: RSS Market Sentiment news open in new tab instead of modal iframe
type: bug
status: done
branch: BUG-0208-rss-news-modal-iframe
priority: P3
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0208 — RSS Market Sentiment news open in new tab instead of modal iframe

## Symptom

When a user clicks on a news article from the RSS (Market Sentiment) feed, the link currently opens in a new browser tab. The intended behavior was for these articles to open seamlessly within the app using a modal iframe, keeping the user in the trading context.

## Evidence

*Demonstrated* — Navigating to the Market Sentiment / News section and clicking any news link opens a new tab (`target="_blank"` behavior).

## Cause

The links in the RSS feed are likely rendered as standard `<a>` tags with `target="_blank"` instead of being intercepted by an onClick handler that opens a modal window containing an iframe with the target URL. Note: Some external sites might block iframe embedding via `X-Frame-Options` or `Content-Security-Policy`, which needs to be handled gracefully (e.g., falling back to a new tab if embedding is blocked).

## Fix

- Intercept clicks on RSS news links.
- Implement a modal or window component that embeds the target URL via an `<iframe>`.
- Add a fallback mechanism: if the iframe fails to load (due to security headers), provide a button to "Open in new tab".

## Acceptance criteria

- [x] Clicking a news link opens a modal with an iframe containing the article.
- [x] The user remains within the Cachy app.
- [x] If the iframe is blocked, a clear fallback to open the link in a new tab is provided.

## Links
