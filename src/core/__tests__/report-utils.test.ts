import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { Expert, FileExpertise } from '../../types/expert';
import type { ExpertiseAnalysis } from '../expertise-analyzer';
import {
    escapeCsvCell,
    escapeHtml,
    indexFilesByExpert,
    normalizeCount,
    normalizePercentage,
    normalizeRatio,
    serializeForInlineScript,
} from '../report-utils';
import { ExpertiseWebviewProvider } from '../expertise-webview';

vi.mock('vscode', () => ({}));

interface WebviewProviderInternals {
    generateCSV(): { experts: string; files: string; managementInsights?: string };
    generateStandaloneHTML(): string;
    getWebviewContent(analysis: ExpertiseAnalysis, cspSource: string): string;
}

function makeExpert(name: string): Expert {
    return {
        name,
        email: `${name.toLowerCase()}@example.com`,
        expertise: 50,
        contributions: 1,
        lastCommit: new Date('2026-08-12T00:00:00Z'),
        specializations: [],
        communicationStyle: 'technical',
        teamRole: 'contributor',
        hiddenStrengths: [],
        idealChallenges: [],
    };
}

function makeAnalysis(value: string): ExpertiseAnalysis {
    const expert = makeExpert(value);
    const file: FileExpertise = {
        fileName: value,
        filePath: `src/${value}`,
        experts: [expert],
        lastModified: new Date('2026-08-12T00:00:00Z'),
        changeFrequency: 2,
    };

    return {
        repository: value,
        timestamp: new Date('2026-08-12T00:00:00Z'),
        experts: [expert],
        fileExpertise: [file],
        insights: [{
            type: 'risk',
            title: value,
            description: value,
            impact: 'high',
            recommendations: [value],
        }],
        stats: {
            totalFiles: 1,
            totalCommits: 1,
            totalContributors: 1,
            languages: { TypeScript: 1 },
            recentActivity: 1,
            primaryLanguages: ['TypeScript'],
            recentActivityLevel: 'low',
            repositorySize: 'small',
        },
        totalFiles: 1,
        totalExperts: 1,
        expertProfiles: [expert],
        generatedAt: new Date('2026-08-12T00:00:00Z'),
        managementInsights: [{
            category: 'RISK',
            priority: 'HIGH',
            title: value,
            description: value,
            actionItems: [value],
            timeline: '1-2 weeks',
            impact: value,
        }],
    };
}

function getInternals(provider: ExpertiseWebviewProvider): WebviewProviderInternals {
    return provider as unknown as WebviewProviderInternals;
}

describe('report utilities', () => {
    it('escapes report text for HTML and attribute contexts', () => {
        expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
    });

    it('serializes inline data without allowing a closing script tag', () => {
        const value = serializeForInlineScript({
            name: '</script><script>alert(1)</script>',
        });

        expect(value).not.toContain('</script>');
        expect(value).toContain('\\u003c/script\\u003e');
    });

    it('escapes CSV quotes and neutralizes spreadsheet formulas', () => {
        expect(escapeCsvCell('said "hello"')).toBe('"said ""hello"""');
        expect(escapeCsvCell('=SUM(A1:A2)')).toBe("\"'=SUM(A1:A2)\"");
    });

    it('normalizes untrusted numeric values before rendering', () => {
        expect(normalizePercentage('42.5')).toBe(42.5);
        expect(normalizePercentage(-1)).toBe(0);
        expect(normalizePercentage(101)).toBe(100);
        expect(normalizePercentage('not-a-number')).toBe(0);

        expect(normalizeCount('12.9')).toBe(12);
        expect(normalizeCount(-1)).toBe(0);
        expect(normalizeCount(Infinity)).toBe(0);

        expect(normalizeRatio(0.25)).toBe(0.25);
        expect(normalizeRatio(-1)).toBe(0);
        expect(normalizeRatio(2)).toBe(1);
    });

    it('indexes each file once for every associated expert', () => {
        const alice = makeExpert('Alice');
        const bob = makeExpert('Bob');
        const sharedFile: FileExpertise = {
            fileName: 'shared.ts',
            filePath: 'src/shared.ts',
            experts: [alice, alice, bob],
            lastModified: new Date('2026-08-12T00:00:00Z'),
            changeFrequency: 2,
        };

        const filesByExpert = indexFilesByExpert([sharedFile]);

        expect(filesByExpert.get('Alice')).toEqual([sharedFile]);
        expect(filesByExpert.get('Bob')).toEqual([sharedFile]);
    });

    it('escapes untrusted report content in standalone and webview output', () => {
        const payload = '</script><script>window.pwned=true</script>';
        const analysis = makeAnalysis(payload);
        const provider = new ExpertiseWebviewProvider({} as vscode.ExtensionContext);
        const internals = getInternals(provider);

        provider.setCurrentAnalysis(analysis);
        const standaloneReport = internals.generateStandaloneHTML();
        const webviewReport = internals.getWebviewContent(analysis, 'vscode-webview://test');

        expect(standaloneReport).not.toContain(payload);
        expect(standaloneReport).toContain('&lt;/script&gt;&lt;script&gt;window.pwned=true&lt;/script&gt;');
        expect(webviewReport).not.toContain(payload);
        expect(webviewReport).toContain('\\u003c/script\\u003e');
    });

    it('normalizes malformed numeric values before generating report markup', () => {
        const numericPayload = '0" onmouseover="window.pwned=true';
        const expert = {
            ...makeExpert('Alice'),
            expertise: numericPayload,
            contributions: numericPayload,
        } as unknown as Expert;
        const file = {
            fileName: 'safe.ts',
            filePath: 'src/safe.ts',
            experts: [expert],
            lastModified: new Date('2026-08-12T00:00:00Z'),
            changeFrequency: numericPayload,
        } as unknown as FileExpertise;
        const analysis = {
            ...makeAnalysis('safe'),
            totalFiles: numericPayload,
            experts: [expert],
            expertProfiles: [expert],
            fileExpertise: [file],
        } as unknown as ExpertiseAnalysis;
        const provider = new ExpertiseWebviewProvider({} as vscode.ExtensionContext);
        const internals = getInternals(provider);

        provider.setCurrentAnalysis(analysis);
        const standaloneReport = internals.generateStandaloneHTML();
        const webviewReport = internals.getWebviewContent(analysis, 'vscode-webview://test');
        const csv = internals.generateCSV();

        expect(standaloneReport).not.toContain(numericPayload);
        expect(standaloneReport).toContain('<rect width="0"');
        expect(webviewReport).toContain('data-expertise="0"');
        expect(webviewReport).toContain('data-contributions="0"');
        expect(webviewReport).toContain('style="width:0%"');
        expect(webviewReport).toContain('🔄 0');
        expect(csv.experts).toContain(',0,0,');
        expect(csv.files).toContain(',1,"Alice",0');
    });

    it('constrains avatar usernames derived from GitHub-style email addresses', () => {
        const expert = {
            ...makeExpert('Alice'),
            email: 'evil" onerror="alert(1)@github.com',
        };
        const baseAnalysis = makeAnalysis('safe');
        const analysis: ExpertiseAnalysis = {
            ...baseAnalysis,
            experts: [expert],
            expertProfiles: [expert],
            fileExpertise: [{
                ...baseAnalysis.fileExpertise[0],
                experts: [expert],
            }],
        };
        const provider = new ExpertiseWebviewProvider({} as vscode.ExtensionContext);
        const internals = getInternals(provider);

        const webviewReport = internals.getWebviewContent(analysis, 'vscode-webview://test');
        const avatarSource = webviewReport.match(/<img src="([^"]*)"/)?.[1];

        expect(avatarSource).toBe('https://github.com/evilonerroralert1.png?size=96');
    });
});
