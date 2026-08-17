/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'fs/promises';
import path from 'path';
import { decideLink, matchPRsForItem } from './lib/pr-issue-match';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_SYNC_TOKEN = process.env.PROJECT_SYNC_TOKEN || GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY; // e.g. "mydcc/cachy-app"

if (!GITHUB_TOKEN) {
    console.error("Error: GITHUB_TOKEN environment variable is required.");
    process.exit(1);
}

if (!GITHUB_REPOSITORY) {
    console.error("Error: GITHUB_REPOSITORY environment variable is required.");
    process.exit(1);
}

const BASE_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues`;
const STATUS_LABEL_PREFIX = "status:";
const BACKLOG_ID_LABEL_PREFIX = "backlog-id:";
const CLOSED_STATUSES = new Set(['done', 'dropped']);

interface BacklogItem {
    id: string;
    title: string;
    type: string;
    status: string;
    area: string;
    priority?: string;
    assignees?: string[];
    editions?: string[];
    data_class?: string;
    adr?: string;
    milestone?: string;
    parent?: string;
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

async function ensureMilestone(title: string, milestones: GitHubMilestone[]): Promise<number | null> {
    if (!title || title.toLowerCase() === 'none') return null;
    const existing = milestones.find(m => m.title.toLowerCase() === title.toLowerCase());
    if (existing) return existing.number;

    try {
        console.log(`[Milestone] Milestone '${title}' does not exist on repository. Creating it...`);
        const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/milestones`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify({ title })
        });
        if (res.ok) {
            const data: GitHubMilestone = await res.json();
            milestones.push(data);
            console.log(`[Milestone] Successfully created milestone '${title}' (#${data.number})`);
            return data.number;
        } else {
            console.error(`[Milestone] Failed to create milestone '${title}': ${await res.text()}`);
        }
    } catch (e) {
        console.warn(`Could not create milestone '${title}':`, e);
    }
    return null;
}

interface GitHubIssue {
    number: number;
    node_id: string;
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
    const matchingPRs = matchPRsForItem(openPRs, item.id, issueNumber);

    for (const pr of matchingPRs) {
        const decision = decideLink(pr.body, issueNumber);

        if (decision.action === 'already-linked') continue;

        // A body that already closes a *different* issue is the case that made
        // BUG-0220: adding a second reference here means one merge closes two
        // issues, and the script cannot tell which one was meant. Report it and
        // leave the body alone.
        if (decision.action === 'conflict') {
            console.warn(
                `[PR Auto-Link] Skipping PR #${pr.number} for ${item.id}: its body already closes ` +
                `${decision.existing.map(n => `#${n}`).join(', ')}, wanted #${decision.wanted}. ` +
                `Resolve by hand — one of these references is wrong.`
            );
            continue;
        }

        console.log(`[PR Auto-Link] Prepending the closing reference for #${issueNumber} to PR #${pr.number} for ${item.id}`);
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

async function addSubIssueNative(parentIssueNodeId: string, childIssueNodeId: string) {
    const mutation = `
      mutation AddSubIssue($issueId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
          issue { id }
        }
      }
    `;
    try {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: mutation,
                variables: { issueId: parentIssueNodeId, subIssueId: childIssueNodeId }
            })
        });
        const json = await res.json();
        if (json.errors) {
            console.warn(`[Relationships] Sub-issue note:`, json.errors[0]?.message);
        } else {
            console.log(`[Relationships] Linked Sub-Issue natively in GitHub`);
        }
    } catch (e) {
        console.warn(`[Relationships] Could not link sub-issue natively:`, e);
    }
}

async function addBlockedByNative(issueNodeId: string, blockingIssueNodeId: string) {
    const mutation = `
      mutation AddBlockedBy($issueId: ID!, $blockingIssueId: ID!) {
        addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) {
          issue { id }
        }
      }
    `;
    try {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: mutation,
                variables: { issueId: issueNodeId, blockingIssueId: blockingIssueNodeId }
            })
        });
        const json = await res.json();
        if (json.errors) {
            console.warn(`[Relationships] Blocked-by note:`, json.errors[0]?.message);
        } else {
            console.log(`[Relationships] Linked Blocked-By natively in GitHub`);
        }
    } catch (e) {
        console.warn(`[Relationships] Could not link blocked-by natively:`, e);
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
    const priority = frontmatter.match(/^priority:\s*(.+)$/m)?.[1]?.trim() || undefined;

    const assigneeSingle = frontmatter.match(/^assignee:\s*(.+)$/m)?.[1]?.trim();
    const assigneesMatch = frontmatter.match(/^assignees:\s*\[(.*?)\]/m)?.[1];
    const assignees = assigneesMatch
        ? assigneesMatch.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : (assigneeSingle && assigneeSingle !== 'none' ? [assigneeSingle] : undefined);

    const editionsMatch = frontmatter.match(/^editions:\s*\[(.*?)\]/m)?.[1];
    const editions = editionsMatch
        ? editionsMatch.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : [];

    const data_class = frontmatter.match(/^data_class:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const adr = frontmatter.match(/^adr:\s*(.+)$/m)?.[1]?.trim() || undefined;

    const milestone = frontmatter.match(/^milestone:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const parent = frontmatter.match(/^parent:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const dependsOnMatch = frontmatter.match(/^depends_on:\s*\[(.*?)\]/m)?.[1];
    const depends_on = dependsOnMatch
        ? dependsOnMatch.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : [];

    const estimateRaw = frontmatter.match(/^estimate:\s*(.+)$/m)?.[1]?.trim();
    const estimate = estimateRaw ? parseFloat(estimateRaw) : undefined;
    const size = frontmatter.match(/^size:\s*(.+)$/m)?.[1]?.trim() || undefined;
    let start_date = frontmatter.match(/^start_date:\s*(.+)$/m)?.[1]?.trim() || undefined;
    const target_date = frontmatter.match(/^target_date:\s*(.+)$/m)?.[1]?.trim() || undefined;

    // Auto-trigger: If item is ready, in-progress, or done, but has no explicit start_date set, default to today's date
    if (!start_date && (status === 'ready' || status === 'in-progress' || status === 'done')) {
        start_date = new Date().toISOString().split('T')[0];
    }

    if (!id) return null;

    return {
        id, title, type, status, area, priority, assignees, editions, data_class, adr, milestone, parent, depends_on, estimate, size, start_date, target_date, content: body, filepath
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
async function createOrUpdateIssue(item: BacklogItem, existingIssue: GitHubIssue | undefined, milestones: GitHubMilestone[], hasOpenPR: boolean = false): Promise<{ number: number; nodeId: string } | undefined> {
    const isClosed = CLOSED_STATUSES.has(item.status);

    let milestoneNumber: number | null = null;
    if (item.milestone && item.milestone.toLowerCase() !== 'none') {
        milestoneNumber = await ensureMilestone(item.milestone, milestones);
    }

    // `status:*` is what lets a GitHub Projects board bucket cards by backlog stage
    // (idea/specced/ready/in-progress), not just the two-state open/closed the Issues API offers.
    // `backlog-id:*` is the stable lookup key for matching, independent of title/body edits.
    const effectiveStatus = hasOpenPR && !isClosed ? 'in-review' : item.status;
    const managedLabels = [
        item.type,
        item.area,
        item.priority,
        effectiveStatus ? `${STATUS_LABEL_PREFIX}${effectiveStatus}` : '',
        item.data_class && item.data_class !== 'none' ? `dataclass:${item.data_class}` : '',
        item.adr && item.adr !== 'none' ? `adr:${item.adr}` : '',
        ...(item.editions || []).map(e => `edition:${e}`),
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
            (name) => !name.startsWith(STATUS_LABEL_PREFIX) && !name.startsWith(BACKLOG_ID_LABEL_PREFIX) && !name.startsWith("dataclass:") && !name.startsWith("adr:") && !name.startsWith("edition:")
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
        if (item.assignees && item.assignees.length > 0) {
            payload.assignees = item.assignees;
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
            const data = await res.json();
            console.log(`[Sync] Updated issue ${item.id} (#${existingIssue.number})`);
            await syncProjectKanbanStatus(existingIssue.number, item, hasOpenPR);
            return { number: existingIssue.number, nodeId: data.node_id || existingIssue.node_id };
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
        if (item.assignees && item.assignees.length > 0) {
            payload.assignees = item.assignees;
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
            return undefined;
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
            await syncProjectKanbanStatus(data.number, item, hasOpenPR);
        }
        return { number: data.number, nodeId: data.node_id };
    }
}

async function cleanupDuplicateIssue(dupIssue: GitHubIssue, canonicalNumber: number) {
    try {
        const remainingLabels = labelNamesOf(dupIssue).filter(
            (name) => !name.startsWith(BACKLOG_ID_LABEL_PREFIX) && !name.startsWith(STATUS_LABEL_PREFIX)
        );
        const cleanedBody = (dupIssue.body || "")
            .replace(/<!--\s*backlog-id:[^>]*-->/g, "")
            .trim();
        const payload = {
            body: `${cleanedBody}\n\n> Note: Closed as duplicate of #${canonicalNumber}.`,
            labels: remainingLabels,
            state: "closed",
            state_reason: "not_planned"
        };
        await fetch(dupIssue.url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify(payload)
        });
        console.log(`[Sync] Closed duplicate issue #${dupIssue.number} (canonical: #${canonicalNumber})`);

        // Closing the issue does not by itself move it on the Kanban board —
        // Projects v2's "Status" field is independent state, not derived from
        // open/closed. Without this the duplicate stayed wherever it last was
        // (e.g. "In progress") even though the issue itself was closed. Reuse
        // the same sync path every other status transition goes through;
        // 'dropped' maps to the "Done" column same as a real completion.
        await syncProjectKanbanStatus(dupIssue.number, {
            id: "duplicate",
            title: dupIssue.title,
            type: "bug",
            status: "dropped",
            area: "repo",
            content: "",
            filepath: "",
        }, false);
    } catch (e) {
        console.warn(`[Sync] Failed to cleanup duplicate issue #${dupIssue.number}:`, e);
    }
}

function mapStatusToOptionName(status: string, hasOpenPR: boolean = false): string {
    if (hasOpenPR && status.toLowerCase() !== 'done' && status.toLowerCase() !== 'dropped') {
        return 'In review';
    }
    switch (status.toLowerCase()) {
        case 'in-review':
            return 'In review';
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

async function syncProjectKanbanStatus(issueNumber: number, item: BacklogItem, hasOpenPR: boolean = false) {
    console.log(`[Kanban Sync] Triggered for issue #${issueNumber} (${item.id}) with status '${item.status}' (hasOpenPR: ${hasOpenPR})`);
    if (!PROJECT_SYNC_TOKEN || !GITHUB_REPOSITORY) return;
    const [owner, repo] = GITHUB_REPOSITORY.split('/');
    const targetOptionName = mapStatusToOptionName(item.status, hasOpenPR);

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

            // 2. Priority (SingleSelect)
            if (item.priority) {
                const priorityField = fields.find((f: { name?: string }) => f.name === 'Priority');
                if (priorityField && priorityField.options) {
                    const prioOpt = priorityField.options.find((o: { name: string }) => o.name.toLowerCase() === item.priority!.toLowerCase());
                    if (prioOpt) {
                        await updateSingleSelectField(projectId, itemNode.id, priorityField.id, prioOpt.id);
                        console.log(`[Kanban Sync] Synced Priority '${prioOpt.name}' for #${issueNumber}`);
                    }
                }
            }

            // 3. Estimate (Number)
            if (item.estimate !== undefined) {
                const estField = fields.find((f: { name?: string }) => f.name === 'Estimate');
                if (estField?.id) {
                    await updateNumberField(projectId, itemNode.id, estField.id, item.estimate);
                    console.log(`[Kanban Sync] Synced Estimate '${item.estimate}' for #${issueNumber}`);
                }
            }

            // 4. Size (SingleSelect)
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

            // 5. Start date (Date)
            if (item.start_date) {
                const startDateField = fields.find((f: { name?: string }) => f.name === 'Start date');
                if (startDateField?.id) {
                    await updateDateField(projectId, itemNode.id, startDateField.id, item.start_date);
                    console.log(`[Kanban Sync] Synced Start date '${item.start_date}' for #${issueNumber}`);
                }
            }

            // 6. Target date (Date)
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

    const issueMap = new Map<string, string>(); // backlogId -> nodeId

    for (const item of localItems) {
        const matching = existingIssues.filter(issue =>
            labelNamesOf(issue).includes(`${BACKLOG_ID_LABEL_PREFIX}${item.id}`) ||
            issue.body?.includes(`<!-- backlog-id: ${item.id} -->`) ||
            issue.title.startsWith(`[${item.id}]`)
        );
        matching.sort((a, b) => a.number - b.number);
        const existing = matching[0];

        if (matching.length > 1 && existing) {
            for (let i = 1; i < matching.length; i++) {
                await cleanupDuplicateIssue(matching[i], existing.number);
            }
        }
        
        // Same rule as the auto-linker, from the same function on purpose: this
        // drives the `in-review` Kanban status, and when the two copies of the
        // rule drifted apart an item could be linked but not marked, or marked
        // but not linked. See BUG-0220.
        const matchingPRs = matchPRsForItem(openPRs, item.id, existing?.number);
        const hasOpenPR = matchingPRs.length > 0;

        const res = await createOrUpdateIssue(item, existing, milestones, hasOpenPR);
        if (res?.nodeId) {
            issueMap.set(item.id, res.nodeId);
        }
        if (existing?.number) {
            await ensurePRsAreLinked(item, existing.number, openPRs);
        }
        // Small delay to avoid hitting GitHub API rate limits too aggressively
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log("Syncing native GitHub Relationships (Parents & Blocked-By)...");
    for (const item of localItems) {
        const currentNodeId = issueMap.get(item.id);
        if (!currentNodeId) continue;

        // 1. Parent relationship (Add parent / sub-issue)
        if (item.parent && item.parent !== 'none') {
            const parentNodeId = issueMap.get(item.parent);
            if (parentNodeId) {
                console.log(`[Relationships] Linking ${item.id} as Sub-Issue of Parent ${item.parent}...`);
                await addSubIssueNative(parentNodeId, currentNodeId);
            }
        }

        // 2. Depends_on relationship (Mark as blocked by)
        if (item.depends_on && item.depends_on.length > 0) {
            for (const blockerId of item.depends_on) {
                const blockerNodeId = issueMap.get(blockerId);
                if (blockerNodeId) {
                    console.log(`[Relationships] Marking ${item.id} as Blocked By ${blockerId}...`);
                    await addBlockedByNative(currentNodeId, blockerNodeId);
                }
            }
        }
    }
    
    console.log("Sync complete.");
}

main().catch(err => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
});
