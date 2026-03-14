import * as fs from 'fs';
import * as path from 'path';

export interface ExportOptions {
    /** Directory to write the report into. Defaults to cwd. */
    outputDir?: string;
    /** Custom file name (without extension). Defaults to a timestamped name. */
    fileName?: string;
    /** Pretty-print the JSON output. Defaults to true. */
    pretty?: boolean;
}

/**
 * Exports an analysis result object to a JSON file on disk.
 *
 * @param result  The analysis result to serialise (any shape).
 * @param options Optional export settings.
 * @returns The absolute path of the written file.
 */
export function exportAnalysisToJson(
    result: Record<string, unknown>,
    options: ExportOptions = {},
): string {
    const dir = options.outputDir ?? process.cwd();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = options.fileName ?? `teamxray-report-${timestamp}`;
    const filePath = path.join(dir, `${baseName}.json`);

    const indent = options.pretty !== false ? 2 : undefined;
    const data = JSON.stringify(result, null, indent);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data, 'utf-8');

    return filePath;
}
