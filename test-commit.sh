export PR_BODY="$(git log -n 1 --pretty=format:"%B")"
npx tsx scripts/lint-pr-body-refs.ts
