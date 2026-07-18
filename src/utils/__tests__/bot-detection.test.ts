import { describe, it, expect, afterEach } from 'vitest';
import {
    classifyContributor,
    detectBotContributor,
    detectCommitAgentSignals,
    setBotDetectionOptions,
} from '../bot-detection';
import type { GitCommit } from '../../types/expert';

function makeCommit(overrides: Partial<GitCommit> = {}): GitCommit {
    return {
        sha: 'abc123',
        author: { name: 'Alice', email: 'alice@test.com' },
        message: 'feat: add feature',
        date: '2026-07-01T10:00:00+00:00',
        files: [],
        ...overrides,
    };
}

afterEach(() => {
    setBotDetectionOptions({});
});

describe('detectBotContributor (back-compat boolean)', () => {
    it('flags GitHub App bot identities', () => {
        expect(detectBotContributor('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com')).toBe(true);
        expect(detectBotContributor('github-actions[bot]', '41898282+github-actions[bot]@users.noreply.github.com')).toBe(true);
        expect(detectBotContributor('renovate[bot]', '29139614+renovate[bot]@users.noreply.github.com')).toBe(true);
        expect(detectBotContributor('some-app[bot]', 'noreply@github.com')).toBe(true);
    });

    it('flags known agent mailboxes', () => {
        expect(detectBotContributor('Claude', 'noreply@anthropic.com')).toBe(true);
        expect(detectBotContributor('Claude', 'claude@users.noreply.github.com')).toBe(true);
        expect(detectBotContributor('Substrate', 'bot@substrate.run')).toBe(true);
    });

    it('does not flag humans', () => {
        expect(detectBotContributor('Alice', 'alice@test.com')).toBe(false);
        expect(detectBotContributor('Andrea Griffiths', 'andrea@github.com')).toBe(false);
        expect(detectBotContributor(undefined, undefined)).toBe(false);
    });
});

describe('classifyContributor identity table', () => {
    it.each([
        ['Cursor Agent', 'cursoragent@cursor.com', 'Cursor'],
        ['Cursor Agent', 'agent@cursor.com', 'Cursor'],
        ['devin-ai-integration[bot]', 'devin-ai-integration@users.noreply.github.com', 'Devin'],
        ['chatgpt-codex-connector[bot]', '12345+chatgpt-codex-connector[bot]@users.noreply.github.com', 'OpenAI Codex'],
        ['google-labs-jules[bot]', '12345+google-labs-jules[bot]@users.noreply.github.com', 'Google Jules'],
        ['amazon-q-developer[bot]', '12345+amazon-q-developer[bot]@users.noreply.github.com', 'Amazon Q'],
        ['opencode', 'noreply@opencode.ai', 'OpenCode'],
        ['openhands', 'openhands@all-hands.dev', 'OpenHands'],
        ['aider', 'noreply@aider.chat', 'Aider'],
        ['Copilot', '223556219+Copilot@users.noreply.github.com', 'GitHub Copilot'],
        ['copilot-swe-agent[bot]', '198982749+copilot-swe-agent[bot]@users.noreply.github.com', 'GitHub Copilot'],
    ])('classifies %s <%s> as ai-agent (%s)', (name, email, agentName) => {
        const result = classifyContributor(name, email);
        expect(result.kind).toBe('ai-agent');
        expect(result.agentName).toBe(agentName);
        expect(result.confidence).toBe('high');
    });

    it.each([
        ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com', 'Dependabot'],
        ['renovate[bot]', '29139614+renovate[bot]@users.noreply.github.com', 'Renovate'],
        ['github-actions', 'actions@github.com', 'GitHub Actions'],
    ])('classifies %s as automation-bot (%s)', (name, email, agentName) => {
        const result = classifyContributor(name, email);
        expect(result.kind).toBe('automation-bot');
        expect(result.agentName).toBe(agentName);
    });

    it('classifies unknown [bot] identities as automation-bot with medium confidence', () => {
        const result = classifyContributor('some-future-tool[bot]', '999+some-future-tool[bot]@users.noreply.github.com');
        expect(result.kind).toBe('automation-bot');
        expect(result.confidence).toBe('medium');
    });

    it('classifies plain humans as human', () => {
        const result = classifyContributor('Alice', 'alice@test.com');
        expect(result.kind).toBe('human');
        expect(result.agentName).toBeUndefined();
    });
});

describe('classifyContributor options', () => {
    it('honors additionalBotPatterns', () => {
        const result = classifyContributor('deploy-bot', 'deploys@mycorp.com', undefined, {
            additionalBotPatterns: ['deploys@mycorp.com'],
        });
        expect(result.kind).toBe('automation-bot');
        expect(result.signals[0]).toContain('custom-pattern');
    });

    it('honors humanOverrides over identity matches', () => {
        const result = classifyContributor('Cursor Agent', 'cursoragent@cursor.com', undefined, {
            humanOverrides: ['cursoragent@cursor.com'],
        });
        expect(result.kind).toBe('human');
    });

    it('uses process-wide options set via setBotDetectionOptions', () => {
        setBotDetectionOptions({ additionalBotPatterns: ['ci@internal.corp'] });
        expect(classifyContributor('CI', 'ci@internal.corp').kind).toBe('automation-bot');
    });
});

describe('detectCommitAgentSignals', () => {
    it('detects agent co-authors', () => {
        const commit = makeCommit({
            coAuthors: [{ name: 'Claude', email: 'noreply@anthropic.com' }],
        });
        const result = detectCommitAgentSignals(commit);
        expect(result.assisted).toBe(true);
        expect(result.agents).toContain('Claude Code');
    });

    it('detects Copilot co-authors on human-authored commits', () => {
        const commit = makeCommit({
            coAuthors: [{ name: 'Copilot', email: '223556219+Copilot@users.noreply.github.com' }],
        });
        const result = detectCommitAgentSignals(commit);
        expect(result.assisted).toBe(true);
        expect(result.agents).toContain('GitHub Copilot');
    });

    it('detects checkpoint trailers', () => {
        const result = detectCommitAgentSignals(makeCommit({ checkpointId: '8a513f56ed70' }));
        expect(result.assisted).toBe(true);
        expect(result.signals).toContain('checkpoint');
    });

    it('detects the aider subject marker', () => {
        const result = detectCommitAgentSignals(makeCommit({ message: 'fix parser (aider)' }));
        expect(result.assisted).toBe(true);
        expect(result.agents).toContain('Aider');
    });

    it('reports human commits as unassisted', () => {
        const result = detectCommitAgentSignals(makeCommit({ coAuthors: [{ name: 'Bob', email: 'bob@test.com' }] }));
        expect(result.assisted).toBe(false);
        expect(result.agents).toEqual([]);
    });
});

describe('classifyContributor with commits (ai-assisted-human)', () => {
    const claudeCoAuthor = { name: 'Claude', email: 'noreply@anthropic.com' };

    it('upgrades a human with frequent agent co-authors to ai-assisted-human', () => {
        const commits = [
            makeCommit({ coAuthors: [claudeCoAuthor] }),
            makeCommit({ coAuthors: [claudeCoAuthor] }),
            makeCommit({}),
            makeCommit({}),
        ];
        const result = classifyContributor('Alice', 'alice@test.com', commits);
        expect(result.kind).toBe('ai-assisted-human');
        expect(result.aiAssistRate).toBe(0.5);
        expect(result.agentName).toContain('Claude Code');
    });

    it('keeps a mostly-solo human as human but reports the rate', () => {
        const commits = [
            makeCommit({ coAuthors: [claudeCoAuthor] }),
            ...Array.from({ length: 9 }, () => makeCommit({})),
        ];
        const result = classifyContributor('Alice', 'alice@test.com', commits);
        expect(result.kind).toBe('human');
        expect(result.aiAssistRate).toBeCloseTo(0.1);
    });

    it('never downgrades an ai-assisted human to bot in detectBotContributor semantics', () => {
        expect(detectBotContributor('Alice', 'alice@test.com')).toBe(false);
    });
});
