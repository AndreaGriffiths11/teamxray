import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn(() => undefined),
        })),
    },
    window: {
        createOutputChannel: vi.fn(() => ({
            appendLine: vi.fn(),
            show: vi.fn(),
        })),
    },
}));

// Mock the Copilot SDK — we don't actually connect to a CLI in tests
vi.mock('@github/copilot-sdk', () => ({
    CopilotClient: vi.fn(),
    CopilotSession: vi.fn(),
    defineTool: vi.fn((name: string, config: any) => ({
        name,
        description: config.description,
        parameters: config.parameters,
        handler: config.handler,
    })),
    approveAll: vi.fn(),
}));

vi.mock('zod', async () => {
    const actual = await vi.importActual('zod');
    return actual;
});

import { CopilotService } from '../copilot-service';
import type { RepositoryData, RepositoryStats } from '../../types/expert';

/**
 * Helper to access private methods for testing via type assertion.
 */
function getPrivate(service: CopilotService): any {
    return service as any;
}

function makeOutputChannel() {
    return {
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
    } as any;
}

function makeStats(overrides: Partial<RepositoryStats> = {}): RepositoryStats {
    return {
        totalFiles: 100,
        totalCommits: 500,
        totalContributors: 10,
        languages: { ts: 60, js: 30 },
        recentActivity: 20,
        primaryLanguages: ['TypeScript', 'JavaScript'],
        recentActivityLevel: 'medium',
        repositorySize: 'medium',
        ...overrides,
    };
}

function makeRepoData(overrides: Partial<RepositoryData> = {}): RepositoryData {
    return {
        repository: 'test-org/test-repo',
        files: ['src/index.ts', 'src/utils.ts'],
        commits: [
            {
                sha: 'abc123',
                author: { name: 'Alice', email: 'alice@test.com' },
                message: 'feat: add utils',
                date: '2025-05-01',
                files: ['src/utils.ts'],
            },
            {
                sha: 'def456',
                author: { name: 'Bob', email: 'bob@test.com' },
                message: 'fix: index bug',
                date: '2025-05-02',
                files: ['src/index.ts'],
            },
        ],
        contributors: [
            {
                name: 'Alice',
                email: 'alice@test.com',
                commits: 30,
                additions: 1000,
                deletions: 200,
                firstCommit: '2024-01-01',
                lastCommit: '2025-05-01',
            },
            {
                name: 'Bob',
                email: 'bob@test.com',
                commits: 20,
                additions: 500,
                deletions: 100,
                firstCommit: '2024-06-01',
                lastCommit: '2025-05-02',
            },
        ],
        stats: makeStats(),
        collaborationData: {
            teamSize: 2,
            communicationPatterns: [],
            knowledgeSharing: [],
            expertiseDistribution: [],
        },
        ...overrides,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('CopilotService', () => {
    let service: CopilotService;

    beforeEach(() => {
        const mockSecretStorage = {
            get: async () => undefined,
            store: async () => {},
            delete: async () => {},
            onDidChange: () => ({ dispose: () => {} }),
        } as any;
        service = new CopilotService(makeOutputChannel(), mockSecretStorage);
    });

    describe('isAvailable', () => {
        it('returns false before initialization', () => {
            expect(service.isAvailable()).toBe(false);
        });
    });

    describe('extractJSON (private)', () => {
        const extract = (text: string) => getPrivate(service).extractJSON(text);

        it('extracts JSON from fenced code block', () => {
            const input = 'Here is the result:\n```json\n{"a": 1}\n```\nDone.';
            expect(extract(input)).toBe('{"a": 1}');
        });

        it('extracts JSON from fenced block without language', () => {
            const input = '```\n{"key": "value"}\n```';
            expect(extract(input)).toBe('{"key": "value"}');
        });

        it('extracts raw JSON object', () => {
            const input = 'The analysis is: {"experts": []}. That is all.';
            expect(extract(input)).toBe('{"experts": []}');
        });

        it('extracts raw JSON array when no object is present', () => {
            const input = 'Experts: ["Alice", "Bob"]';
            expect(extract(input)).toBe('["Alice", "Bob"]');
        });

        it('returns null for text with no JSON', () => {
            expect(extract('No JSON here')).toBeNull();
        });
    });

    describe('mapExpert (private)', () => {
        const mapExpert = (e: any) => getPrivate(service).mapExpert(e);

        it('maps a complete expert object', () => {
            const input = {
                name: 'Alice',
                email: 'alice@test.com',
                expertise: 0.85,
                contributions: 30,
                lastCommit: '2025-05-01T00:00:00Z',
                specializations: ['TypeScript', 'React'],
                communicationStyle: 'collaborative',
                teamRole: 'lead',
                hiddenStrengths: ['mentoring'],
                idealChallenges: ['architecture'],
                workloadIndicator: 'balanced',
                collaborationStyle: 'mentoring',
                riskFactors: ['key person risk'],
            };

            const result = mapExpert(input);
            expect(result.name).toBe('Alice');
            expect(result.email).toBe('alice@test.com');
            expect(result.expertise).toBe(0.85);
            expect(result.specializations).toEqual(['TypeScript', 'React']);
            expect(result.workloadIndicator).toBe('balanced');
            expect(result.riskFactors).toEqual(['key person risk']);
        });

        it('provides defaults for missing fields', () => {
            const result = mapExpert({});
            expect(result.name).toBe('Unknown');
            expect(result.email).toBe('');
            expect(result.expertise).toBe(0.5);
            expect(result.contributions).toBe(0);
            expect(result.specializations).toEqual([]);
            expect(result.communicationStyle).toBe('technical');
            expect(result.teamRole).toBe('contributor');
        });
    });

    describe('buildMinimalAnalysis (private)', () => {
        it('builds expert profiles from contributor data', () => {
            const data = makeRepoData();
            const stats = makeStats();
            const result = getPrivate(service).buildMinimalAnalysis(data, stats);

            expect(result.repository).toBe('test-org/test-repo');
            expect(result.experts).toHaveLength(2);
            expect(result.experts[0].name).toBe('Alice');
            expect(result.experts[0].expertise).toBeCloseTo(30 / 500, 2);
            expect(result.insights[0].type).toBe('gap');
            expect(result.insights[0].title).toContain('incomplete');
        });

        it('handles empty contributors', () => {
            const data = makeRepoData({ contributors: [] });
            const stats = makeStats({ totalCommits: 0 });
            const result = getPrivate(service).buildMinimalAnalysis(data, stats);

            expect(result.experts).toHaveLength(0);
            expect(result.totalExperts).toBe(0);
        });
    });

    describe('mapToExpertiseAnalysis (private)', () => {
        const data = makeRepoData();
        const stats = makeStats();

        it('maps a full AI response to ExpertiseAnalysis', () => {
            const raw = {
                experts: [
                    {
                        name: 'Alice',
                        email: 'alice@test.com',
                        expertise: 0.9,
                        contributions: 30,
                        lastCommit: '2025-05-01',
                        specializations: ['TypeScript'],
                        communicationStyle: 'direct',
                        teamRole: 'lead',
                        hiddenStrengths: ['architecture'],
                        idealChallenges: ['scaling'],
                    },
                ],
                fileExpertise: [
                    {
                        fileName: 'index.ts',
                        filePath: 'src/index.ts',
                        experts: [],
                        lastModified: '2025-05-01',
                        changeFrequency: 5,
                    },
                ],
                insights: [
                    {
                        type: 'strength',
                        title: 'Strong TS team',
                        description: 'Good TypeScript coverage',
                        impact: 'high',
                        recommendations: ['Keep it up'],
                    },
                ],
                managementInsights: [
                    {
                        category: 'OPPORTUNITY',
                        priority: 'MEDIUM',
                        title: 'Cross-training',
                        description: 'Good potential',
                        actionItems: ['Pair programming'],
                        timeline: '1 month',
                        impact: 'Increases bus factor',
                    },
                ],
                teamDynamics: {
                    collaborationPatterns: ['pair programming'],
                    communicationHighlights: ['async-first'],
                    knowledgeSharing: ['good docs'],
                },
                teamHealthMetrics: {
                    knowledgeDistribution: {
                        criticalAreas: ['payments'],
                        singlePointsOfFailure: ['Alice'],
                        wellDistributed: ['frontend'],
                        riskScore: 40,
                    },
                    collaborationMetrics: {
                        crossTeamWork: 0.7,
                        codeReviewParticipation: 0.8,
                        knowledgeSharing: 0.6,
                        siloedMembers: [],
                    },
                    performanceIndicators: {
                        averageReviewTime: '4 hours',
                        deploymentFrequency: '3/week',
                        blockers: [],
                    },
                },
            };

            const result = getPrivate(service).mapToExpertiseAnalysis(raw, data, stats);

            expect(result.repository).toBe('test-org/test-repo');
            expect(result.experts).toHaveLength(1);
            expect(result.experts[0].name).toBe('Alice');
            expect(result.fileExpertise).toHaveLength(1);
            expect(result.insights).toHaveLength(1);
            expect(result.managementInsights).toHaveLength(1);
            expect(result.teamDynamics?.collaborationPatterns).toEqual(['pair programming']);
            expect(result.teamHealthMetrics?.knowledgeDistribution.riskScore).toBe(40);
        });

        it('handles empty/missing fields gracefully', () => {
            const result = getPrivate(service).mapToExpertiseAnalysis({}, data, stats);

            expect(result.experts).toEqual([]);
            expect(result.fileExpertise).toEqual([]);
            expect(result.insights).toEqual([]);
            expect(result.managementInsights).toEqual([]);
        });
    });

    describe('parseExpertsFromResponse (private)', () => {
        const parse = (content: string) => getPrivate(service).parseExpertsFromResponse({
            data: { content },
        });

        it('parses experts from a JSON array response', () => {
            const content = '```json\n[{"name": "Alice", "email": "a@t.com", "expertise": 0.9}]\n```';
            const result = parse(content);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Alice');
        });

        it('parses experts from object with experts key', () => {
            const content = '{"experts": [{"name": "Bob"}]}';
            const result = parse(content);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Bob');
        });

        it('returns empty array for unparseable content', () => {
            expect(parse('No JSON here')).toEqual([]);
        });
    });

    describe('buildTools (private)', () => {
        it('creates 5 tools with correct names', () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);

            expect(tools).toHaveLength(5);
            const names = tools.map((t: any) => t.name);
            expect(names).toContain('get_contributors');
            expect(names).toContain('get_recent_commits');
            expect(names).toContain('get_file_experts');
            expect(names).toContain('get_repo_stats');
            expect(names).toContain('get_collaboration_patterns');
        });

        it('get_contributors tool returns contributor data', async () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);
            const contributorsTool = tools.find((t: any) => t.name === 'get_contributors');

            const result = await contributorsTool.handler({});
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].name).toBe('Alice');
        });

        it('get_recent_commits tool filters by author', async () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);
            const commitsTool = tools.find((t: any) => t.name === 'get_recent_commits');

            const result = await commitsTool.handler({ author: 'alice' });
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].author.name).toBe('Alice');
        });

        it('get_recent_commits tool respects limit', async () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);
            const commitsTool = tools.find((t: any) => t.name === 'get_recent_commits');

            const result = await commitsTool.handler({ limit: 1 });
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(1);
        });

        it('get_file_experts tool finds experts for a file', async () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);
            const fileExpertsTool = tools.find((t: any) => t.name === 'get_file_experts');

            const result = await fileExpertsTool.handler({ file_path: 'src/utils.ts' });
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].name).toBe('Alice');
        });

        it('get_repo_stats tool returns stats', async () => {
            const data = makeRepoData();
            const stats = makeStats();
            const tools = getPrivate(service).buildTools(data, stats);
            const statsTool = tools.find((t: any) => t.name === 'get_repo_stats');

            const result = await statsTool.handler({});
            const parsed = JSON.parse(result);
            expect(parsed.totalFiles).toBe(100);
            expect(parsed.repositorySize).toBe('medium');
        });
    });

    describe('getProviderConfig (private)', () => {
        it('returns undefined for default copilot provider', () => {
            const result = getPrivate(service).getProviderConfig();
            expect(result).toBeUndefined();
        });
    });
});
