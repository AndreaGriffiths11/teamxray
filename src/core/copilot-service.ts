import * as vscode from 'vscode';
// @github/copilot-sdk is ESM-only — use webpackIgnore so webpack leaves the
// import() call intact and Node.js performs a real ESM import at runtime.
let _sdk: typeof import('@github/copilot-sdk') | null = null;
async function loadSdk(): Promise<typeof import('@github/copilot-sdk')> {
    if (!_sdk) {
        _sdk = await import(/* webpackIgnore: true */ '@github/copilot-sdk');
    }
    return _sdk;
}
import type {
    AssistantMessageEvent,
    SessionConfig,
    Tool,
} from '@github/copilot-sdk';
import { z } from 'zod';
import type {
    Expert,
    FileExpertise,
    RepositoryData,
    RepositoryStats,
    TeamInsight,
} from '../types/expert';
import type { ExpertiseAnalysis } from './expertise-analyzer';

/** BYOK provider configuration — matches the SDK's ProviderConfig shape. */
interface ProviderConfig {
    type?: 'openai' | 'azure' | 'anthropic';
    baseUrl: string;
    apiKey?: string;
}

/**
 * CopilotService wraps the Copilot SDK to provide AI-powered team analysis.
 *
 * Replaces direct GitHub Models API calls with the Copilot CLI runtime,
 * exposing custom tools that let the agent pull repository data on demand.
 */
export class CopilotService {
    private client: InstanceType<(typeof import('@github/copilot-sdk'))['CopilotClient']> | null = null;
    private outputChannel: vscode.OutputChannel;
    private secretStorage: vscode.SecretStorage;
    private _available = false;

    constructor(outputChannel: vscode.OutputChannel, secretStorage: vscode.SecretStorage) {
        this.outputChannel = outputChannel;
        this.secretStorage = secretStorage;
    }

    /** Whether the Copilot CLI was successfully initialized. */
    isAvailable(): boolean {
        return this._available && this.client !== null;
    }

    /**
     * Start the CopilotClient. Call once during extension activation.
     * If the CLI is missing or auth fails, _available stays false and the
     * extension falls back to other providers.
     */
    async initialize(): Promise<void> {
        try {
            const opts: Record<string, unknown> = {
                logLevel: 'warning' as const,
            };

            // If the user configured a GitHub token, pass it through.
            const config = vscode.workspace.getConfiguration('teamxray');
            const githubToken = config.get<string>('githubToken');
            if (githubToken) {
                opts.githubToken = githubToken;
            }

            // Resolve CLI path: user setting > PATH lookup > default SDK resolution
            const configuredCliPath = config.get<string>('cliPath');
            if (configuredCliPath) {
                opts.cliPath = configuredCliPath;
            } else {
                const resolvedPath = await this.findCliOnPath();
                if (resolvedPath) {
                    opts.cliPath = resolvedPath;
                }
            }

            const sdk = await loadSdk();
            this.client = new sdk.CopilotClient(opts);
            await this.client.start();

            // Quick health check
            await this.client.ping();
            this._available = true;
            this.outputChannel.appendLine('[CopilotService] Connected to Copilot CLI');
        } catch (err: unknown) {
            this._available = false;
            this.client = null;
            const msg = err instanceof Error ? err.message : String(err);
            this.outputChannel.appendLine(
                `[CopilotService] Copilot CLI not available: ${msg}`
            );
        }
    }

    /**
     * Attempt to locate the `copilot` binary on the system PATH.
     * Returns the absolute path if found, otherwise undefined.
     */
    private async findCliOnPath(): Promise<string | undefined> {
        try {
            const { execFile } = await import('child_process');
            const { promisify } = await import('util');
            const execFileAsync = promisify(execFile);
            const { stdout } = await execFileAsync('which', ['copilot']);
            const resolved = stdout.trim();
            if (resolved) {
                this.outputChannel.appendLine(`[CopilotService] Found CLI at: ${resolved}`);
                return resolved;
            }
        } catch {
            // CLI not on PATH
        }
        return undefined;
    }

    /** Gracefully shut down the client. Call during extension deactivation. */
    async dispose(): Promise<void> {
        if (this.client) {
            try {
                await this.client.stop();
            } catch {
                // Best-effort
            }
            this.client = null;
            this._available = false;
        }
    }

    // ── Main analysis entry point ──────────────────────────────────────

    /**
     * Run a full team expertise analysis using the Copilot agent with custom
     * tools that expose the pre-gathered repository data.
     */
    async analyzeTeam(
        data: RepositoryData,
        repoStats: RepositoryStats
    ): Promise<ExpertiseAnalysis> {
        if (!this.client) {
            throw new Error('CopilotService is not initialized');
        }

        const tools = await this.buildTools(data, repoStats);
        const session = await this.createAnalysisSession(tools);

        try {
            // Log all session events for debugging
            session.on((event: any) => {
                this.outputChannel.appendLine(`[CopilotSDK] Event: ${event.type}${event.type === 'assistant.message' ? ' (content: ' + (event.data?.content?.substring(0, 100) ?? '') + '...)' : ''}`);
            });

            const prompt = this.buildAnalysisPrompt(data.repository, repoStats);
            const response = await session.sendAndWait(
                { prompt },
                180_000 // 3 minute timeout for large repos
            );

            if (!response) {
                throw new Error('No response from Copilot agent');
            }

            return this.parseAnalysisResponse(response, data, repoStats);
        } finally {
            await session.destroy();
        }
    }

    /**
     * Find experts for a specific file using the Copilot agent.
     */
    async analyzeFileExpert(
        filePath: string,
        data: RepositoryData
    ): Promise<Expert[]> {
        if (!this.client) {
            throw new Error('CopilotService is not initialized');
        }

        const tools = await this.buildTools(data, data.stats);
        const session = await this.createAnalysisSession(tools);

        try {
            // Log all session events for debugging
            session.on((event: any) => {
                this.outputChannel.appendLine(`[CopilotSDK] Event: ${event.type}${event.type === 'assistant.message' ? ' (content: ' + (event.data?.content?.substring(0, 100) ?? '') + '...)' : ''}`);
            });

            const prompt = [
                `Identify the top experts for the file "${filePath}".`,
                'Use the get_file_experts tool to retrieve contributor data for this file.',
                'Return a JSON array of Expert objects with name, email, expertise score (0-100),',
                'contributions count, specializations, communicationStyle, teamRole,',
                'hiddenStrengths, and idealChallenges.',
            ].join('\n');

            const response = await session.sendAndWait(
                { prompt },
                60_000
            );

            if (!response) {
                return [];
            }

            return this.parseExpertsFromResponse(response);
        } finally {
            await session.destroy();
        }
    }

    // ── Session creation ───────────────────────────────────────────────

    private async createAnalysisSession(tools: Tool<any>[]): Promise<InstanceType<(typeof import('@github/copilot-sdk'))['CopilotSession']>> {
        if (!this.client) {
            throw new Error('CopilotService is not initialized');
        }

        const providerConfig = await this.getProviderConfig();

        const sessionConfig: SessionConfig = {
            tools,
            onPermissionRequest: (await loadSdk()).approveAll,
            systemMessage: {
                mode: 'replace' as const,
                content: SYSTEM_MESSAGE,
            },
            // Let the agent use both custom and built-in tools — no restrictions
            // Disable infinite sessions — single-shot analysis
            infiniteSessions: { enabled: false },
        };

        if (providerConfig) {
            sessionConfig.provider = providerConfig;
        }

        const config = vscode.workspace.getConfiguration('teamxray');
        const model = config.get<string>('byokModel');
        if (model) {
            sessionConfig.model = model;
        }

        return this.client.createSession(sessionConfig);
    }

    // ── BYOK provider config ──────────────────────────────────────────

    private async getProviderConfig(): Promise<ProviderConfig | undefined> {
        const config = vscode.workspace.getConfiguration('teamxray');
        const provider = config.get<string>('aiProvider');

        if (!provider || provider === 'copilot' || provider === 'github-models') {
            return undefined; // Use default Copilot auth
        }

        const baseUrl = config.get<string>('byokBaseUrl');
        const apiKey = await this.secretStorage.get('teamxray.byokApiKey')
            ?? config.get<string>('byokApiKey'); // Fall back to settings for migration

        if (!baseUrl) {
            const warningMessage = `[CopilotService] BYOK provider "${provider}" is selected but teamxray.byokBaseUrl is not configured. Falling back to default Copilot auth.`;
            this.outputChannel.appendLine(warningMessage);
            vscode.window.showWarningMessage(
                `Team X-Ray: BYOK provider "${provider}" selected but Base URL is not configured. Set teamxray.byokBaseUrl in settings.`
            );
            return undefined;
        }

        const providerType = provider === 'byok-anthropic'
            ? 'anthropic' as const
            : provider === 'byok-azure'
                ? 'azure' as const
                : 'openai' as const;

        return {
            type: providerType,
            baseUrl,
            apiKey: apiKey || undefined,
        };
    }

    // ── Custom tools ──────────────────────────────────────────────────

    /**
     * Build the set of custom tools that expose pre-gathered repository data
     * to the Copilot agent. The data is captured in closures so the agent
     * can pull exactly what it needs during the conversation.
     */
    private async buildTools(data: RepositoryData, stats: RepositoryStats): Promise<Tool<any>[]> {
        const { defineTool } = await loadSdk();
        return [
            defineTool('get_contributors', {
                description: 'Get all git contributors with their commit counts, additions, deletions, and activity dates.',
                parameters: z.object({}),
                handler: async () => {
                    return JSON.stringify(data.contributors);
                },
            }),

            defineTool('get_recent_commits', {
                description: 'Get recent commits with author, message, date, and changed files. Optionally filter by author name.',
                parameters: z.object({
                    author: z.string().optional().describe('Filter commits by author name (case-insensitive partial match)'),
                    limit: z.number().optional().describe('Maximum number of commits to return (default 50)'),
                }),
                handler: async (args) => {
                    let commits = data.commits;
                    if (args.author) {
                        const query = args.author.toLowerCase();
                        commits = commits.filter(c =>
                            c.author.name.toLowerCase().includes(query) ||
                            c.author.email.toLowerCase().includes(query)
                        );
                    }
                    const limit = args.limit ?? 50;
                    return JSON.stringify(commits.slice(0, limit));
                },
            }),

            defineTool('get_file_experts', {
                description: 'Get contributors who have modified a specific file, with commit counts and change details.',
                parameters: z.object({
                    file_path: z.string().describe('Path of the file to find experts for'),
                }),
                handler: async (args) => {
                    const relevantCommits = data.commits.filter(c =>
                        c.files.some(f => f.includes(args.file_path) || args.file_path.includes(f))
                    );
                    const authorMap = new Map<string, { name: string; email: string; commits: number }>();
                    for (const commit of relevantCommits) {
                        const key = commit.author.email;
                        const existing = authorMap.get(key);
                        if (existing) {
                            existing.commits++;
                        } else {
                            authorMap.set(key, {
                                name: commit.author.name,
                                email: commit.author.email,
                                commits: 1,
                            });
                        }
                    }
                    const experts = Array.from(authorMap.values())
                        .sort((a, b) => b.commits - a.commits);
                    return JSON.stringify(experts);
                },
            }),

            defineTool('get_repo_stats', {
                description: 'Get repository statistics including total files, commits, contributors, languages, and activity level.',
                parameters: z.object({}),
                handler: async () => {
                    return JSON.stringify(stats);
                },
            }),

            defineTool('get_collaboration_patterns', {
                description: 'Get collaboration data including team size, communication patterns, knowledge sharing scores, and expertise distribution.',
                parameters: z.object({}),
                handler: async () => {
                    return JSON.stringify(data.collaborationData);
                },
            }),
        ];
    }

    // ── Prompt construction ───────────────────────────────────────────

    private buildAnalysisPrompt(repository: string, stats: RepositoryStats): string {
        return [
            `Analyze the team expertise for the repository "${repository}".`,
            '',
            `Repository overview: ${stats.totalFiles} files, ${stats.totalCommits} commits,`,
            `${stats.totalContributors} contributors. Primary languages: ${stats.primaryLanguages.join(', ')}.`,
            `Size category: ${stats.repositorySize}. Recent activity: ${stats.recentActivityLevel}.`,
            '',
            'Use the available tools to gather detailed data, then produce a JSON object with this structure:',
            '',
            '```json',
            '{',
            '  "experts": [{ "name", "email", "expertise" (0-100), "contributions", "lastCommit" (ISO date),',
            '    "specializations" (string[]), "communicationStyle", "teamRole",',
            '    "hiddenStrengths" (string[]), "idealChallenges" (string[]),',
            '    "workloadIndicator": "balanced"|"overloaded"|"underutilized",',
            '    "collaborationStyle": "independent"|"collaborative"|"mentoring",',
            '    "riskFactors": string[],',
            '    NOTE: expertise is 0-100, NOT 0-1 }],',
            '  "fileExpertise": [{ "fileName", "filePath", "experts" (top 3 Expert objects),',
            '    "lastModified" (ISO date), "changeFrequency" }],',
            '  "insights": [{ "type": "strength"|"gap"|"opportunity"|"risk",',
            '    "title", "description", "impact": "high"|"medium"|"low",',
            '    "recommendations": string[] }],',
            '  "managementInsights": [{ "category": "RISK"|"OPPORTUNITY"|"EFFICIENCY"|"GROWTH",',
            '    "priority": "HIGH"|"MEDIUM"|"LOW", "title", "description",',
            '    "actionItems": string[], "timeline": "1-2 weeks"|"1 month"|"1 quarter",',
            '    "impact": string }],',
            '  "teamHealthMetrics": {',
            '    "knowledgeDistribution": { "criticalAreas", "singlePointsOfFailure",',
            '      "wellDistributed", "riskScore" (0-100) },',
            '    "collaborationMetrics": { "crossTeamWork" (0-1), "codeReviewParticipation" (0-1),',
            '      "knowledgeSharing" (0-1), "siloedMembers": string[] },',
            '    "performanceIndicators": { "averageReviewTime", "deploymentFrequency", "blockers": string[] }',
            '  },',
            '  "teamDynamics": { "collaborationPatterns": string[], "communicationHighlights": string[],',
            '    "knowledgeSharing": string[] },',
            '  "challengeMatching": { "toughProblems": string[], "recommendedExperts": string[] }',
            '}',
            '```',
            '',
            'Focus on the *humans* behind the code. Highlight personality, collaboration style,',
            'hidden strengths, and mentorship potential — not just lines-of-code metrics.',
        ].join('\n');
    }

    // ── Response parsing ──────────────────────────────────────────────

    private parseAnalysisResponse(
        response: AssistantMessageEvent,
        data: RepositoryData,
        stats: RepositoryStats
    ): ExpertiseAnalysis {
        const content = response.data.content ?? '';
        const json = this.extractJSON(content);

        if (!json) {
            this.outputChannel.appendLine(
                '[CopilotService] Could not extract JSON from response, using partial parse'
            );
            return this.buildMinimalAnalysis(data, stats);
        }

        try {
            const parsed = JSON.parse(json);
            return this.mapToExpertiseAnalysis(parsed, data, stats);
        } catch (err) {
            this.outputChannel.appendLine(
                `[CopilotService] JSON parse error: ${err}`
            );
            return this.buildMinimalAnalysis(data, stats);
        }
    }

    private parseExpertsFromResponse(response: AssistantMessageEvent): Expert[] {
        const content = response.data.content ?? '';
        const json = this.extractJSON(content);
        if (!json) { return []; }

        try {
            const parsed = JSON.parse(json);
            const arr = Array.isArray(parsed) ? parsed : parsed.experts ?? [];
            return arr.map((e: any) => this.mapExpert(e));
        } catch {
            return [];
        }
    }

    /**
     * Extract JSON from a response that may contain markdown fences or prose.
     */
    private extractJSON(text: string): string | null {
        // Try fenced code blocks first
        const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        if (fenced) { return fenced[1].trim(); }

        // Try raw JSON object
        const objMatch = text.match(/(\{[\s\S]*\})/);
        if (objMatch) { return objMatch[1]; }

        // Try raw JSON array
        const arrMatch = text.match(/(\[[\s\S]*\])/);
        if (arrMatch) { return arrMatch[1]; }

        return null;
    }

    private mapToExpertiseAnalysis(
        raw: any,
        data: RepositoryData,
        stats: RepositoryStats
    ): ExpertiseAnalysis {
        const experts: Expert[] = (raw.experts ?? []).map((e: any) => this.mapExpert(e));
        const fileExpertise: FileExpertise[] = (raw.fileExpertise ?? []).map((f: any) => ({
            fileName: f.fileName ?? '',
            filePath: f.filePath ?? '',
            experts: (f.experts ?? []).map((e: any) => this.mapExpert(e)),
            lastModified: new Date(f.lastModified ?? Date.now()),
            changeFrequency: f.changeFrequency ?? 0,
        }));
        const insights: TeamInsight[] = (raw.insights ?? []).map((i: any) => ({
            type: i.type ?? 'opportunity',
            title: i.title ?? '',
            description: i.description ?? '',
            impact: i.impact ?? 'medium',
            recommendations: i.recommendations ?? [],
        }));

        return {
            repository: data.repository,
            timestamp: new Date(),
            experts,
            fileExpertise,
            insights,
            stats,
            totalFiles: stats.totalFiles,
            totalExperts: experts.length,
            expertProfiles: experts,
            generatedAt: new Date(),
            teamDynamics: raw.teamDynamics ?? undefined,
            challengeMatching: raw.challengeMatching ?? undefined,
            managementInsights: (raw.managementInsights ?? []).map((m: any) => ({
                category: m.category ?? 'OPPORTUNITY',
                priority: m.priority ?? 'MEDIUM',
                title: m.title ?? '',
                description: m.description ?? '',
                actionItems: m.actionItems ?? [],
                timeline: m.timeline ?? '1 month',
                impact: m.impact ?? '',
            })),
            teamHealthMetrics: raw.teamHealthMetrics ?? undefined,
        };
    }

    private mapExpert(e: any): Expert {
        return {
            name: e.name ?? 'Unknown',
            email: e.email ?? '',
            expertise: typeof e.expertise === 'number' ? e.expertise : 50,
            contributions: e.contributions ?? 0,
            lastCommit: new Date(e.lastCommit ?? Date.now()),
            specializations: e.specializations ?? [],
            communicationStyle: e.communicationStyle ?? 'technical',
            teamRole: e.teamRole ?? 'contributor',
            hiddenStrengths: e.hiddenStrengths ?? [],
            idealChallenges: e.idealChallenges ?? [],
            workloadIndicator: e.workloadIndicator,
            collaborationStyle: e.collaborationStyle,
            riskFactors: e.riskFactors,
        };
    }

    private buildMinimalAnalysis(
        data: RepositoryData,
        stats: RepositoryStats
    ): ExpertiseAnalysis {
        // Build basic expert profiles from contributor data when AI parsing fails
        const experts: Expert[] = data.contributors.slice(0, 20).map(c => ({
            name: c.name,
            email: c.email,
            expertise: Math.min(100, (c.commits / (stats.totalCommits || 1)) * 100),
            contributions: c.commits,
            lastCommit: new Date(c.lastCommit),
            specializations: [],
            communicationStyle: 'technical',
            teamRole: 'contributor',
            hiddenStrengths: [],
            idealChallenges: [],
        }));

        return {
            repository: data.repository,
            timestamp: new Date(),
            experts,
            fileExpertise: [],
            insights: [{
                type: 'gap',
                title: 'AI analysis incomplete',
                description: 'The AI response could not be fully parsed. Showing git-based statistics only.',
                impact: 'medium',
                recommendations: ['Re-run the analysis or check the output channel for details.'],
            }],
            stats,
            totalFiles: stats.totalFiles,
            totalExperts: experts.length,
            expertProfiles: experts,
            generatedAt: new Date(),
        };
    }
}

// ── System message ────────────────────────────────────────────────────

const SYSTEM_MESSAGE = `You are a team expertise analyst helping engineering managers discover the humans behind their codebase.

Your job:
1. Use the provided tools to gather repository data (contributors, commits, file experts, stats, collaboration patterns).
2. Analyze each contributor's expertise areas, communication style, hidden strengths, and growth potential.
3. Evaluate team health: knowledge silos, single points of failure, collaboration gaps.
4. Provide management insights: risks, opportunities, mentorship matches, growth paths.

Guidelines:
- Focus on human qualities — not just lines-of-code metrics.
- Highlight personality traits inferred from commit patterns, message style, and collaboration habits.
- Identify hidden strengths that may not be obvious from metrics alone.
- Be constructive and human-centered in your insights.
- Always respond with valid JSON matching the requested schema. No prose outside the JSON.`;
