/**
 * Contributor classification: humans, AI coding agents, automation bots,
 * and AI-assisted humans.
 *
 * Detection uses two signal layers:
 *  1. Author identity (name/email) against a declarative identity table.
 *  2. Commit trailers — Co-authored-by lines and checkpoint/attribution
 *     trailers — which is where most agent-assisted work is attributed,
 *     since agents typically commit under the human's identity.
 *
 * Must NOT import 'vscode' (used by the worker-adjacent code paths and unit
 * tests). Configuration is passed in via options or setBotDetectionOptions.
 */
import type { GitCommit } from '../types/expert';

export type ContributorKind = 'human' | 'ai-agent' | 'automation-bot' | 'ai-assisted-human';

export interface ContributorClassification {
    kind: ContributorKind;
    confidence: 'high' | 'medium' | 'low';
    /** Which rules fired, e.g. ['email:cursoragent@cursor.com', 'trailer:co-author:Claude Code'] */
    signals: string[];
    /** Friendly agent/bot name when identified, e.g. 'Claude Code', 'Dependabot' */
    agentName?: string;
    /** Share of this contributor's commits carrying agent signals (0-1), when commits were provided */
    aiAssistRate?: number;
}

export interface BotDetectionOptions {
    /** Extra case-insensitive substrings matched against "name <email>"; matches classify as automation-bot */
    additionalBotPatterns?: string[];
    /** Emails never classified as bot/agent, e.g. a human named "botten" tripping a pattern */
    humanOverrides?: string[];
}

interface AgentIdentity {
    agentName: string;
    kind: 'ai-agent' | 'automation-bot';
    /** Exact lowercased emails */
    emails?: string[];
    /** Email domain suffixes, matched against the part after '@' */
    emailDomains?: string[];
    /** Lowercased substrings matched anywhere in the email */
    emailSubstrings?: string[];
    /** Exact lowercased author names */
    names?: string[];
    /** Regexes tested against the lowercased email */
    emailPatterns?: RegExp[];
}

/**
 * Known agent/bot identities. Specific AI agents are listed before the
 * generic [bot] rules so e.g. devin-ai-integration[bot] classifies as an
 * AI agent, not a generic automation bot. Adding an agent is one entry here.
 */
const KNOWN_IDENTITIES: AgentIdentity[] = [
    // ── AI coding agents ─────────────────────────────────────────────
    {
        agentName: 'Claude Code',
        kind: 'ai-agent',
        emailSubstrings: ['noreply@anthropic.com'],
        emails: ['claude@users.noreply.github.com'],
    },
    {
        agentName: 'GitHub Copilot',
        kind: 'ai-agent',
        names: ['copilot-swe-agent[bot]', 'copilot'],
        emailPatterns: [/^\d+\+copilot(-swe-agent)?(\[bot\])?@users\.noreply\.github\.com$/],
    },
    {
        agentName: 'Cursor',
        kind: 'ai-agent',
        names: ['cursor agent'],
        emails: ['cursoragent@cursor.com', 'agent@cursor.com'],
    },
    {
        agentName: 'Devin',
        kind: 'ai-agent',
        names: ['devin-ai-integration[bot]'],
        emailSubstrings: ['devin-ai-integration'],
    },
    {
        agentName: 'OpenAI Codex',
        kind: 'ai-agent',
        names: ['chatgpt-codex-connector[bot]'],
        emailSubstrings: ['chatgpt-codex-connector'],
    },
    {
        agentName: 'Google Jules',
        kind: 'ai-agent',
        names: ['google-labs-jules[bot]'],
        emailSubstrings: ['google-labs-jules'],
    },
    {
        agentName: 'Amazon Q',
        kind: 'ai-agent',
        names: ['amazon-q-developer[bot]'],
        emailSubstrings: ['amazon-q-developer'],
    },
    {
        agentName: 'OpenCode',
        kind: 'ai-agent',
        emails: ['noreply@opencode.ai'],
        emailDomains: ['opencode.ai'],
    },
    {
        agentName: 'OpenHands',
        kind: 'ai-agent',
        emails: ['openhands@all-hands.dev'],
        emailDomains: ['all-hands.dev'],
    },
    {
        agentName: 'Aider',
        kind: 'ai-agent',
        names: ['aider'],
        emailDomains: ['aider.chat'],
    },
    {
        agentName: 'Substrate',
        kind: 'ai-agent',
        emails: ['bot@substrate.run'],
    },
    // ── Automation bots ──────────────────────────────────────────────
    {
        agentName: 'Dependabot',
        kind: 'automation-bot',
        names: ['dependabot', 'dependabot[bot]'],
        emailDomains: ['dependabot.com'],
    },
    {
        agentName: 'Renovate',
        kind: 'automation-bot',
        names: ['renovate', 'renovate[bot]', 'renovate bot'],
        emailDomains: ['renovateapp.com'],
    },
    {
        agentName: 'GitHub Actions',
        kind: 'automation-bot',
        names: ['github-actions', 'github-actions[bot]'],
        emails: ['actions@github.com'],
    },
];

/** Threshold at which a human with agent-co-authored commits is surfaced as AI-assisted. */
const AI_ASSIST_KIND_THRESHOLD = 0.25;
const AI_ASSIST_MIN_COMMITS = 2;

let defaultOptions: BotDetectionOptions = {};

/**
 * Set process-wide detection options (from workspace settings). Call sites
 * that cannot thread options through can rely on this; explicit options
 * passed to classifyContributor always win.
 */
export function setBotDetectionOptions(options: BotDetectionOptions): void {
    defaultOptions = options ?? {};
}

function matchIdentity(lowerName: string, lowerEmail: string): { identity: AgentIdentity; signal: string } | null {
    const emailDomain = lowerEmail.split('@')[1] ?? '';

    for (const identity of KNOWN_IDENTITIES) {
        if (identity.emails?.includes(lowerEmail)) {
            return { identity, signal: `email:${lowerEmail}` };
        }
        if (identity.emailDomains?.some(d => emailDomain === d || emailDomain.endsWith(`.${d}`))) {
            return { identity, signal: `email-domain:${emailDomain}` };
        }
        if (lowerEmail && identity.emailSubstrings?.some(s => lowerEmail.includes(s))) {
            return { identity, signal: `email:${lowerEmail}` };
        }
        if (identity.emailPatterns?.some(p => p.test(lowerEmail))) {
            return { identity, signal: `email:${lowerEmail}` };
        }
        if (lowerName && identity.names?.includes(lowerName)) {
            return { identity, signal: `name:${lowerName}` };
        }
    }
    return null;
}

function matchGenericBot(lowerName: string, lowerEmail: string): string | null {
    if (lowerEmail.includes('[bot]@')) {
        return `email:${lowerEmail}`;
    }
    if ((/^\d+\+.+\[bot\]@users\.noreply\.github\.com$/i).test(lowerEmail)) {
        return `email:${lowerEmail}`;
    }
    if (lowerName.endsWith('[bot]')) {
        return `name:${lowerName}`;
    }
    if (
        (lowerEmail.includes('noreply@github.com') || lowerEmail.includes('@users.noreply.github.com')) &&
        lowerName.includes('[bot]')
    ) {
        return `name:${lowerName}`;
    }
    return null;
}

export interface CommitAgentSignals {
    /** True when the commit carries any agent-attribution signal */
    assisted: boolean;
    /** Friendly names of agents identified on the commit */
    agents: string[];
    /** Which signals fired, e.g. ['co-author:Claude Code', 'checkpoint'] */
    signals: string[];
}

/**
 * Inspect a single commit's trailers/subject for agent attribution:
 * agent co-authors, checkpoint/attribution trailers, and the aider
 * subject marker.
 */
export function detectCommitAgentSignals(commit: GitCommit): CommitAgentSignals {
    const agents = new Set<string>();
    const signals: string[] = [];

    for (const coAuthor of commit.coAuthors ?? []) {
        const match = matchIdentity(
            (coAuthor.name ?? '').trim().toLowerCase(),
            (coAuthor.email ?? '').trim().toLowerCase()
        );
        if (match) {
            agents.add(match.identity.agentName);
            signals.push(`co-author:${match.identity.agentName}`);
        } else if (matchGenericBot(
            (coAuthor.name ?? '').trim().toLowerCase(),
            (coAuthor.email ?? '').trim().toLowerCase()
        )) {
            agents.add(coAuthor.name || 'Unknown agent');
            signals.push(`co-author:${coAuthor.name}`);
        }
    }

    if (commit.checkpointId) {
        agents.add('Session-captured agent');
        signals.push('checkpoint');
    }
    if (commit.attribution) {
        signals.push('attribution');
    }
    if (/\(aider\)\s*$/i.test(commit.message ?? '')) {
        agents.add('Aider');
        signals.push('subject:aider');
    }

    return { assisted: signals.length > 0, agents: Array.from(agents), signals };
}

/**
 * Classify a contributor from identity and (optionally) their commits.
 * Without commits this is a pure name/email lookup; with commits, trailer
 * signals can upgrade a human to 'ai-assisted-human' and compute their
 * AI-assist rate.
 */
export function classifyContributor(
    name?: string,
    email?: string,
    commits?: GitCommit[],
    options?: BotDetectionOptions
): ContributorClassification {
    const opts = options ?? defaultOptions;
    const lowerName = (name ?? '').trim().toLowerCase();
    const lowerEmail = (email ?? '').trim().toLowerCase();

    if (!lowerName && !lowerEmail) {
        return { kind: 'human', confidence: 'low', signals: [] };
    }

    if (opts.humanOverrides?.some(o => o.trim().toLowerCase() === lowerEmail && lowerEmail)) {
        return { kind: 'human', confidence: 'high', signals: [`override:${lowerEmail}`] };
    }

    const identityString = `${lowerName} <${lowerEmail}>`;
    const customPattern = opts.additionalBotPatterns?.find(p => {
        const pattern = p.trim().toLowerCase();
        return pattern.length > 0 && identityString.includes(pattern);
    });
    if (customPattern) {
        return {
            kind: 'automation-bot',
            confidence: 'high',
            signals: [`custom-pattern:${customPattern}`],
            agentName: name?.trim() || customPattern,
        };
    }

    const identityMatch = matchIdentity(lowerName, lowerEmail);
    if (identityMatch) {
        return {
            kind: identityMatch.identity.kind,
            confidence: 'high',
            signals: [identityMatch.signal],
            agentName: identityMatch.identity.agentName,
        };
    }

    const genericSignal = matchGenericBot(lowerName, lowerEmail);
    if (genericSignal) {
        return {
            kind: 'automation-bot',
            confidence: 'medium',
            signals: [genericSignal],
            agentName: name?.trim() || undefined,
        };
    }

    // Human — check commit trailers for AI assistance
    if (commits && commits.length > 0) {
        let assisted = 0;
        const agentNames = new Set<string>();
        const signals = new Set<string>();
        for (const commit of commits) {
            const commitSignals = detectCommitAgentSignals(commit);
            if (commitSignals.assisted) {
                assisted++;
                commitSignals.agents.forEach(a => agentNames.add(a));
                commitSignals.signals.forEach(s => signals.add(`trailer:${s}`));
            }
        }
        const aiAssistRate = assisted / commits.length;
        if (assisted >= AI_ASSIST_MIN_COMMITS && aiAssistRate >= AI_ASSIST_KIND_THRESHOLD) {
            return {
                kind: 'ai-assisted-human',
                confidence: 'medium',
                signals: Array.from(signals),
                agentName: Array.from(agentNames).join(', ') || undefined,
                aiAssistRate,
            };
        }
        return { kind: 'human', confidence: 'high', signals: [], aiAssistRate };
    }

    return { kind: 'human', confidence: 'medium', signals: [] };
}

/**
 * Detect likely bot/agent contributors from git author metadata.
 * Back-compatible boolean wrapper over classifyContributor: AI-assisted
 * humans are NOT bots — they stay in human-focused insights.
 */
export function detectBotContributor(name?: string, email?: string): boolean {
    const kind = classifyContributor(name, email).kind;
    return kind === 'ai-agent' || kind === 'automation-bot';
}
