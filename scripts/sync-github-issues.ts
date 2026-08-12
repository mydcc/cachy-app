import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY; // e.g. "mydcc/cachy-app"

if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.error("Missing GITHUB_TOKEN or GITHUB_REPOSITORY environment variables");
    process.exit(1);
}

const BASE_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues`;

// docs/backlog/README.md defines the full status lifecycle; only these two mean "no longer active work".
const CLOSED_STATUSES = new Set(['done', 'dropped']);
const STATUS_LABEL_PREFIX = 'status:';
const BACKLOG_ID_LABEL_PREFIX = 'backlog-id:';

interface BacklogItem {
    id: string;
    title: string;
    type: string;
    status: string;
    area: string;
    content: string; 
    filepath: string;
}

// Fetch all issues (handles pagination)
async function fetchAllIssues() {
    let page = 1;
    let allIssues: any[] = [];
    const perPage = 100;

    while (true) {
        const res = await fetch(`${BASE_URL}?state=all&per_page=${perPage}&page=${page}`, {
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!res.ok) throw new Error(`Failed to fetch issues: ${await res.text()}`);
        const data = await res.json();

        // We only care about real issues, not pull requests
        const issuesOnly = data.filter((item: any) => !item.pull_request);
        allIssues = allIssues.concat(issuesOnly);

        if (data.length < perPage) break;
        page++;
    }
    return allIssues;
}

// Parse markdown file to extract frontmatter and body
function parseMarkdownFile(filepath: string, rawContent: string): BacklogItem | null {
    const match = rawContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const body = match[2].trim();

    const id = frontmatter.match(/^id:\s*(.+)$/m)?.[1]?.trim() || '';
    const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim() || '';
    const type = frontmatter.match(/^type:\s*(.+)$/m)?.[1]?.trim() || '';
    const status = frontmatter.match(/^status:\s*(.+)$/m)?.[1]?.trim() || '';
    const area = frontmatter.match(/^area:\s*(.+)$/m)?.[1]?.trim() || '';

    if (!id) return null;

    return {
        id, title, type, status, area, content: body, filepath
    };
}

// Load all backlog markdown files
async function findBacklogFiles() {
    const categories = ['bugs', 'features', 'ideas'];
    const items: BacklogItem[] = [];
    
    for (const cat of categories) {
        const dir = path.join(process.cwd(), 'docs', 'backlog', cat);
        try {
            const files = await fs.readdir(dir);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const filepath = path.join(dir, file);
                    const content = await fs.readFile(filepath, 'utf-8');
                    const item = parseMarkdownFile(filepath, content);
                    if (item) items.push(item);
                }
            }
        } catch (e) {
            // Ignore if directory doesn't exist
            console.log(`Could not read directory ${dir}, skipping...`);
        }
    }
    return items;
}

// Create or update a single issue
async function createOrUpdateIssue(item: BacklogItem, existingIssue: any | undefined) {
    const isClosed = CLOSED_STATUSES.has(item.status);

    // `status:*` is what lets a GitHub Projects board bucket cards by backlog stage
    // (idea/specced/ready/in-progress), not just the two-state open/closed the Issues API offers.
    // `backlog-id:*` is the stable lookup key for matching, independent of title/body edits.
    const managedLabels = [
        item.type,
        item.area,
        item.status ? `${STATUS_LABEL_PREFIX}${item.status}` : '',
        `${BACKLOG_ID_LABEL_PREFIX}${item.id}`
    ].filter(Boolean);
    const body = `${item.content}\n\n<!-- backlog-id: ${item.id} -->`;
    const title = `[${item.id}] ${item.title}`;

    if (existingIssue) {
        // Keep manually-added labels (triage, "good first issue", ...) intact; only replace the
        // labels this script owns (status/backlog-id prefixes plus the current type/area values).
        const existingLabelNames: string[] = (existingIssue.labels ?? []).map((l: any) =>
            typeof l === 'string' ? l : l.name
        );
        const preservedLabels = existingLabelNames.filter(
            (name) => !name.startsWith(STATUS_LABEL_PREFIX) && !name.startsWith(BACKLOG_ID_LABEL_PREFIX)
        );
        const labels = Array.from(new Set([...preservedLabels, ...managedLabels]));

        // Update existing issue
        const payload = {
            title,
            body,
            labels,
            state: isClosed ? 'closed' : 'open'
        };
        const res = await fetch(existingIssue.url, {
            method: 'PATCH',
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            console.error(`Failed to update issue ${item.id}: ${await res.text()}`);
        } else {
            console.log(`Updated issue ${item.id}`);
        }
    } else {
        // Create new issue
        const payload = {
            title,
            body,
            labels: managedLabels,
        };
        const res = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            console.error(`Failed to create issue ${item.id}: ${await res.text()}`);
            return;
        }
        
        const data = await res.json();
        console.log(`Created issue ${item.id} (#${data.number})`);

        if (isClosed) {
            // If the markdown file is already 'done', close the newly created issue immediately
            await fetch(data.url, {
                method: 'PATCH',
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                body: JSON.stringify({ state: 'closed' })
            });
            console.log(`Closed newly created issue ${item.id}`);
        }
    }
}

async function main() {
    console.log("Fetching existing GitHub issues...");
    const existingIssues = await fetchAllIssues();
    console.log(`Found ${existingIssues.length} existing issues.`);
    
    console.log("Parsing local backlog files...");
    const localItems = await findBacklogFiles();
    console.log(`Found ${localItems.length} local items.`);

    for (const item of localItems) {
        // Match by backlog-id label first (survives title/body edits), then fall back to the
        // hidden marker or title prefix for issues created before the label existed.
        const existing = existingIssues.find(issue => {
            const labelNames: string[] = (issue.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
            return (
                labelNames.includes(`${BACKLOG_ID_LABEL_PREFIX}${item.id}`) ||
                issue.body?.includes(`<!-- backlog-id: ${item.id} -->`) ||
                issue.title.startsWith(`[${item.id}]`)
            );
        });
        
        await createOrUpdateIssue(item, existing);
        // Small delay to avoid hitting GitHub API rate limits too aggressively
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log("Sync complete.");
}

main().catch(err => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
});
