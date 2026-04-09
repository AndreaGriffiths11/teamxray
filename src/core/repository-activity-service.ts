import * as vscode from 'vscode';
import * as path from 'path';
import { ExpertiseAnalyzer } from './expertise-analyzer';
import { Expert } from '../types/expert';
import { GitService } from './git-service';

export interface GitHubRepository {
    owner: string;
    repo: string;
}

export interface GitHubContributor {
    name: string;
    email: string;
    contributions: number;
    lastCommit: Date;
    recentCommits: string[];
}

/**
 * GitHub repository detection and expert activity service.
 *
 * Previously handled broader repository integration and Copilot Chat queries.
 * Those responsibilities have moved to CopilotService (Copilot SDK integration).
 * This service now focuses on:
 *   - GitHub repository detection from git remotes
 *   - Expert recent activity lookups via local git
 *   - Expert activity display
 *   - Issue-to-expert matching
 */
export class RepositoryActivityService {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    // ── Repository detection ──────────────────────────────────────────

    /**
     * Detect GitHub repository information from the current workspace using
     * secure GitService (no shell injection).
     */
    async detectRepository(): Promise<GitHubRepository | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            const gitService = new GitService(workspaceFolder.uri.fsPath, this.outputChannel);
            const remoteUrl = await gitService.getRemoteUrl();

            if (!remoteUrl) {
                this.outputChannel.appendLine('No git remote URL found');
                return null;
            }

            this.outputChannel.appendLine(`Git remote URL: ${remoteUrl}`);

            // Parse GitHub URL (supports both HTTPS and SSH)
            const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
            if (githubMatch) {
                const [, owner, repo] = githubMatch;
                this.outputChannel.appendLine(`Detected GitHub repo: ${owner}/${repo}`);
                return { owner, repo };
            }

            return null;
        } catch (error) {
            this.outputChannel.appendLine(`Failed to detect repository: ${error}`);
            return null;
        }
    }

    // ── Expert activity ───────────────────────────────────────────────

    /**
     * Get recent activity for an expert from local git history.
     */
    async getExpertRecentActivity(
        expertEmail: string,
        expertName: string
    ): Promise<{ success: boolean; activity?: any; error?: string }> {
        try {
            this.outputChannel.appendLine(`Getting recent activity for expert: ${expertName} (${expertEmail})`);
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { success: false, error: 'No workspace folder found' };
            }

            try {
                const gitService = new GitService(workspaceFolder.uri.fsPath, this.outputChannel);

                const commits = await gitService.getCommitsByAuthor(expertEmail, 10);
                const recentCommits = commits.map(commit => ({
                    repo: 'Current Repository',
                    message: commit.message || 'No message',
                    date: commit.date.split(' ')[0] || new Date().toISOString().split('T')[0],
                    url: `#${commit.sha.substring(0, 7)}`,
                }));

                const recentFiles = await gitService.getFilesByAuthor(expertEmail, 10);

                const activity = {
                    expertName,
                    expertEmail,
                    recentCommits: recentCommits.length > 0
                        ? recentCommits
                        : [{
                            repo: 'Current Repository',
                            message: 'No recent commits found',
                            date: new Date().toISOString().split('T')[0],
                            url: '#',
                        }],
                    recentActivity: [
                        `${recentCommits.length} recent commits in this repository`,
                        recentFiles.length > 0
                            ? `Recently worked on: ${recentFiles.slice(0, 3).join(', ')}`
                            : 'No recent file activity found',
                        `Last commit: ${recentCommits[0]?.date || 'Unknown'}`,
                    ],
                    currentFocus: recentCommits.length > 0
                        ? `Recent work: ${recentCommits[0]?.message?.substring(0, 100) || 'No recent activity'}`
                        : 'No recent activity in this repository',
                };

                this.outputChannel.appendLine(`Generated activity summary for ${expertName} with ${recentCommits.length} commits`);
                return { success: true, activity };
            } catch (gitError) {
                this.outputChannel.appendLine(`Git command failed, using fallback data: ${gitError}`);
                const fallbackActivity = {
                    expertName,
                    expertEmail,
                    recentCommits: [{
                        repo: 'Current Repository',
                        message: 'Git history not accessible',
                        date: new Date().toISOString().split('T')[0],
                        url: '#',
                    }],
                    recentActivity: [
                        `Expert: ${expertName}`,
                        `Email: ${expertEmail}`,
                        'Git history requires repository access',
                    ],
                    currentFocus: 'Repository analysis required for detailed activity',
                };
                return { success: true, activity: fallbackActivity };
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error getting expert activity: ${error}`);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * Display expert activity in a markdown document.
     */
    async showExpertActivity(activity: any): Promise<void> {
        try {
            const { expertName, expertEmail, recentCommits, recentActivity, currentFocus } = activity;
            let activityDisplay = `# Recent Activity: ${expertName}\n\n`;
            activityDisplay += `**Email:** ${expertEmail}\n\n`;
            if (currentFocus) {
                activityDisplay += `**Current Focus:** ${currentFocus}\n\n`;
            }
            if (recentCommits && recentCommits.length > 0) {
                activityDisplay += `## Recent Commits:\n`;
                recentCommits.slice(0, 5).forEach((commit: any, index: number) => {
                    activityDisplay += `${index + 1}. **${commit.repo || 'Repository'}**\n`;
                    activityDisplay += `   ${commit.message || 'Commit message'}\n`;
                    activityDisplay += `   *${commit.date || 'Recent'}*\n\n`;
                });
            }
            if (recentActivity && recentActivity.length > 0) {
                activityDisplay += `## Activity Summary:\n`;
                recentActivity.forEach((item: string) => {
                    activityDisplay += `- ${item}\n`;
                });
            }
            const doc = await vscode.workspace.openTextDocument({
                content: activityDisplay,
                language: 'markdown',
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Error displaying expert activity: ${error}`);
        }
    }

    // ── File expert analysis (local git) ──────────────────────────────

    /**
     * Analyze file-specific experts using local git blame/log data.
     * Returns null if analysis cannot be performed — callers should
     * fall back to other methods.
     */
    async analyzeFileExperts(
        filePath: string,
        _repository: GitHubRepository
    ): Promise<Expert[] | null> {
        try {
            this.outputChannel.appendLine(`Analyzing experts for file: ${filePath}`);
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) { return null; }

            const gitService = new GitService(workspaceFolder.uri.fsPath, this.outputChannel);
            const fileCommits = await gitService.getCommitsForFile(filePath, 100);

            if (fileCommits.length === 0) { return null; }

            // Aggregate by author
            const authorMap = new Map<string, { name: string; email: string; commits: number; lastDate: string }>();
            for (const commit of fileCommits) {
                const key = commit.author.email;
                const existing = authorMap.get(key);
                if (existing) {
                    existing.commits++;
                    if (commit.date > existing.lastDate) { existing.lastDate = commit.date; }
                } else {
                    authorMap.set(key, {
                        name: commit.author.name,
                        email: commit.author.email,
                        commits: 1,
                        lastDate: commit.date,
                    });
                }
            }

            const maxCommits = Math.max(...Array.from(authorMap.values()).map(a => a.commits));

            return Array.from(authorMap.values())
                .sort((a, b) => b.commits - a.commits)
                .slice(0, 5)
                .map(a => ({
                    name: a.name,
                    email: a.email,
                    expertise: Math.min(100, Math.round((a.commits / maxCommits) * 100)),
                    contributions: a.commits,
                    lastCommit: new Date(a.lastDate),
                    specializations: this.inferSpecializationsFromFile(filePath),
                    communicationStyle: 'Inferred from commit patterns',
                    teamRole: a.commits > 10 ? 'Regular contributor' : 'Occasional contributor',
                    hiddenStrengths: [],
                    idealChallenges: [],
                }));
        } catch (error) {
            this.outputChannel.appendLine(`Error analyzing file experts: ${error}`);
            return null;
        }
    }

    // ── Issue-to-expert matching ──────────────────────────────────────

    async suggestExpertForIssueDetails(issueDetails: any, analyzer: ExpertiseAnalyzer): Promise<void> {
        this.outputChannel.appendLine(`Suggesting expert for issue: ${issueDetails.title}`);
        const analysis = analyzer.getLastAnalysis();
        if (!analysis || !analysis.expertProfiles || analysis.expertProfiles.length === 0) {
            vscode.window.showInformationMessage('No expertise data available. Please run repository analysis first.');
            return;
        }
        const bestExpert = this.findBestExpertForIssue(issueDetails, analysis.expertProfiles);
        this.displayExpertForIssue(bestExpert, issueDetails);
    }

    private findBestExpertForIssue(issueData: any, experts: Expert[]): Expert | null {
        if (!experts || experts.length === 0) { return null; }
        const issueKeywords = this.extractKeywords(`${issueData.title} ${issueData.body}`);
        let bestExpert: Expert | null = null;
        let bestScore = -1;
        for (const expert of experts) {
            const expertSkills = (expert.specializations || []).map(s => s.toLowerCase());
            const matchCount = issueKeywords.filter(k => expertSkills.includes(k)).length;
            if (matchCount > bestScore) {
                bestScore = matchCount;
                bestExpert = expert;
            }
        }
        return bestExpert;
    }

    private extractKeywords(text: string): string[] {
        return text
            .split(/[\W_]+/)
            .map(kw => kw.toLowerCase())
            .filter(kw => kw.length > 2);
    }

    private displayExpertForIssue(expert: Expert | null, issueData: any): void {
        if (!expert) {
            vscode.window.showInformationMessage('No suitable expert found for this issue.');
            return;
        }
        const message = [
            `Suggested Expert: ${expert.name} <${expert.email}>`,
            `Expertise: ${expert.specializations?.join(', ') || 'N/A'}`,
            `Contributions: ${expert.contributions}`,
            `Issue: ${issueData.title}`,
        ].join('\n');

        this.outputChannel.appendLine(message);
        vscode.window.showInformationMessage(message);
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private inferSpecializationsFromFile(filePath: string): string[] {
        const extension = path.extname(filePath).toLowerCase();
        const map: Record<string, string> = {
            '.ts': 'TypeScript', '.js': 'JavaScript', '.py': 'Python',
            '.java': 'Java', '.cs': 'C#', '.go': 'Go', '.rs': 'Rust',
            '.rb': 'Ruby', '.php': 'PHP', '.html': 'HTML', '.css': 'CSS',
            '.scss': 'SCSS', '.md': 'Markdown',
        };
        return map[extension] ? [map[extension]] : ['General'];
    }
}
