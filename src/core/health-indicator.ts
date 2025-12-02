import * as vscode from 'vscode';
import { ExpertiseAnalysis } from './expertise-analyzer';

/**
 * Represents the overall team health score
 */
export interface HealthScore {
    score: number; // 0-100
    status: 'healthy' | 'moderate' | 'needs-attention';
    breakdown: {
        knowledgeDistribution: number;
        activitySpread: number;
        collaborationScore: number;
    };
    summary: string;
    details: HealthDetail[];
}

/**
 * Represents a detailed health metric
 */
export interface HealthDetail {
    category: string;
    score: number;
    status: 'good' | 'warning' | 'critical';
    description: string;
}

/**
 * Health Indicator for the VS Code status bar
 * Shows a color-coded team health score based on knowledge distribution and collaboration patterns
 */
export class HealthIndicator {
    private statusBarItem: vscode.StatusBarItem;
    private currentScore: HealthScore | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            50 // Lower priority than the main Team X-Ray status bar item (100)
        );
        this.statusBarItem.command = 'teamxray.showHealthDetails';
        this.hide(); // Start hidden until we have analysis data
    }

    /**
     * Updates the health indicator based on the latest analysis
     */
    public update(analysis: ExpertiseAnalysis): void {
        this.currentScore = this.calculateHealthScore(analysis);
        this.updateStatusBar();
        this.outputChannel.appendLine(`🏥 Team health score updated: ${this.currentScore.score}/100 (${this.currentScore.status})`);
    }

    /**
     * Shows the status bar item
     */
    public show(): void {
        this.statusBarItem.show();
    }

    /**
     * Hides the status bar item
     */
    public hide(): void {
        this.statusBarItem.hide();
    }

    /**
     * Returns the current health score
     */
    public getScore(): HealthScore | null {
        return this.currentScore;
    }

    /**
     * Disposes of the status bar item
     */
    public dispose(): void {
        this.statusBarItem.dispose();
    }

    /**
     * Calculates the team health score from analysis data
     */
    private calculateHealthScore(analysis: ExpertiseAnalysis): HealthScore {
        const knowledgeScore = this.calculateKnowledgeDistributionScore(analysis);
        const activityScore = this.calculateActivitySpreadScore(analysis);
        const collaborationScore = this.calculateCollaborationScore(analysis);

        // Weighted average: knowledge distribution is most important for team health
        const overallScore = Math.round(
            knowledgeScore * 0.4 +
            activityScore * 0.3 +
            collaborationScore * 0.3
        );

        const status = this.getStatus(overallScore);
        const details = this.buildDetails(knowledgeScore, activityScore, collaborationScore, analysis);

        return {
            score: overallScore,
            status,
            breakdown: {
                knowledgeDistribution: knowledgeScore,
                activitySpread: activityScore,
                collaborationScore: collaborationScore
            },
            summary: this.buildSummary(overallScore, status, analysis),
            details
        };
    }

    /**
     * Calculates knowledge distribution score (bus factor)
     * Higher score = better distributed knowledge
     */
    private calculateKnowledgeDistributionScore(analysis: ExpertiseAnalysis): number {
        const experts = analysis.expertProfiles || analysis.experts || [];
        
        if (experts.length === 0) {
            return 50; // Default score when no data
        }

        // Check for single points of failure from team health metrics
        if (analysis.teamHealthMetrics?.knowledgeDistribution) {
            const { riskScore, singlePointsOfFailure } = analysis.teamHealthMetrics.knowledgeDistribution;
            
            // Risk score is 0-100 where higher = more risk, so we invert it
            if (typeof riskScore === 'number') {
                return Math.max(0, 100 - riskScore);
            }

            // Penalize for single points of failure
            const spofPenalty = singlePointsOfFailure.length * 15;
            return Math.max(0, 100 - spofPenalty);
        }

        // Fallback: Calculate based on contribution distribution
        const totalContributions = experts.reduce((sum, e) => sum + (e.contributions || 0), 0);
        if (totalContributions === 0) {
            return 50;
        }

        // Calculate Gini coefficient-like metric for contribution distribution
        const contributions = experts.map(e => e.contributions || 0).sort((a, b) => a - b);
        let giniSum = 0;
        for (let i = 0; i < contributions.length; i++) {
            giniSum += (2 * (i + 1) - contributions.length - 1) * contributions[i];
        }
        const gini = giniSum / (contributions.length * totalContributions);
        
        // Convert Gini (0-1 where 0 = perfect equality) to score (0-100 where 100 = best)
        const distributionScore = Math.round((1 - Math.abs(gini)) * 100);
        
        // Bonus for having multiple experts
        const teamSizeBonus = Math.min(20, experts.length * 2);
        
        return Math.min(100, distributionScore + teamSizeBonus);
    }

    /**
     * Calculates activity spread score
     * Higher score = more recent and distributed activity
     */
    private calculateActivitySpreadScore(analysis: ExpertiseAnalysis): number {
        const experts = analysis.expertProfiles || analysis.experts || [];
        
        if (experts.length === 0) {
            return 50;
        }

        // Check how many team members have been active recently
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let activeCount = 0;
        let overloadedCount = 0;
        let underutilizedCount = 0;

        for (const expert of experts) {
            const lastCommit = expert.lastCommit ? new Date(expert.lastCommit) : null;
            if (lastCommit && lastCommit >= thirtyDaysAgo) {
                activeCount++;
            }

            // Check workload indicators if available
            if (expert.workloadIndicator === 'overloaded') {
                overloadedCount++;
            } else if (expert.workloadIndicator === 'underutilized') {
                underutilizedCount++;
            }
        }

        // Calculate activity percentage
        const activityPercentage = (activeCount / experts.length) * 100;
        
        // Penalize for workload imbalances
        const workloadPenalty = (overloadedCount * 10) + (underutilizedCount * 5);
        
        return Math.max(0, Math.min(100, Math.round(activityPercentage - workloadPenalty)));
    }

    /**
     * Calculates collaboration score
     * Higher score = better team collaboration
     */
    private calculateCollaborationScore(analysis: ExpertiseAnalysis): number {
        // Use team health metrics if available
        if (analysis.teamHealthMetrics?.collaborationMetrics) {
            const metrics = analysis.teamHealthMetrics.collaborationMetrics;
            const avgScore = (
                metrics.crossTeamWork +
                metrics.codeReviewParticipation +
                metrics.knowledgeSharing
            ) / 3;
            
            // Penalize for siloed members
            const siloPenalty = metrics.siloedMembers.length * 10;
            
            return Math.max(0, Math.min(100, Math.round(avgScore - siloPenalty)));
        }

        // Fallback: Check expert collaboration styles
        const experts = analysis.expertProfiles || analysis.experts || [];
        if (experts.length === 0) {
            return 50;
        }

        let collaborativeCount = 0;
        let mentoringCount = 0;

        for (const expert of experts) {
            if (expert.collaborationStyle === 'collaborative') {
                collaborativeCount++;
            } else if (expert.collaborationStyle === 'mentoring') {
                mentoringCount++;
            }
        }

        // Score based on collaborative/mentoring ratio
        const collaborationRatio = (collaborativeCount + mentoringCount * 1.5) / experts.length;
        return Math.min(100, Math.round(collaborationRatio * 100));
    }

    /**
     * Determines the health status based on score
     */
    private getStatus(score: number): 'healthy' | 'moderate' | 'needs-attention' {
        if (score >= 70) {
            return 'healthy';
        } else if (score >= 40) {
            return 'moderate';
        }
        return 'needs-attention';
    }

    /**
     * Builds a summary message for the health score
     */
    private buildSummary(_score: number, status: string, analysis: ExpertiseAnalysis): string {
        const expertCount = (analysis.expertProfiles || analysis.experts || []).length;
        
        switch (status) {
            case 'healthy':
                return `Team health is good! ${expertCount} contributors with well-distributed knowledge.`;
            case 'moderate':
                return `Team health could be improved. Consider cross-training and knowledge sharing.`;
            default:
                return `Team health needs attention. Knowledge may be concentrated or collaboration is low.`;
        }
    }

    /**
     * Builds detailed breakdown of health metrics
     */
    private buildDetails(
        knowledgeScore: number,
        activityScore: number,
        collaborationScore: number,
        analysis: ExpertiseAnalysis
    ): HealthDetail[] {
        const details: HealthDetail[] = [];

        // Knowledge Distribution
        details.push({
            category: 'Knowledge Distribution',
            score: knowledgeScore,
            status: this.getDetailStatus(knowledgeScore),
            description: this.getKnowledgeDescription(knowledgeScore, analysis)
        });

        // Activity Spread
        details.push({
            category: 'Activity Spread',
            score: activityScore,
            status: this.getDetailStatus(activityScore),
            description: this.getActivityDescription(activityScore, analysis)
        });

        // Collaboration
        details.push({
            category: 'Collaboration',
            score: collaborationScore,
            status: this.getDetailStatus(collaborationScore),
            description: this.getCollaborationDescription(collaborationScore, analysis)
        });

        return details;
    }

    /**
     * Gets the status for a detail score
     */
    private getDetailStatus(score: number): 'good' | 'warning' | 'critical' {
        if (score >= 70) {
            return 'good';
        } else if (score >= 40) {
            return 'warning';
        }
        return 'critical';
    }

    /**
     * Gets description for knowledge distribution
     */
    private getKnowledgeDescription(score: number, analysis: ExpertiseAnalysis): string {
        const spof = analysis.teamHealthMetrics?.knowledgeDistribution?.singlePointsOfFailure || [];
        
        if (spof.length > 0) {
            return `Single points of failure: ${spof.slice(0, 3).join(', ')}${spof.length > 3 ? '...' : ''}`;
        }
        
        if (score >= 70) {
            return 'Knowledge is well-distributed across the team.';
        } else if (score >= 40) {
            return 'Some areas have concentrated knowledge. Consider cross-training.';
        }
        return 'Knowledge is highly concentrated. Risk of bottlenecks.';
    }

    /**
     * Gets description for activity spread
     */
    private getActivityDescription(score: number, analysis: ExpertiseAnalysis): string {
        const experts = analysis.expertProfiles || analysis.experts || [];
        const overloaded = experts.filter(e => e.workloadIndicator === 'overloaded');
        
        if (overloaded.length > 0) {
            return `${overloaded.length} team member(s) may be overloaded.`;
        }
        
        if (score >= 70) {
            return 'Team activity is well-balanced.';
        } else if (score >= 40) {
            return 'Activity could be more evenly distributed.';
        }
        return 'Activity is concentrated among few contributors.';
    }

    /**
     * Gets description for collaboration
     */
    private getCollaborationDescription(score: number, analysis: ExpertiseAnalysis): string {
        const siloed = analysis.teamHealthMetrics?.collaborationMetrics?.siloedMembers || [];
        
        if (siloed.length > 0) {
            return `${siloed.length} team member(s) may be working in isolation.`;
        }
        
        if (score >= 70) {
            return 'Strong team collaboration patterns.';
        } else if (score >= 40) {
            return 'Moderate collaboration. Encourage more code reviews.';
        }
        return 'Low collaboration detected. Consider pair programming.';
    }

    /**
     * Updates the status bar item appearance
     */
    private updateStatusBar(): void {
        if (!this.currentScore) {
            this.hide();
            return;
        }

        const { score, status } = this.currentScore;
        
        // Set icon and color based on status
        let icon: string;
        let color: vscode.ThemeColor | undefined;

        switch (status) {
            case 'healthy':
                icon = '$(heart)';
                color = new vscode.ThemeColor('testing.iconPassed');
                break;
            case 'moderate':
                icon = '$(warning)';
                color = new vscode.ThemeColor('testing.iconQueued');
                break;
            default:
                icon = '$(alert)';
                color = new vscode.ThemeColor('testing.iconFailed');
                break;
        }

        this.statusBarItem.text = `${icon} ${score}`;
        this.statusBarItem.color = color;
        this.statusBarItem.tooltip = this.buildTooltip();
        this.show();
    }

    /**
     * Builds the tooltip for the status bar item
     */
    private buildTooltip(): string {
        if (!this.currentScore) {
            return 'Team Health Score - No data available';
        }

        const { score, status, breakdown, summary } = this.currentScore;
        const statusEmoji = status === 'healthy' ? '🟢' : status === 'moderate' ? '🟡' : '🔴';

        return `Team Health Score: ${score}/100 ${statusEmoji}

${summary}

Breakdown:
• Knowledge Distribution: ${breakdown.knowledgeDistribution}%
• Activity Spread: ${breakdown.activitySpread}%
• Collaboration: ${breakdown.collaborationScore}%

Click for detailed breakdown`;
    }

    /**
     * Shows a detailed breakdown of the health score in a quick pick
     */
    public async showDetailedBreakdown(): Promise<void> {
        if (!this.currentScore) {
            vscode.window.showInformationMessage('No health score available. Run "Team X-Ray: Analyze Repository" first.');
            return;
        }

        const { score, status, details, summary } = this.currentScore;
        const statusEmoji = status === 'healthy' ? '🟢' : status === 'moderate' ? '🟡' : '🔴';

        const items: vscode.QuickPickItem[] = [
            {
                label: `${statusEmoji} Overall Score: ${score}/100`,
                description: status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' '),
                detail: summary
            },
            { kind: vscode.QuickPickItemKind.Separator, label: 'Breakdown' },
            ...details.map(detail => ({
                label: this.getDetailIcon(detail.status) + ' ' + detail.category,
                description: `${detail.score}%`,
                detail: detail.description
            }))
        ];

        // Add action items
        items.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Actions' });
        items.push({
            label: '$(refresh) Refresh Analysis',
            description: 'Run a new repository analysis'
        });
        items.push({
            label: '$(graph) View Full Report',
            description: 'Open the team expertise overview'
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Team Health Score Details',
            placeHolder: 'Select an item for more information'
        });

        if (selected) {
            if (selected.label.includes('Refresh Analysis')) {
                await vscode.commands.executeCommand('teamxray.analyzeRepository');
            } else if (selected.label.includes('View Full Report')) {
                await vscode.commands.executeCommand('teamxray.showTeamOverview');
            }
        }
    }

    /**
     * Gets the icon for a detail status
     */
    private getDetailIcon(status: 'good' | 'warning' | 'critical'): string {
        switch (status) {
            case 'good':
                return '$(check)';
            case 'warning':
                return '$(warning)';
            default:
                return '$(error)';
        }
    }
}
