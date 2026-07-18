/**
 * Shared git log format and parser used by both the extension host
 * (GitService) and the worker thread (git-worker). Must NOT import 'vscode'.
 *
 * Records are NUL-delimited fields terminated by an ASCII Record Separator
 * (0x1E), so author names or subjects containing '|' can never shift fields.
 * Trailers are extracted by git itself via %(trailers:key=...), which keeps
 * the transferred data small while exposing agent attribution signals:
 * Co-authored-by lines and checkpoint/attribution trailers.
 */

export interface ParsedCoAuthor {
    name: string;
    email: string;
}

export interface ParsedCommit {
    sha: string;
    author: { name: string; email: string };
    message: string;
    date: string;
    files: string[];
    coAuthors: ParsedCoAuthor[];
    checkpointId?: string;
    attribution?: string;
}

const FIELD_SEP = '\x00';
const RECORD_SEP = '\x1e';

// %aN/%aE respect .mailmap so contributors with multiple identities merge;
// %aI is strict ISO 8601. Trailer key matching is case-insensitive in git,
// so this catches both "Co-authored-by" and "Co-Authored-By".
export const COMMIT_LOG_FORMAT =
    '%H%x00%aN%x00%aE%x00%aI%x00%s' +
    '%x00%(trailers:key=Co-authored-by,unfold,valueonly,separator=%x3B)' +
    '%x00%(trailers:key=Entire-Checkpoint,unfold,valueonly,separator=%x3B)' +
    '%x00%(trailers:key=Entire-Attribution,unfold,valueonly,separator=%x3B)' +
    '%x1e';

// Variant for logs that append per-commit file lists (--name-only). Files
// follow the metadata line inside each sentinel-delimited block.
export const COMMIT_BLOCK_SENTINEL = '__TEAMXRAY_COMMIT__';
export const COMMIT_LOG_FORMAT_WITH_FILES =
    `${COMMIT_BLOCK_SENTINEL}%n` +
    '%H%x00%aN%x00%aE%x00%aI%x00%s' +
    '%x00%(trailers:key=Co-authored-by,unfold,valueonly,separator=%x3B)' +
    '%x00%(trailers:key=Entire-Checkpoint,unfold,valueonly,separator=%x3B)' +
    '%x00%(trailers:key=Entire-Attribution,unfold,valueonly,separator=%x3B)';

/** Parse a "Name <email>" co-author value. Returns null for malformed values. */
export function parseCoAuthorValue(value: string): ParsedCoAuthor | null {
    const match = value.trim().match(/^(.*?)\s*<([^<>]+)>$/);
    if (!match) {
        return null;
    }
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
}

function commitFromFields(fields: string[], files: string[]): ParsedCommit | null {
    if (fields.length < 5 || !fields[0]) {
        return null;
    }

    const coAuthors = (fields[5] ?? '')
        .split(';')
        .map(v => parseCoAuthorValue(v))
        .filter((v): v is ParsedCoAuthor => v !== null);

    const checkpointId = (fields[6] ?? '').split(';')[0].trim();
    const attribution = (fields[7] ?? '').split(';')[0].trim();

    return {
        sha: fields[0],
        author: { name: fields[1], email: fields[2] },
        date: fields[3],
        message: fields[4],
        files,
        coAuthors,
        checkpointId: checkpointId || undefined,
        attribution: attribution || undefined,
    };
}

/** Parse output produced with COMMIT_LOG_FORMAT (no file lists). */
export function parseCommitLog(output: string): ParsedCommit[] {
    return output
        .split(RECORD_SEP)
        .map(record => record.replace(/^[\r\n]+/, ''))
        .filter(record => record.length > 0)
        .map(record => commitFromFields(record.split(FIELD_SEP), []))
        .filter((commit): commit is ParsedCommit => commit !== null);
}

/** Parse output produced with COMMIT_LOG_FORMAT_WITH_FILES (--name-only). */
export function parseCommitLogWithFiles(output: string): ParsedCommit[] {
    return output
        .split(COMMIT_BLOCK_SENTINEL)
        .map(block => block.trim())
        .filter(block => block.length > 0)
        .map(block => {
            const [metadataLine, ...fileLines] = block
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            if (!metadataLine) {
                return null;
            }
            return commitFromFields(metadataLine.split(FIELD_SEP), fileLines);
        })
        .filter((commit): commit is ParsedCommit => commit !== null);
}
