import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_SYNC_TOKEN = process.env.PROJECT_SYNC_TOKEN || GITHUB_TOKEN;
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
    milestone?: string;
    depends_on?: string[];
    estimate?: number;
    size?: string;
    start_date?: string;
    target_date?: string;
    content: string;
    filepath: string;
}

interface GitHubMilestone {
    number: number;
    title: string;
}

async function fetchRepoMilestones(): Promise<GitHubMilestone[]> {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/milestones?state=all&per_page=100`;
        const res = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

interface GitHubIssue {
    number: number;
    url: string;
    body: string | null;
    title: string;
    labels: (string | { name: string })[];
    pull_request?: unknown;
}

function labelNamesOf(issue: GitHubIssue): string[] {
    return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
}

// Fetch all issues (handles pagination)
async function fetchAllIssues(): Promise<GitHubIssue[]> {
    let page = 1;
    let allIssues: GitHubIssue[] = [];
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
        const data: GitHubIssue[] = await res.json();

        // We only care about real issues, not pull requests
        const issuesOnly = data.filter((item) => !item.pull_request);
        allIssues = allIssues.concat(issuesOnly);

        if (data.length < perPage) break;
        page++;
    }
    return allIssues;
}

interface GitHubPullRequest {
    number: number;
    title: string;
    body: string | null;
    head: { ref: string };
    url: string;
}

async function fetchAllOpenPRs(): Promise<GitHubPullRequest[]> {
    try {
        const prUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100`;
        const res = await fetch(prUrl, {
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function ensurePRsAreLinked(item: BacklogItem, issueNumber: number, openPRs: GitHubPullRequest[]) {
    const matchingPRs = openPRs.filter(pr =>
        pr.title.includes(item.id) ||
        pr.body?.includes(item.id) ||
        pr.head.ref.includes(item.id)
    );

    for (const pr of matchingPRs) {
        const hasIssueLink = pr.body?.match(new RegExp(`Fixes #${issueNumber}|Closes #${issueNumber}|Resolves #${issueNumber}`, 'i'));
        if (!hasIssueLink) {
            console.log(`[PR Auto-Link] Prepending 'Fixes #${issueNumber}' to PR #${pr.number} for ${item.id}`);
            const updatedBody = `Fixes #${issueNumber}\n\n${pr.body || ''}`;
            await fetch(pr.url, {
                method: 'PATCH',
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                body: JSON.stringify({ body: updatedBody })
            });
        }
    }
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

    const milestone = frontmatter.match(/^milestone:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const dependsOnMatch = frontmatter.match(/^depends_on:\s*\[(.*?)\]/m)?.[1];
    const depends_on = dependsOnMatch
        ? dependsOnMatch.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : [];

    const estimateRaw = frontmatter.match(/^estimate:\s*(.+)$/m)?.[1]?.trim();
    const estimate = estimateRaw ? parseFloat(estimateRaw) : undefined;
    const size = frontmatter.match(/^size:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const start_date = frontmatter.match(/^start_date:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const target_date = frontmatter.match(/^target_date:\s*(.+)$/m)?.[1]?.trim() || undefined;

    if (!id) return null;

    return {
        id, title, type, status, area, milestone, depends_on, estimate, size, start_date, target_date, content: body, filepath
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
        } catch {
            // Ignore if directory doesn't exist
            console.log(`Could not read directory ${dir}, skipping...`);
        }
    }
    return items;
}

// Create or update a single issue
async function createOrUpdateIssue(item: BacklogItem, existingIssue: GitHubIssue | undefined, milestones: GitHubMilestone[]) {
    const isClosed = CLOSED_STATUSES.has(item.status);

    let milestoneNumber: number | null = null;
    if (item.milestone && item.milestone.toLowerCase() !== 'none') {
        const found = milestones.find(m => m.title.toLowerCase() === item.milestone!.toLowerCase());
        if (found) {
            milestoneNumber = found.number;
        }
    }

    // `status:*` is what lets a GitHub Projects board bucket cards by backlog stage
    // (idea/specced/ready/in-progress), not just the two-state open/closed the Issues API offers.
    // `backlog-id:*` is the stable lookup key for matching, independent of title/body edits.
    const managedLabels = [
        item.type,
        item.area,
        item.status ? `${STATUS_LABEL_PREFIX}${item.status}` : '',
        `${BACKLOG_ID_LABEL_PREFIX}${item.id}`
    ].filter(Boolean);

    let formattedBody = item.content;
    if (item.depends_on && item.depends_on.length > 0) {
        formattedBody = `> **Depends on:** ${item.depends_on.join(', ')}\n\n${formattedBody}`;
    }
    const body = `${formattedBody}\n\n<!-- backlog-id: ${item.id} -->`;
    const title = `[${item.id}] ${item.title}`;

    if (existingIssue) {
        // Keep manually-added labels (triage, "good first issue", ...) intact; only replace the
        // labels this script owns (status/backlog-id prefixes plus the current type/area values).
        const preservedLabels = labelNamesOf(existingIssue).filter(
            (name) => !name.startsWith(STATUS_LABEL_PREFIX) && !name.startsWith(BACKLOG_ID_LABEL_PREFIX)
        );
        const labels = Array.from(new Set([...preservedLabels, ...managedLabels]));

        // Update existing issue
        const payload: Record<string, unknown> = {
            title,
            body,
            labels,
            state: isClosed ? 'closed' : 'open'
        };
        if (milestoneNumber !== null) {
            payload.milestone = milestoneNumber;
        }
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
        if (res.ok) {
            console.log(`[Sync] Updated issue ${item.id} (#${existingIssue.number})`);
            await syncProjectKanbanStatus(existingIssue.number, item);
        } else {
            console.error(`[Sync] Failed to update issue ${item.id}: ${await res.text()}`);
        }
    } else {
        // Create new issue
        const payload: Record<string, unknown> = {
            title,
            body,
            labels: managedLabels,
        };
        if (milestoneNumber !== null) {
            payload.milestone = milestoneNumber;
        }
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

        if (data.number) {
            await syncProjectKanbanStatus(data.number, item);
        }
    }
}

function mapStatusToOptionName(status: string): string {
    switch (status.toLowerCase()) {
        case 'ready':
            return 'Ready';
        case 'in-progress':
            return 'In progress';
        case 'done':
        case 'dropped':
            return 'Done';
        case 'specced':
        case 'idea':
        default:
            return 'Backlog';
    }
}

async function updateSingleSelectField(projectId: string, itemId: string, fieldId: string, optionId: string) {
    const mutation = `
      mutation UpdateSingleSelect($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) { projectV2Item { id } }
      }
    `;
    await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${PROJECT_SYNC_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: mutation, variables: { projectId, itemId, fieldId, optionId } })
    });
}

async function updateNumberField(projectId: string, itemId: string, fieldId: string, value: number) {
    const mutation = `
      mutation UpdateNumber($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { number: $value }
          }
        ) { projectV2Item { id } }
      }
    `;
    await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${PROJECT_SYNC_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: mutation, variables: { projectId, itemId, fieldId, value } })
    });
}

async function updateDateField(projectId: string, itemId: string, fieldId: string, value: string) {
    const mutation = `
      mutation UpdateDate($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Date!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { date: $value }
          }
        ) { projectV2Item { id } }
      }
    `;
    await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${PROJECT_SYNC_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: mutation, variables: { projectId, itemId, fieldId, value } })
    });
}

async function syncProjectKanbanStatus(issueNumber: number, item: BacklogItem) {
    console.log(`[Kanban Sync] Triggered for issue #${issueNumber} (${item.id}) with status '${item.status}'`);
    if (!PROJECT_SYNC_TOKEN || !GITHUB_REPOSITORY) return;
    const [owner, repo] = GITHUB_REPOSITORY.split('/');
    const targetOptionName = mapStatusToOptionName(item.status);

    const query = `
      query GetIssueProjects($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            projectItems(first: 5) {
              nodes {
                id
                project {
                  id
                  title
                  fields(first: 30) {
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        dataType
                        options { id name }
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                        dataType
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${PROJECT_SYNC_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query,
                variables: { owner, repo, number: issueNumber }
            })
        });

        if (!res.ok) {
            console.error(`[Kanban Sync] HTTP error fetching projects for issue #${issueNumber}: ${res.status} ${await res.text()}`);
            return;
        }
        const json = await res.json();
        if (json.errors) {
            console.error(`[Kanban Sync] GraphQL query errors for issue #${issueNumber}:`, JSON.stringify(json.errors));
        }

        const projectItems = json?.data?.repository?.issue?.projectItems?.nodes;
        if (!projectItems || projectItems.length === 0) {
            console.log(`[Kanban Sync] No project items returned for issue #${issueNumber}`);
            return;
        }

        for (const itemNode of projectItems) {
            const projectId = itemNode.project?.id;
            const fields = itemNode.project?.fields?.nodes || [];
            if (!projectId || fields.length === 0) continue;

            // 1. Status (SingleSelect)
            const statusField = fields.find((f: { name?: string }) => f.name === 'Status');
            if (statusField && statusField.options) {
                const targetOption = statusField.options.find(
                    (opt: { id: string; name: string }) =>
                        opt.name.toLowerCase() === targetOptionName.toLowerCase()
                );
                if (targetOption) {
                    await updateSingleSelectField(projectId, itemNode.id, statusField.id, targetOption.id);
                    console.log(`[Kanban Sync] Synced Status '${targetOption.name}' for #${issueNumber}`);
                }
            }

            // 2. Estimate (Number)
            if (item.estimate !== undefined) {
                const estField = fields.find((f: { name?: string }) => f.name === 'Estimate');
                if (estField?.id) {
                    await updateNumberField(projectId, itemNode.id, estField.id, item.estimate);
                    console.log(`[Kanban Sync] Synced Estimate '${item.estimate}' for #${issueNumber}`);
                }
            }

            // 3. Size (SingleSelect)
            if (item.size) {
                const sizeField = fields.find((f: { name?: string }) => f.name === 'Size');
                if (sizeField && sizeField.options) {
                    const sizeOpt = sizeField.options.find((o: { name: string }) => o.name.toLowerCase() === item.size!.toLowerCase());
                    if (sizeOpt) {
                        await updateSingleSelectField(projectId, itemNode.id, sizeField.id, sizeOpt.id);
                        console.log(`[Kanban Sync] Synced Size '${sizeOpt.name}' for #${issueNumber}`);
                    }
                }
            }

            // 4. Start date (Date)
            if (item.start_date) {
                const startDateField = fields.find((f: { name?: string }) => f.name === 'Start date');
                if (startDateField?.id) {
                    await updateDateField(projectId, itemNode.id, startDateField.id, item.start_date);
                    console.log(`[Kanban Sync] Synced Start date '${item.start_date}' for #${issueNumber}`);
                }
            }

            // 5. Target date (Date)
            if (item.target_date) {
                const targetDateField = fields.find((f: { name?: string }) => f.name === 'Target date');
                if (targetDateField?.id) {
                    await updateDateField(projectId, itemNode.id, targetDateField.id, item.target_date);
                    console.log(`[Kanban Sync] Synced Target date '${item.target_date}' for #${issueNumber}`);
                }
            }
        }
    } catch (e) {
        console.warn(`Could not sync Project V2 field for issue #${issueNumber}:`, e);
    }
}

async function main() {
    console.log("Fetching existing GitHub issues...");
    const existingIssues = await fetchAllIssues();
    console.log(`Found ${existingIssues.length} existing issues.`);

    console.log("Fetching repository milestones...");
    const milestones = await fetchRepoMilestones();
    console.log(`Found ${milestones.length} milestones.`);

    console.log("Fetching open pull requests for auto-linking...");
    const openPRs = await fetchAllOpenPRs();
    console.log(`Found ${openPRs.length} open pull requests.`);
    
    console.log("Parsing local backlog files...");
    const localItems = await findBacklogFiles();
    console.log(`Found ${localItems.length} local items.`);

    for (const item of localItems) {
        // Match by backlog-id label first (survives title/body edits), then fall back to the
        // hidden marker or title prefix for issues created before the label existed.
        const existing = existingIssues.find(issue =>
            labelNamesOf(issue).includes(`${BACKLOG_ID_LABEL_PREFIX}${item.id}`) ||
            issue.body?.includes(`<!-- backlog-id: ${item.id} -->`) ||
            issue.title.startsWith(`[${item.id}]`)
        );
        
        await createOrUpdateIssue(item, existing, milestones);
        if (existing?.number) {
            await ensurePRsAreLinked(item, existing.number, openPRs);
        }
        // Small delay to avoid hitting GitHub API rate limits too aggressively
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log("Sync complete.");
}

main().catch(err => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
});
