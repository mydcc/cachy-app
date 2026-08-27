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
import { sanitizeAssignees } from './lib/issue-sync-payload';

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

// Every push-triggered run re-walks the entire backlog, and most of it is
// items that finished long ago and never change again — done/dropped items
// only ever grow as a share of the total. Re-issuing a PATCH plus a Kanban
// GraphQL round trip for each of those on every single run makes the sync
// slower with every merge regardless of how small the actual diff was. Set
// by the weekly full-resync workflow to force every item through in full,
// as a safety net against drift this run-to-run skip can't see (e.g. a
// board column edited by hand). See BUG-0226.
const FORCE_FULL_SYNC = process.env.FORCE_FULL_SYNC === 'true';

// Convergence failures this run could not fix. The script keeps going so one
// bad item cannot starve the rest, but the workflow must not report success
// while markdown and GitHub disagree — a green run is exactly how the
// FEAT-0254/FEAT-0256 drift stayed invisible for days (BUG-0307).
const syncFailures: string[] = [];

function recordSyncFailure(action: string, detail: string): void {
    syncFailures.push(`${action}: ${detail}`);
    console.error(`[Sync] Failed to ${action}: ${detail}`);
    // GitHub Actions annotation: surfaces in the run summary even though the
    // step still has to fail below for the red X.
    console.error(`::error::${action}: ${detail}`);
}

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
    iteration?: string;
    agent_eligible?: boolean;
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

/**
 * Logins GitHub will accept in an issue's `assignees` array.
 *
 * The Issues API validates assignees against repository collaborators and
 * rejects the *entire* PATCH on one unknown value — so the front-matter list
 * has to be filtered against this set before it reaches any payload. An empty
 * result (lookup failed) degrades safely: no issue gets assignees, but state,
 * labels and title still converge. See BUG-0307.
 */
async function fetchAssignableLogins(): Promise<Set<string>> {
    const logins = new Set<string>();
    let page = 1;
    while (true) {
        try {
            const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/assignable/collaborators?per_page=100&page=${page}`;
            const res = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });
            if (!res.ok) {
                console.warn(`[Sync] Could not list assignable collaborators (HTTP ${res.status}) — skipping assignees this run.`);
                return logins;
            }
            const data: { login?: string }[] = await res.json();
            for (const user of data) {
                if (user?.login) logins.add(user.login.toLowerCase());
            }
            if (data.length < 100) return logins;
            page++;
        } catch (e) {
            console.warn(`[Sync] Could not list assignable collaborators:`, e);
            return logins;
        }
    }
}

async function ensureMilestone(title: string, milestones: GitHubMilestone[]): Promise<number | null> {    if (!title || title.toLowerCase() === 'none') return null;
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
    state?: string;
    milestone?: { number: number } | null;
}

function labelNamesOf(issue: GitHubIssue): string[] {
    return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
}

function sameLabelSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sorted = (xs: string[]) => [...xs].sort();
    return sorted(a).every((name, i) => name === sorted(b)[i]);
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
        const res = await fetch(pr.url, {
            method: 'PATCH',
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify({ body: updatedBody })
        });
        // This PATCH used to be fire-and-forget: a rejected request (e.g. a
        // token without `pull-requests: write`) vanished silently, and PRs
        // merged with no closing reference at all — closing nothing. See BUG-0307.
        if (!res.ok) {
            recordSyncFailure(
                `auto-link PR #${pr.number} for ${item.id} (missing 'pull-requests: write' permission is the usual cause)`,
                `${res.status} ${await res.text()}`
            );
        }
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
    const iteration = frontmatter.match(/^(?:iteration|sprint):\s*(.+)$/m)?.[1]?.trim() || undefined;
    const agentEligibleRaw = frontmatter.match(/^agent_eligible:\s*(.+)$/m)?.[1]?.trim();
    const agent_eligible = agentEligibleRaw !== undefined ? agentEligibleRaw === 'true' : undefined;

    // Auto-trigger: If item is ready, in-progress, or done, but has no explicit start_date set, default to today's date
    if (!start_date && (status === 'ready' || status === 'in-progress' || status === 'done')) {
        start_date = new Date().toISOString().split('T')[0];
    }

    if (!id) return null;

    return {
        id, title, type, status, area, priority, assignees, editions, data_class, adr, milestone, parent, depends_on, estimate, size, start_date, target_date, iteration, agent_eligible, content: body, filepath
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
async function createOrUpdateIssue(item: BacklogItem, existingIssue: GitHubIssue | undefined, milestones: GitHubMilestone[], hasOpenPR: boolean = false, assignableLogins: ReadonlySet<string> = new Set()): Promise<{ number: number; nodeId: string } | undefined> {
    const isClosed = CLOSED_STATUSES.has(item.status);

    // Front-matter assignees are provenance, not a GitHub fact. Filter them
    // against real collaborators BEFORE building any payload: one unknown
    // value makes GitHub reject the whole request (HTTP 422), which is how
    // `state: closed`, labels and title were lost together for every item
    // claiming `assignee: jules` — the root cause of the FEAT-0254/FEAT-0256
    // drift (BUG-0307). Assignees are applied separately so they can never
    // veto convergence again.
    const assignees = sanitizeAssignees(item.assignees, assignableLogins);
    if (assignees.invalid.length > 0) {
        console.warn(
            `[Sync] Issue ${item.id}: front-matter assignee(s) ${assignees.invalid.map(a => `'${a}'`).join(', ')} ` +
            `are not assignable collaborators — excluded from the GitHub payload (kept in the markdown as provenance).`
        );
    }

    let milestoneNumber: number | null = null;
    if (item.milestone && item.milestone.toLowerCase() !== 'none') {
        milestoneNumber = await ensureMilestone(item.milestone, milestones);
    }

    // `status:*` is what lets a GitHub Projects board bucket cards by backlog stage
    // (idea/specced/ready/in-progress), not just the two-state open/closed the Issues API offers.
    // `backlog-id:*` is the stable lookup key for matching, independent of title/body edits.
    const isSensitiveArea = item.area === 'execution' || item.area === 'security' || item.area === 'exchange' || item.priority === 'P0';
    const effectiveStatus = hasOpenPR && !isClosed ? 'in-review' : item.status;
    const managedLabels = [
        item.type,
        item.area,
        item.priority,
        effectiveStatus ? `${STATUS_LABEL_PREFIX}${effectiveStatus}` : '',
        item.data_class && item.data_class !== 'none' ? `dataclass:${item.data_class}` : '',
        item.adr && item.adr !== 'none' ? `adr:${item.adr}` : '',
        ...(item.editions || []).map(e => `edition:${e}`),
        isSensitiveArea ? 'review:human-required' : (item.agent_eligible !== false ? 'agent:eligible' : ''),
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

        // Stable, already-synced items are the majority of the backlog.
        // Skip the PATCH and the Kanban GraphQL round trip entirely when nothing
        // this script owns has actually changed (both for closed and open items).
        // Comparing against data already in `existingIssue` (from the one
        // bulk fetch in main()) costs nothing extra. `hasOpenPR` items are
        // excluded because 'in-review' is a transient status this check
        // isn't meant to catch mid-transition. FORCE_FULL_SYNC (the weekly
        // resync workflow) bypasses this to catch anything that drifted
        // without a matching backlog-file change — e.g. someone moving a
        // card on the board by hand.
        const expectedState = isClosed ? 'closed' : 'open';
        if (
            !FORCE_FULL_SYNC &&
            !hasOpenPR &&
            existingIssue.state === expectedState &&
            existingIssue.title === title &&
            (existingIssue.body ?? '') === body &&
            (existingIssue.milestone?.number ?? null) === milestoneNumber &&
            sameLabelSet(labelNamesOf(existingIssue), labels)
        ) {
            console.log(`[Sync] Skipped ${item.id} (#${existingIssue.number}) — already in sync`);
            return { number: existingIssue.number, nodeId: existingIssue.node_id };
        }

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
            const data = await res.json();
            console.log(`[Sync] Updated issue ${item.id} (#${existingIssue.number})`);

            // Assignees ride in a second PATCH on purpose: if even this
            // validated list is rejected, the convergence above has already
            // landed and only a warning is lost, not the close.
            if (assignees.valid.length > 0) {
                const assigneeRes = await fetch(existingIssue.url, {
                    method: 'PATCH',
                    headers: {
                        "Authorization": `Bearer ${GITHUB_TOKEN}`,
                        "Accept": "application/vnd.github+json",
                        "Content-Type": "application/json",
                        "X-GitHub-Api-Version": "2022-11-28"
                    },
                    body: JSON.stringify({ assignees: assignees.valid })
                });
                if (!assigneeRes.ok) {
                    console.warn(`[Sync] Could not set assignees on ${item.id} (#${existingIssue.number}): ${await assigneeRes.text()}`);
                }
            }

            await syncProjectKanbanStatus(existingIssue.number, item, hasOpenPR);
            return { number: existingIssue.number, nodeId: data.node_id || existingIssue.node_id };
        } else {
            recordSyncFailure(`update issue ${item.id} (#${existingIssue.number})`, await res.text());
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
        if (assignees.valid.length > 0) {
            payload.assignees = assignees.valid;
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
            recordSyncFailure(`create issue ${item.id}`, await res.text());
            return undefined;
        }
        
        const data = await res.json();
        console.log(`Created issue ${item.id} (#${data.number})`);

        if (isClosed) {
            // If the markdown file is already 'done', close the newly created issue immediately
            const closeRes = await fetch(data.url, {
                method: 'PATCH',
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                body: JSON.stringify({ state: 'closed' })
            });
            if (closeRes.ok) {
                console.log(`Closed newly created issue ${item.id}`);
            } else {
                // Creation succeeded but the close did not: markdown says done
                // while GitHub shows an open issue — exactly the drift this
                // script exists to prevent. Record it. See BUG-0307.
                recordSyncFailure(`close newly created issue ${item.id} (#${data.number})`, `${closeRes.status} ${await closeRes.text()}`);
            }
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
        const res = await fetch(dupIssue.url, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28"
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            recordSyncFailure(`close duplicate issue #${dupIssue.number} (canonical: #${canonicalNumber})`, `${res.status} ${await res.text()}`);
            return;
        }
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

interface ProjectFieldDefinition {
    id: string;
    name: string;
    dataType: string;
    options?: { id: string; name: string }[];
}

interface ProjectMetadata {
    id: string;
    title: string;
    fields: Map<string, ProjectFieldDefinition>;
}

const projectMetadataCache = new Map<string, ProjectMetadata>();

async function getProjectMetadata(projectId: string): Promise<ProjectMetadata | null> {
    if (projectMetadataCache.has(projectId)) {
        return projectMetadataCache.get(projectId)!;
    }
    const query = `
      query GetProjectFields($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            fields(first: 50) {
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
    `;
    try {
        const res = await fetch("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${PROJECT_SYNC_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, variables: { projectId } })
        });
        if (!res.ok) return null;
        const json = await res.json();
        const proj = json?.data?.node;
        if (!proj) return null;
        const fieldsMap = new Map<string, ProjectFieldDefinition>();
        for (const f of proj.fields?.nodes || []) {
            if (f.name) {
                fieldsMap.set(f.name.toLowerCase(), f);
            }
        }
        const meta: ProjectMetadata = {
            id: proj.id,
            title: proj.title,
            fields: fieldsMap
        };
        projectMetadataCache.set(projectId, meta);
        return meta;
    } catch {
        return null;
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
      query GetIssueProjectItems($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            projectItems(first: 5) {
              nodes {
                id
                project {
                  id
                  title
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { ... on ProjectV2SingleSelectField { id name } }
                      optionId
                      name
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field { ... on ProjectV2Field { id name } }
                      number
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      field { ... on ProjectV2Field { id name } }
                      date
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
            if (!projectId) continue;

            const projectMeta = await getProjectMetadata(projectId);
            if (!projectMeta) continue;

            const currentValues = new Map<string, { optionId?: string; name?: string; number?: number; date?: string }>();
            for (const fv of itemNode.fieldValues?.nodes || []) {
                const fieldName = fv.field?.name?.toLowerCase();
                if (fieldName) {
                    currentValues.set(fieldName, {
                        optionId: fv.optionId,
                        name: fv.name,
                        number: fv.number,
                        date: fv.date
                    });
                }
            }

            const mutations: Promise<void>[] = [];

            // 1. Status (SingleSelect)
            const statusField = projectMeta.fields.get('status');
            if (statusField && statusField.options) {
                const targetOption = statusField.options.find(
                    (opt) => opt.name.toLowerCase() === targetOptionName.toLowerCase()
                );
                const currentStatus = currentValues.get('status');
                if (targetOption && currentStatus?.optionId !== targetOption.id) {
                    mutations.push(updateSingleSelectField(projectId, itemNode.id, statusField.id, targetOption.id).then(() => {
                        console.log(`[Kanban Sync] Synced Status '${targetOption.name}' for #${issueNumber}`);
                    }));
                }
            }

            // 2. Priority (SingleSelect)
            if (item.priority) {
                const priorityField = projectMeta.fields.get('priority');
                if (priorityField && priorityField.options) {
                    const prioOpt = priorityField.options.find((o) => o.name.toLowerCase() === item.priority!.toLowerCase());
                    const currentPrio = currentValues.get('priority');
                    if (prioOpt && currentPrio?.optionId !== prioOpt.id) {
                        mutations.push(updateSingleSelectField(projectId, itemNode.id, priorityField.id, prioOpt.id).then(() => {
                            console.log(`[Kanban Sync] Synced Priority '${prioOpt.name}' for #${issueNumber}`);
                        }));
                    }
                }
            }

            // 3. Estimate (Number)
            if (item.estimate !== undefined) {
                const estField = projectMeta.fields.get('estimate');
                const currentEst = currentValues.get('estimate');
                if (estField?.id && currentEst?.number !== item.estimate) {
                    mutations.push(updateNumberField(projectId, itemNode.id, estField.id, item.estimate).then(() => {
                        console.log(`[Kanban Sync] Synced Estimate '${item.estimate}' for #${issueNumber}`);
                    }));
                }
            }

            // 4. Size (SingleSelect)
            if (item.size) {
                const sizeField = projectMeta.fields.get('size');
                if (sizeField && sizeField.options) {
                    const sizeOpt = sizeField.options.find((o) => o.name.toLowerCase() === item.size!.toLowerCase());
                    const currentSize = currentValues.get('size');
                    if (sizeOpt && currentSize?.optionId !== sizeOpt.id) {
                        mutations.push(updateSingleSelectField(projectId, itemNode.id, sizeField.id, sizeOpt.id).then(() => {
                            console.log(`[Kanban Sync] Synced Size '${sizeOpt.name}' for #${issueNumber}`);
                        }));
                    }
                }
            }

            // 5. Start date (Date)
            if (item.start_date) {
                const startDateField = projectMeta.fields.get('start date');
                const currentStartDate = currentValues.get('start date');
                if (startDateField?.id && currentStartDate?.date !== item.start_date) {
                    mutations.push(updateDateField(projectId, itemNode.id, startDateField.id, item.start_date).then(() => {
                        console.log(`[Kanban Sync] Synced Start date '${item.start_date}' for #${issueNumber}`);
                    }));
                }
            }

            // 6. Target date (Date)
            if (item.target_date) {
                const targetDateField = projectMeta.fields.get('target date');
                const currentTargetDate = currentValues.get('target date');
                if (targetDateField?.id && currentTargetDate?.date !== item.target_date) {
                    mutations.push(updateDateField(projectId, itemNode.id, targetDateField.id, item.target_date).then(() => {
                        console.log(`[Kanban Sync] Synced Target date '${item.target_date}' for #${issueNumber}`);
                    }));
                }
            }

            // 7. Area (SingleSelect)
            if (item.area) {
                const areaField = projectMeta.fields.get('area');
                if (areaField && areaField.options) {
                    const areaOpt = areaField.options.find((o) => o.name.toLowerCase() === item.area.toLowerCase());
                    const currentArea = currentValues.get('area');
                    if (areaOpt && currentArea?.optionId !== areaOpt.id) {
                        mutations.push(updateSingleSelectField(projectId, itemNode.id, areaField.id, areaOpt.id).then(() => {
                            console.log(`[Kanban Sync] Synced Area '${areaOpt.name}' for #${issueNumber}`);
                        }));
                    }
                }
            }

            // 8. Edition (SingleSelect or Primary Edition)
            if (item.editions && item.editions.length > 0) {
                const editionField = projectMeta.fields.get('edition');
                if (editionField && editionField.options) {
                    const primaryEdition = item.editions[0];
                    const editionOpt = editionField.options.find((o) => o.name.toLowerCase() === primaryEdition.toLowerCase());
                    const currentEdition = currentValues.get('edition');
                    if (editionOpt && currentEdition?.optionId !== editionOpt.id) {
                        mutations.push(updateSingleSelectField(projectId, itemNode.id, editionField.id, editionOpt.id).then(() => {
                            console.log(`[Kanban Sync] Synced Edition '${editionOpt.name}' for #${issueNumber}`);
                        }));
                    }
                }
            }

            if (mutations.length > 0) {
                await Promise.all(mutations);
            }
        }
    } catch (e) {
        console.warn(`Could not sync Project V2 field for issue #${issueNumber}:`, e);
    }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await fn(items[currentIndex]);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function main() {
    console.log("Fetching existing GitHub issues...");
    const existingIssues = await fetchAllIssues();
    console.log(`Found ${existingIssues.length} existing issues.`);

    console.log("Fetching repository milestones...");
    const milestones = await fetchRepoMilestones();
    console.log(`Found ${milestones.length} milestones.`);

    console.log("Fetching assignable collaborators (assignee allow-list)...");
    const assignableLogins = await fetchAssignableLogins();
    console.log(`Found ${assignableLogins.size} assignable collaborators.`);

    console.log("Fetching open pull requests for auto-linking...");
    const openPRs = await fetchAllOpenPRs();
    console.log(`Found ${openPRs.length} open pull requests.`);
    
    console.log("Parsing local backlog files...");
    const localItems = await findBacklogFiles();
    console.log(`Found ${localItems.length} local items.`);

    const issueMap = new Map<string, string>(); // backlogId -> nodeId

    console.log("Syncing items...");
    await mapConcurrent(localItems, 5, async (item) => {
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

        const res = await createOrUpdateIssue(item, existing, milestones, hasOpenPR, assignableLogins);
        if (res?.nodeId) {
            issueMap.set(item.id, res.nodeId);
        }
        if (existing?.number) {
            await ensurePRsAreLinked(item, existing.number, openPRs);
        }
    });

    console.log("Syncing native GitHub Relationships (Parents & Blocked-By)...");
    await mapConcurrent(localItems, 5, async (item) => {
        const currentNodeId = issueMap.get(item.id);
        if (!currentNodeId) return;

        // 1. Parent relationship (Add parent / sub-issue)
        if (item.parent && item.parent !== 'none') {
            const parentNodeId = issueMap.get(item.parent);
            if (parentNodeId) {
                await addSubIssueNative(parentNodeId, currentNodeId);
            }
        }

        // 2. Depends_on relationship (Mark as blocked by)
        if (item.depends_on && item.depends_on.length > 0) {
            for (const blockerId of item.depends_on) {
                const blockerNodeId = issueMap.get(blockerId);
                if (blockerNodeId) {
                    await addBlockedByNative(currentNodeId, blockerNodeId);
                }
            }
        }
    });
    
    // Fail loud. Every entry in `syncFailures` is a place where markdown and
    // GitHub still disagree after this run — closing an item that stayed open,
    // a PR body that never got its `Fixes #N`. Exiting non-zero turns the next
    // such drift into a red run instead of days of silent divergence, and the
    // weekly FORCE_FULL_SYNC resync doubles as the reconciliation audit: it
    // re-walks every item with no skip, so any md↔issue mismatch surfaces here.
    // See BUG-0307.
    if (syncFailures.length > 0) {
        console.error(`\n[Sync] ${syncFailures.length} convergence failure(s) this run:`);
        for (const failure of syncFailures) {
            console.error(` - ${failure}`);
        }
        process.exit(1);
    }

    console.log("Sync complete.");
}

main().catch(err => {
    console.error("Fatal error during sync:", err);
    process.exit(1);
});

