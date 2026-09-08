export PR_BODY="$(git log -1 --pretty=format:%B)"
npx tsx scripts/lint-pr-body-refs.ts
