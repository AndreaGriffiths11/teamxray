import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import {
    COMMIT_LOG_FORMAT,
    parseCoAuthorValue,
    parseCommitLog,
    parseCommitLogWithFiles,
    COMMIT_BLOCK_SENTINEL,
} from '../git-log-format';

const NUL = '\x00';
const RS = '\x1e';

function record(fields: string[]): string {
    return fields.join(NUL) + RS;
}

describe('parseCoAuthorValue', () => {
    it('parses standard values', () => {
        expect(parseCoAuthorValue('Claude <noreply@anthropic.com>')).toEqual({
            name: 'Claude',
            email: 'noreply@anthropic.com',
        });
    });

    it('lowercases emails and trims whitespace', () => {
        expect(parseCoAuthorValue('  Copilot  <175728472+Copilot@users.noreply.github.com> ')).toEqual({
            name: 'Copilot',
            email: '175728472+copilot@users.noreply.github.com',
        });
    });

    it('returns null for malformed values', () => {
        expect(parseCoAuthorValue('no email here')).toBeNull();
        expect(parseCoAuthorValue('')).toBeNull();
    });
});

describe('parseCommitLog', () => {
    it('parses records with trailers', () => {
        const output = record([
            'a'.repeat(40),
            'Alice',
            'alice@test.com',
            '2026-07-01T10:00:00+00:00',
            'feat: something',
            'Claude <noreply@anthropic.com>',
            '8a513f56ed70',
            'agent:80',
        ]);
        const commits = parseCommitLog(output);
        expect(commits).toHaveLength(1);
        expect(commits[0].author).toEqual({ name: 'Alice', email: 'alice@test.com' });
        expect(commits[0].coAuthors).toEqual([{ name: 'Claude', email: 'noreply@anthropic.com' }]);
        expect(commits[0].checkpointId).toBe('8a513f56ed70');
        expect(commits[0].attribution).toBe('agent:80');
    });

    it('handles author names and subjects containing pipes and multiple co-authors', () => {
        const output = record([
            'b'.repeat(40),
            'Weird | Name',
            'weird@test.com',
            '2026-07-01T10:00:00+00:00',
            'fix: a | b | c',
            'Claude <noreply@anthropic.com>;Copilot <1+Copilot@users.noreply.github.com>',
            '',
            '',
        ]);
        const commits = parseCommitLog(output);
        expect(commits[0].author.name).toBe('Weird | Name');
        expect(commits[0].message).toBe('fix: a | b | c');
        expect(commits[0].coAuthors).toHaveLength(2);
        expect(commits[0].checkpointId).toBeUndefined();
    });

    it('parses multiple newline-separated records', () => {
        const output =
            record(['a'.repeat(40), 'A', 'a@t.com', '2026-07-01T10:00:00+00:00', 'one', '', '', '']) +
            '\n' +
            record(['b'.repeat(40), 'B', 'b@t.com', '2026-07-02T10:00:00+00:00', 'two', '', '', '']);
        expect(parseCommitLog(output)).toHaveLength(2);
    });
});

describe('parseCommitLogWithFiles', () => {
    it('associates file lists with their commit', () => {
        const fields = ['c'.repeat(40), 'A', 'a@t.com', '2026-07-01T10:00:00+00:00', 'touch files', '', '', ''].join(NUL);
        const output = `${COMMIT_BLOCK_SENTINEL}\n${fields}\nsrc/a.ts\nsrc/b.ts\n`;
        const commits = parseCommitLogWithFiles(output);
        expect(commits).toHaveLength(1);
        expect(commits[0].files).toEqual(['src/a.ts', 'src/b.ts']);
    });
});

describe('integration with real git', () => {
    it('round-trips through an actual git log invocation', () => {
        let output: string;
        try {
            output = execFileSync('git', ['log', `--pretty=format:${COMMIT_LOG_FORMAT}`, '-n', '5'], {
                encoding: 'utf8',
                timeout: 10_000,
            });
        } catch {
            return; // not a git checkout (e.g. tarball CI) — nothing to verify
        }
        const commits = parseCommitLog(output);
        expect(commits.length).toBeGreaterThan(0);
        for (const commit of commits) {
            expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
            expect(commit.author.email).toContain('@');
            expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
    });
});
