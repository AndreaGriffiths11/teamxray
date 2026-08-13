import type { FileExpertise } from '../types/expert';

const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const INLINE_SCRIPT_ENTITIES: Record<string, string> = {
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
};

/**
 * Escapes values interpolated into report HTML text and attribute contexts.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
}

/**
 * Serializes report data for an inline script without allowing a closing script tag.
 */
export function serializeForInlineScript(value: unknown): string {
    const serialized = JSON.stringify(value) ?? 'null';
    return serialized.replace(/[<>&\u2028\u2029]/g, character => INLINE_SCRIPT_ENTITIES[character]);
}

/**
 * Escapes a CSV cell and prevents spreadsheet applications from evaluating formulas.
 */
export function escapeCsvCell(value: unknown): string {
    const text = String(value ?? '');
    const protectedText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replace(/"/g, '""')}"`;
}

/**
 * Builds the file ownership lookup used by every expert card in a report.
 */
export function indexFilesByExpert(files: readonly FileExpertise[]): Map<string, FileExpertise[]> {
    const filesByExpert = new Map<string, FileExpertise[]>();

    for (const file of files) {
        const expertNames = new Set(file.experts.map(expert => expert.name));

        for (const expertName of expertNames) {
            const expertFiles = filesByExpert.get(expertName);
            if (expertFiles) {
                expertFiles.push(file);
            } else {
                filesByExpert.set(expertName, [file]);
            }
        }
    }

    return filesByExpert;
}
