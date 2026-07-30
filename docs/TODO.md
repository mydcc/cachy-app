# TODO

Open items that need a decision or an action from a person, as opposed to work
that is planned and specified. Planned engineering work lives in
[`ROADMAP.md`](ROADMAP.md); this is the shorter list of things waiting on you.

Add entries as they come up. Keep the "why it is here" line — an entry nobody
can act on without re-deriving the context is how the roadmap got long.

---

## 1. Rotate the imgbb API key — and decide whether it stays

**Roadmap item 24e.** Needs your decision, but one part is not optional.

`defaultSettings.imgbbApiKey` in `src/stores/settings.svelte.ts` is not empty
like every other credential — it holds a real 32-character imgbb key.
`imgbbService.ts` uploads screenshots with whatever is in that field, so **every
user of every build shares one imgbb account**, and the key ships in the client
bundle by construction.

**Do this regardless of what you decide:** the key is in the git history, so
removing it from the code would not undo the exposure. It has to be **rotated at
imgbb**.

Then choose:

| Option | Consequence |
| --- | --- |
| **Rotate, keep a shared key as the default** | Screenshot upload keeps working out of the box for everyone. The new key is exposed the same way the old one was — acceptable only if you are content with a shared free-tier account being public. |
| **Rotate, remove the default, let users enter their own** | No shared key anywhere. Screenshot upload stops working until each user registers an imgbb key and enters it in Settings. |

It was deliberately not deleted during the cleanup: unlike the `VITE_*` key
fallbacks, this one is load-bearing, and removing it silently breaks a feature.

---

## Add new items below

<!--
Template:

## N. Short title

**Where it came from.** One line, so the entry survives without you.

What has to happen, and what the options are.
-->
