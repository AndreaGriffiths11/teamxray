import * as vscode from 'vscode';
import axios from 'axios';
import { CopilotMCPService, GitHubRepository } from './copilot-mcp-service';

export interface FileExpertise {
    fileName: string;
    filePath: string;
    experts: Expert[];
    lastModified: Date;
    changeFrequency: number;
}

export interface Expert {
    name: string;
    email: string;
    expertise: number; // 0-100 score
    contributions: number;
    lastCommit: Date;
    specializations: string[];
    communicationStyle?: string;
    teamRole?: string;
    hiddenStrengths?: string[];
    idealChallenges?: string[];
}

export interface TeamDynamics {
    collaborationPatterns: string[];
    communicationHighlights: string[];
    knowledgeSharing: string[];
}

export interface ChallengeMatching {
    toughProblems: string[];
    recommendedExperts: string[];
}

export interface ExpertiseAnalysis {
    repository: string;
    generatedAt: Date;
    totalFiles: number;
    totalExperts: number;
    fileExpertise: FileExpertise[];
    expertProfiles: Expert[];
    teamDynamics?: TeamDynamics;
    challengeMatching?: ChallengeMatching;
    insights: string[];
}

export interface GitHubSearchResponse {
    items: Array<{
        name: string;
        path: string;
        repository: {
            full_name: string;
            owner: {
                login: string;
            };
        };
        score: number;
    }>;
    total_count: number;
}

interface RepositoryStats {
    totalFiles: number;
    totalCommits: number;
    totalContributors: number;
    primaryLanguages: string[];
    recentActivityLevel: 'low' | 'medium' | 'high';
    repositorySize: 'small' | 'medium' | 'large' | 'enterprise';
}

export class ExpertiseAnalyzer {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private copilotMCPService: CopilotMCPService;

    // Limits for different repository sizes
    private readonly SIZE_LIMITS = {
        small: { files: 50, contributors: 10, commits: 100 },
        medium: { files: 200, contributors: 20, commits: 200 },
        large: { files: 500, contributors: 30, commits: 300 },
        enterprise: { files: 1000, contributors: 50, commits: 500 }
    };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Team X-Ray');
        this.copilotMCPService = new CopilotMCPService(this.outputChannel);
    }

    /**
     * Analyzes repository expertise using local git analysis and AI analysis
     * Now with smart data chunking for large repositories
     */
    async analyzeRepository(): Promise<ExpertiseAnalysis | null> {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('🚀 Starting repository expertise analysis...');

            // Step 1: Get workspace information
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a repository folder.');
                return null;
            }

            const repositoryName = workspaceFolder.name;
            this.outputChannel.appendLine(`📊 Analyzing repository: ${repositoryName}`);

            // Step 2: Assess repository size and characteristics
            const repoStats = await this.assessRepositorySize();
            this.outputChannel.appendLine(`📏 Repository size: ${repoStats.repositorySize} (${repoStats.totalFiles} files, ${repoStats.totalContributors} contributors)`);

            // Step 3: Gather repository data with size-appropriate limits
            const repositoryData = await this.gatherRepositoryData(repositoryName, repoStats);
            if (!repositoryData) {
                vscode.window.showErrorMessage('Failed to gather repository data.');
                return null;
            }

            // Step 4: Perform AI analysis with chunking for large repos
            const analysis = await this.performSmartAIAnalysis(repositoryData, repoStats);
            if (!analysis) {
                vscode.window.showErrorMessage('Failed to perform AI analysis.');
                return null;
            }

            this.outputChannel.appendLine('✅ Analysis completed successfully!');
            return analysis;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.outputChannel.appendLine(`❌ Error: ${errorMessage}`);
            vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Assesses repository size and characteristics to determine analysis strategy
     */
    private async assessRepositorySize(): Promise<RepositoryStats> {
        try {
            const files = await this.getWorkspaceFiles();
            const commits = await this.getLocalGitCommits();
            const contributors = await this.getLocalGitContributors();

            // Determine repository size
            let repositorySize: 'small' | 'medium' | 'large' | 'enterprise' = 'small';
            if (files.length > 1000 || contributors.length > 50) {
                repositorySize = 'enterprise';
            } else if (files.length > 500 || contributors.length > 30) {
                repositorySize = 'large';
            } else if (files.length > 200 || contributors.length > 20) {
                repositorySize = 'medium';
            }

            // Determine primary languages
            const languageCount: Record<string, number> = {};
            files.forEach(file => {
                const ext = file.split('.').pop()?.toLowerCase();
                if (ext) {
                    languageCount[ext] = (languageCount[ext] || 0) + 1;
                }
            });

            const primaryLanguages = Object.entries(languageCount)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([ext]) => this.mapExtensionToLanguage(ext));

            // Assess recent activity level
            const recentCommits = commits.filter(c => {
                const commitDate = new Date(c.date);
                const daysAgo = (Date.now() - commitDate.getTime()) / (1000 * 60 * 60 * 24);
                return daysAgo <= 30;
            });

            let recentActivityLevel: 'low' | 'medium' | 'high' = 'low';
            if (recentCommits.length > 50) {
                recentActivityLevel = 'high';
            } else if (recentCommits.length > 20) {
                recentActivityLevel = 'medium';
            }

            return {
                totalFiles: files.length,
                totalCommits: commits.length,
                totalContributors: contributors.length,
                primaryLanguages,
                recentActivityLevel,
                repositorySize
            };

        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Error assessing repository size: ${error}`);
            return {
                totalFiles: 0,
                totalCommits: 0,
                totalContributors: 0,
                primaryLanguages: [],
                recentActivityLevel: 'low',
                repositorySize: 'small'
            };
        }
    }

    /**
     * Maps file extension to language name
     */
    private mapExtensionToLanguage(ext: string): string {
        const languageMap: Record<string, string> = {
            'ts': 'TypeScript',
            'js': 'JavaScript',
            'tsx': 'React/TypeScript',
            'jsx': 'React/JavaScript',
            'py': 'Python',
            'java': 'Java',
            'cs': 'C#',
            'cpp': 'C++',
            'c': 'C',
            'rs': 'Rust',
            'go': 'Go',
            'rb': 'Ruby',
            'php': 'PHP',
            'swift': 'Swift',
            'kt': 'Kotlin'
        };
        return languageMap[ext] || ext.toUpperCase();
    }

    /**
     * Gathers repository data with size-appropriate limits
     */
    private async gatherRepositoryData(repositoryName: string, repoStats: RepositoryStats): Promise<any> {
        try {
            this.outputChannel.appendLine('📥 Gathering repository data with smart limits...');

            const limits = this.SIZE_LIMITS[repoStats.repositorySize];
            this.outputChannel.appendLine(`🎯 Using ${repoStats.repositorySize} repo limits: ${limits.files} files, ${limits.contributors} contributors, ${limits.commits} commits`);

            // Get limited data sets
            const allFiles = await this.getWorkspaceFiles();
            const allCommits = await this.getLocalGitCommits();
            const allContributors = await this.getLocalGitContributors();

            // Apply intelligent sampling
            const files = this.sampleFiles(allFiles, limits.files);
            const commits = this.sampleCommits(allCommits, limits.commits);
            const contributors = this.sampleContributors(allContributors, limits.contributors);

            this.outputChannel.appendLine(
                `📊 Sampled data: ${files.length}/${allFiles.length} files, ` +
                `${contributors.length}/${allContributors.length} contributors, ` +
                `${commits.length}/${allCommits.length} commits`
            );

            return {
                repository: repositoryName,
                files,
                commits,
                contributors,
                pullRequests: [],
                repositoryStats: repoStats,
                samplingApplied: {
                    originalFiles: allFiles.length,
                    originalCommits: allCommits.length,
                    originalContributors: allContributors.length
                }
            };

        } catch (error) {
            this.outputChannel.appendLine(`❌ Error gathering repository data: ${error}`);
            throw error;
        }
    }

    /**
     * Intelligently samples files to include diverse types and important files
     */
    private sampleFiles(files: string[], limit: number): string[] {
        if (files.length <= limit) return files;

        // Prioritize important files
        const priorities = {
            high: [] as string[],
            medium: [] as string[],
            low: [] as string[]
        };

        files.forEach(file => {
            const fileName = file.toLowerCase();
            if (fileName.includes('readme') || fileName.includes('package.json') || 
                fileName.includes('main') || fileName.includes('index') ||
                fileName.includes('app') || fileName.includes('server')) {
                priorities.high.push(file);
            } else if (fileName.includes('test') || fileName.includes('spec') ||
                       fileName.includes('config') || fileName.includes('util')) {
                priorities.medium.push(file);
            } else {
                priorities.low.push(file);
            }
        });

        // Sample proportionally
        const result = [];
        const highTake = Math.min(priorities.high.length, Math.floor(limit * 0.3));
        const mediumTake = Math.min(priorities.medium.length, Math.floor(limit * 0.3));
        const lowTake = limit - highTake - mediumTake;

        result.push(...priorities.high.slice(0, highTake));
        result.push(...priorities.medium.slice(0, mediumTake));
        result.push(...priorities.low.slice(0, lowTake));

        return result;
    }

    /**
     * Samples commits to include recent and significant ones
     */
    private sampleCommits(commits: any[], limit: number): any[] {
        if (commits.length <= limit) return commits;

        // Sort by date (newest first) and take a mix of recent and distributed
        const sorted = commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Take 70% recent commits, 30% distributed throughout history
        const recentCount = Math.floor(limit * 0.7);
        const distributedCount = limit - recentCount;

        const recent = sorted.slice(0, recentCount);
        const distributed = [];

        // Sample distributed commits from the remaining
        const remaining = sorted.slice(recentCount);
        const step = Math.max(1, Math.floor(remaining.length / distributedCount));
        
        for (let i = 0; i < distributedCount && i * step < remaining.length; i++) {
            distributed.push(remaining[i * step]);
        }

        return [...recent, ...distributed];
    }

    /**
     * Samples contributors prioritizing most active ones
     */
    private sampleContributors(contributors: any[], limit: number): any[] {
        if (contributors.length <= limit) return contributors;
        
        // Sort by commit count and take top contributors
        return contributors
            .sort((a, b) => b.commits - a.commits)
            .slice(0, limit);
    }

    /**
     * Performs AI analysis with smart chunking and error handling
     */
    private async performSmartAIAnalysis(repositoryData: any, repoStats: RepositoryStats): Promise<ExpertiseAnalysis | null> {
        try {
            this.outputChannel.appendLine('🤖 Performing smart AI analysis...');

            // Estimate prompt size and adjust if needed
            const promptSize = this.estimatePromptSize(repositoryData);
            this.outputChannel.appendLine(`📏 Estimated prompt size: ${Math.round(promptSize / 1024)}KB`);

            // Use different strategies based on size
            if (promptSize > 100000) { // >100KB
                this.outputChannel.appendLine('📦 Large dataset detected, using chunked analysis...');
                return await this.performChunkedAnalysis(repositoryData, repoStats);
            } else {
                return await this.performStandardAnalysis(repositoryData, repoStats);
            }

        } catch (error) {
            this.outputChannel.appendLine(`❌ AI analysis failed: ${error}`);
            return this.createFallbackAnalysis(repositoryData);
        }
    }

    /**
     * Estimates the size of the prompt in characters
     */
    private estimatePromptSize(repositoryData: any): number {
        const contributorsText = repositoryData.contributors
            .map((c: any) => `${c.name} (${c.email}) - ${c.commits} commits`)
            .join('\n');
        
        const commitsText = repositoryData.commits
            .map((c: any) => `${c.author.name}: ${c.message}`)
            .join('\n');

        const filesText = repositoryData.files.slice(0, 20).join(', ');

        return contributorsText.length + commitsText.length + filesText.length + 2000; // +2000 for prompt structure
    }

    /**
     * Performs standard AI analysis for smaller datasets
     */
    private async performStandardAnalysis(repositoryData: any, repoStats: RepositoryStats): Promise<ExpertiseAnalysis | null> {
        const config = vscode.workspace.getConfiguration('teamxray');
        let apiKey = config.get<string>('githubModelsKey');

        if (!apiKey || apiKey.includes('${input:github_token}')) {
            apiKey = process.env.GITHUB_TOKEN;
        }

        if (apiKey?.includes('${input:github_token}')) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your GitHub Personal Access Token',
                password: true,
                placeHolder: 'ghp_...'
            });
        }

        if (!apiKey) {
            vscode.window.showErrorMessage('GitHub token is required for team expertise analysis.');
            return null;
        }

        const prompt = this.buildOptimizedAnalysisPrompt(repositoryData, repoStats);
        
        try {
            const response = await axios.post(
                'https://models.github.ai/inference/chat/completions',
                {
                    model: 'openai/gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert code analyst that helps identify team expertise patterns. Respond with valid JSON only.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000
                },
                {
                    headers: {
                        'Accept': 'application/vnd.github+json',
                        'Authorization': `Bearer ${apiKey}`,
                        'X-GitHub-Api-Version': '2022-11-28',
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiResponse = (response.data as any).choices[0].message.content;
            return this.parseAIResponse(aiResponse, repositoryData);

        } catch (error: any) {
            if (error.response?.status === 413) {
                this.outputChannel.appendLine('⚠️ Request too large, falling back to chunked analysis...');
                return await this.performChunkedAnalysis(repositoryData, repoStats);
            }
            throw error;
        }
    }

    /**
     * Performs chunked analysis for very large repositories
     */
    private async performChunkedAnalysis(repositoryData: any, repoStats: RepositoryStats): Promise<ExpertiseAnalysis | null> {
        this.outputChannel.appendLine('🔄 Starting chunked analysis for large repository...');

        // Analyze in smaller chunks
        const contributorChunks = this.chunkArray(repositoryData.contributors, 10);
        const chunkResults = [];

        for (let i = 0; i < contributorChunks.length; i++) {
            this.outputChannel.appendLine(`📝 Analyzing chunk ${i + 1}/${contributorChunks.length}...`);
            
            const chunkData = {
                ...repositoryData,
                contributors: contributorChunks[i],
                commits: repositoryData.commits.slice(0, 20), // Limit commits per chunk
                files: repositoryData.files.slice(0, 15) // Limit files per chunk
            };

            try {
                const chunkResult = await this.performStandardAnalysis(chunkData, repoStats);
                if (chunkResult) {
                    chunkResults.push(chunkResult);
                }
            } catch (error) {
                this.outputChannel.appendLine(`⚠️ Chunk ${i + 1} failed: ${error}`);
                // Continue with other chunks
            }

            // Add delay between requests to avoid rate limiting
            if (i < contributorChunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (chunkResults.length === 0) {
            this.outputChannel.appendLine('❌ All chunks failed, using fallback analysis');
            return this.createFallbackAnalysis(repositoryData);
        }

        // Merge chunk results
        return this.mergeChunkResults(chunkResults, repositoryData);
    }

    /**
     * Chunks an array into smaller arrays
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Merges results from multiple chunk analyses
     */
    private mergeChunkResults(chunkResults: ExpertiseAnalysis[], repositoryData: any): ExpertiseAnalysis {
        const allExperts = chunkResults.flatMap(result => result.expertProfiles);
        const allInsights = chunkResults.flatMap(result => result.insights);

        // Deduplicate and merge experts
        const expertMap = new Map<string, Expert>();
        allExperts.forEach(expert => {
            const key = expert.email;
            if (expertMap.has(key)) {
                const existing = expertMap.get(key)!;
                existing.contributions += expert.contributions;
                existing.expertise = Math.max(existing.expertise, expert.expertise);
                existing.specializations = [...new Set([...existing.specializations, ...expert.specializations])];
            } else {
                expertMap.set(key, expert);
            }
        });

        const mergedExperts = Array.from(expertMap.values())
            .sort((a, b) => b.contributions - a.contributions);

        return {
            repository: repositoryData.repository,
            generatedAt: new Date(),
            totalFiles: repositoryData.samplingApplied?.originalFiles || repositoryData.files.length,
            totalExperts: mergedExperts.length,
            fileExpertise: this.mapFileExpertise(repositoryData.files, mergedExperts),
            expertProfiles: mergedExperts,
            teamDynamics: chunkResults[0]?.teamDynamics,
            challengeMatching: chunkResults[0]?.challengeMatching,
            insights: [
                ...new Set(allInsights),
                `Analysis completed using chunked processing for large repository`,
                `Processed ${chunkResults.length} data chunks to handle repository size`
            ]
        };
    }

    /**
     * Builds an optimized analysis prompt that fits within size limits
     */
    private buildOptimizedAnalysisPrompt(repositoryData: any, repoStats: RepositoryStats): string {
        // Limit data based on repository size
        const maxContributors = Math.min(repositoryData.contributors.length, 15);
        const maxCommits = Math.min(repositoryData.commits.length, 10);
        const maxFiles = Math.min(repositoryData.files.length, 15);

        const contributorsInfo = repositoryData.contributors.slice(0, maxContributors)
            .map((c: any) => `${c.name} (${c.email}) - ${c.commits} commits`)
            .join('\n');

        const recentCommitMessages = repositoryData.commits.slice(0, maxCommits)
            .map((c: any) => `${c.author.name}: ${c.message.substring(0, 100)}`)
            .join('\n');

        const filesSample = repositoryData.files.slice(0, maxFiles).join(', ');

        return `Analyze this ${repoStats.repositorySize} software repository for team expertise patterns.

Repository: ${repositoryData.repository}
Size: ${repoStats.repositorySize} (${repoStats.totalFiles} files, ${repoStats.totalContributors} contributors)
Primary Languages: ${repoStats.primaryLanguages.join(', ')}
Activity Level: ${repoStats.recentActivityLevel}

Team Members (showing top ${maxContributors}):
${contributorsInfo}

Recent Communication Patterns (${maxCommits} commits):
${recentCommitMessages}

Key Files: ${filesSample}

Focus on: 1) Technical expertise per person, 2) Communication styles, 3) Collaboration patterns, 4) Hidden strengths, 5) Challenge matching.

Respond with JSON only:
{
  "experts": [
    {
      "name": "Name",
      "email": "email@example.com", 
      "expertise": 85,
      "contributions": 42,
      "lastCommit": "2025-05-28",
      "specializations": ["TypeScript", "React"],
      "communicationStyle": "Clear and detailed",
      "teamRole": "Senior Developer",
      "hiddenStrengths": ["Mentoring", "Architecture"],
      "idealChallenges": ["Complex refactoring", "Performance optimization"]
    }
  ],
  "insights": ["Human-focused insights about team strengths"],
  "teamDynamics": {
    "collaborationPatterns": ["Team shows strong collaboration"],
    "communicationHighlights": ["Clear commit messages"],
    "knowledgeSharing": ["Good documentation practices"]
  }
}`;
    }

    /**
     * Rest of the methods remain the same but with improved error handling...
     */

    async findExpertForFile(filePath: string): Promise<Expert[] | null> {
        try {
            this.outputChannel.appendLine(`🔍 Finding experts for file: ${filePath}`);

            const repository = await this.copilotMCPService.detectRepository();
            if (repository) {
                const fileExperts = await this.copilotMCPService.analyzeFileExperts(filePath, repository);
                if (fileExperts && fileExperts.length > 0) {
                    this.outputChannel.appendLine(`✅ Found ${fileExperts.length} experts via MCP for file`);
                    return fileExperts;
                }
            }

            this.outputChannel.appendLine('⚡ MCP analysis unavailable, using local file analysis...');
            const fileData = await this.gatherFileData(filePath);
            if (!fileData) {
                return null;
            }

            const experts = await this.analyzeFileExperts(fileData);
            this.outputChannel.appendLine(`✅ Found ${experts?.length || 0} experts for file`);

            return experts;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.outputChannel.appendLine(`❌ Error finding experts: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to find experts: ${errorMessage}`);
            return null;
        }
    }

    private async getWorkspaceFiles(): Promise<string[]> {
        const files: string[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (workspaceFolder) {
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,cs,rb,php,go,rs,kt,swift}');
            const fileUris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
            
            for (const uri of fileUris) {
                files.push(vscode.workspace.asRelativePath(uri));
            }
        }

        return files;
    }

    private async gatherFileData(filePath: string): Promise<any> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            
            return {
                path: filePath,
                content: document.getText(),
                lineCount: document.lineCount,
                languageId: document.languageId,
                lastModified: new Date()
            };
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to gather file data: ${error}`);
            return null;
        }
    }

    private async analyzeFileExperts(fileData: any): Promise<Expert[]> {
        try {
            const repositoryData = await this.gatherRepositoryData(fileData.repository || 'current', await this.assessRepositorySize());
            
            const filePath = fileData.path || fileData.filePath;
            if (!filePath) {
                throw new Error('File path not found in file data');
            }
            
            const fileExperts = repositoryData.contributors
                .filter((contributor: any) => contributor.commits > 0)
                .map((contributor: any) => ({
                    name: contributor.name,
                    email: contributor.email,
                    expertise: Math.min(100, (contributor.commits / Math.max(1, repositoryData.contributors[0]?.commits || 1)) * 100),
                    contributions: contributor.commits,
                    lastCommit: contributor.lastCommit,
                    specializations: this.inferSpecializationsFromFile(filePath),
                    communicationStyle: 'Inferred from commit patterns',
                    teamRole: contributor.commits > 10 ? 'Regular contributor' : 'Occasional contributor',
                    hiddenStrengths: ['Code review', 'Documentation'],
                    idealChallenges: ['Bug fixes', 'Feature development']
                }))
                .sort((a: any, b: any) => b.contributions - a.contributions)
                .slice(0, 5);

            return fileExperts;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error analyzing file experts: ${error}`);
            throw new Error(`Cannot analyze file experts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private inferSpecializationsFromFile(filePath: string): string[] {
        const specializations: string[] = [];
        
        if (!filePath || typeof filePath !== 'string') {
            this.outputChannel.appendLine(`⚠️ Invalid file path provided: ${filePath}`);
            return ['General Programming'];
        }
        
        const ext = filePath.split('.').pop()?.toLowerCase();
        const path = filePath.toLowerCase();

        switch (ext) {
            case 'ts':
            case 'tsx':
                specializations.push('TypeScript');
                if (ext === 'tsx') specializations.push('React');
                break;
            case 'js':
            case 'jsx':
                specializations.push('JavaScript');
                if (ext === 'jsx') specializations.push('React');
                break;
            case 'py':
                specializations.push('Python');
                break;
            case 'java':
                specializations.push('Java');
                break;
            case 'cs':
                specializations.push('C#');
                break;
            case 'go':
                specializations.push('Go');
                break;
            case 'rs':
                specializations.push('Rust');
                break;
            case 'cpp':
            case 'cc':
            case 'cxx':
                specializations.push('C++');
                break;
            case 'c':
                specializations.push('C');
                break;
        }

        if (path.includes('test') || path.includes('spec')) {
            specializations.push('Testing');
        }
        if (path.includes('api') || path.includes('server')) {
            specializations.push('Backend');
        }
        if (path.includes('ui') || path.includes('component')) {
            specializations.push('Frontend');
        }
        if (path.includes('database') || path.includes('sql')) {
            specializations.push('Database');
        }

        return specializations.length > 0 ? specializations : ['General'];
    }

    private parseAIResponse(aiResponse: string, repositoryData: any): ExpertiseAnalysis {
        try {
            this.outputChannel.appendLine(`🔍 Parsing AI response...`);
            
            let jsonContent = this.extractJSONFromResponse(aiResponse);
            
            if (!jsonContent) {
                this.outputChannel.appendLine(`⚠️ No JSON found, creating fallback analysis`);
                return this.createFallbackAnalysis(repositoryData);
            }
            
            const parsed = JSON.parse(jsonContent);
            this.outputChannel.appendLine(`✅ Successfully parsed JSON response`);
            
            const processedExperts = (parsed.experts || []).map((expert: any, index: number) => {
                const lastCommit = expert.lastCommit ? new Date(expert.lastCommit) : new Date();
                const specializations = Array.isArray(expert.specializations) ? expert.specializations : [];
                
                return {
                    name: expert.name || `Expert ${index + 1}`,
                    email: expert.email || 'unknown@example.com',
                    expertise: typeof expert.expertise === 'number' ? expert.expertise : 0,
                    contributions: typeof expert.contributions === 'number' ? expert.contributions : 0,
                    lastCommit,
                    specializations,
                    communicationStyle: expert.communicationStyle || undefined,
                    teamRole: expert.teamRole || undefined,
                    hiddenStrengths: Array.isArray(expert.hiddenStrengths) ? expert.hiddenStrengths : undefined,
                    idealChallenges: Array.isArray(expert.idealChallenges) ? expert.idealChallenges : undefined
                };
            });

            return {
                repository: repositoryData.repository,
                generatedAt: new Date(),
                totalFiles: repositoryData.samplingApplied?.originalFiles || repositoryData.files.length,
                totalExperts: processedExperts.length,
                fileExpertise: this.mapFileExpertise(repositoryData.files, processedExperts),
                expertProfiles: processedExperts,
                teamDynamics: parsed.teamDynamics || undefined,
                challengeMatching: parsed.challengeMatching || undefined,
                insights: parsed.insights || []
            };
        } catch (error) {
            this.outputChannel.appendLine(`❌ Failed to parse AI response: ${error}`);
            return this.createFallbackAnalysis(repositoryData);
        }
    }

    private extractJSONFromResponse(response: string): string | null {
        try {
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            try {
                JSON.parse(cleanResponse);
                return cleanResponse;
            } catch {
                const nestedJsonMatch = response.match(/\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\}/);
                if (nestedJsonMatch) {
                    try {
                        JSON.parse(nestedJsonMatch[0]);
                        return nestedJsonMatch[0];
                    } catch {
                        return null;
                    }
                }
                return null;
            }
        } catch (error) {
            this.outputChannel.appendLine(`❌ Error extracting JSON: ${error}`);
            return null;
        }
    }

    private createFallbackAnalysis(repositoryData: any): ExpertiseAnalysis {
        this.outputChannel.appendLine(`📋 Creating fallback analysis from repository data`);
        
        const experts: Expert[] = (repositoryData.contributors || []).map((contributor: any, index: number) => ({
            name: contributor.name || `Contributor ${index + 1}`,
            email: contributor.email || 'unknown@example.com',
            expertise: Math.min(90, 30 + (contributor.commits || 0) * 2),
            contributions: contributor.commits || 0,
            lastCommit: contributor.lastCommit ? new Date(contributor.lastCommit) : new Date(),
            specializations: this.inferSpecializationsFromFiles(repositoryData.files || []),
            communicationStyle: 'Analysis unavailable - local data only',
            teamRole: 'Team member',
            hiddenStrengths: ['Code contribution'],
            idealChallenges: ['General development tasks']
        }));

        const insights = [
            `Analyzed ${repositoryData.samplingApplied?.originalFiles || repositoryData.files?.length || 0} files in the repository`,
            `Found ${experts.length} contributors with commit history`,
            experts.length > 0 ? `Most active contributor: ${experts[0]?.name}` : 'No contributor data available',
            repositoryData.samplingApplied ? 'Large repository - used smart sampling for analysis' : 'Complete repository analysis',
            'For enhanced AI insights, check GitHub Models API configuration'
        ].filter(Boolean);

        return {
            repository: repositoryData.repository || 'Unknown Repository',
            generatedAt: new Date(),
            totalFiles: repositoryData.samplingApplied?.originalFiles || repositoryData.files?.length || 0,
            totalExperts: experts.length,
            fileExpertise: this.mapFileExpertise(repositoryData.files || [], experts),
            expertProfiles: experts,
            teamDynamics: {
                collaborationPatterns: ['Data not available in fallback mode'],
                communicationHighlights: ['Local analysis only'],
                knowledgeSharing: ['Requires AI analysis for detailed insights']
            },
            challengeMatching: {
                toughProblems: ['Complex analysis requires AI integration'],
                recommendedExperts: experts.slice(0, 2).map(e => e.name)
            },
            insights
        };
    }

    private inferSpecializationsFromFiles(files: string[]): string[] {
        const extensions = files
            .map(f => f.split('.').pop()?.toLowerCase())
            .filter((ext): ext is string => Boolean(ext));
            
        const extensionCounts = extensions.reduce((acc: Record<string, number>, ext: string) => {
            acc[ext] = (acc[ext] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const topExtensions = Object.entries(extensionCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 3)
            .map(([ext]) => ext);
            
        const specializations: string[] = [];
        
        for (const ext of topExtensions) {
            const lang = this.mapExtensionToLanguage(ext);
            if (!specializations.includes(lang)) {
                specializations.push(lang);
            }
        }
        
        return specializations.length > 0 ? specializations : ['General Programming'];
    }

    private mapFileExpertise(files: string[], experts: Expert[]): FileExpertise[] {
        return files.map(file => ({
            fileName: file.split('/').pop() || file,
            filePath: file,
            experts: experts.slice(0, 2),
            lastModified: new Date(),
            changeFrequency: Math.floor(Math.random() * 10) + 1
        }));
    }

    private async getLocalGitCommits(): Promise<any[]> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return [];
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const command = 'git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso -n 500';
            const { stdout } = await execAsync(command, { cwd: workspaceFolder.uri.fsPath });

            const commits = stdout.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    const parts = line.split('|');
                    if (parts.length >= 5) {
                        return {
                            sha: parts[0],
                            author: {
                                name: parts[1],
                                email: parts[2]
                            },
                            date: parts[3],
                            message: parts.slice(4).join('|')
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            return commits;

        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Failed to get local git commits: ${error}`);
            return [];
        }
    }

    private async getLocalGitContributors(): Promise<any[]> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return [];
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const command = 'git shortlog -sne --all';
            const { stdout } = await execAsync(command, { cwd: workspaceFolder.uri.fsPath });

            const contributors = stdout.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string) => {
                    const match = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>\s*$/);
                    if (match) {
                        const commits = parseInt(match[1]);
                        const name = match[2];
                        const email = match[3];
                        
                        return {
                            name,
                            email,
                            commits,
                            lastCommit: new Date().toISOString()
                        };
                    }
                    return null;
                })
                .filter(Boolean)
                .sort((a: any, b: any) => b.commits - a.commits);

            // Get last commit date for top contributors
            for (const contributor of contributors.slice(0, 20)) {
                try {
                    const lastCommitCommand = `git log --author="${contributor.email}" --pretty=format:"%ad" --date=iso -n 1`;
                    const { stdout: lastCommitDate } = await execAsync(lastCommitCommand, { cwd: workspaceFolder.uri.fsPath });
                    if (lastCommitDate.trim()) {
                        contributor.lastCommit = lastCommitDate.trim();
                    }
                } catch (error) {
                    // Continue with default date
                }
            }

            return contributors;

        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Failed to get local git contributors: ${error}`);
            return [];
        }
    }

    async saveAnalysis(analysis: ExpertiseAnalysis): Promise<void> {
        await this.context.workspaceState.update('lastAnalysis', analysis);
        await vscode.commands.executeCommand('setContext', 'teamxray.hasAnalysis', true);
    }

    getLastAnalysis(): ExpertiseAnalysis | undefined {
        const analysis = this.context.workspaceState.get('lastAnalysis') as any;
        if (!analysis) {
            return undefined;
        }

        return {
            ...analysis,
            generatedAt: new Date(analysis.generatedAt),
            expertProfiles: analysis.expertProfiles?.map((expert: any) => ({
                ...expert,
                lastCommit: expert.lastCommit ? new Date(expert.lastCommit) : new Date()
            })) || []
        } as ExpertiseAnalysis;
    }
}