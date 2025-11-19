import { ExpertiseAnalysis } from './expertise-analyzer';

export class ReportGenerator {
    /**
     * Generates an HTML report for a team analysis
     */
    public static generateHTMLReport(analysis: ExpertiseAnalysis): string {
        const repoName = analysis.repository.split('/').pop() || 'analysis';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team X-Ray Analysis Report - ${repoName}</title>
    <style>
        :root {
                --primary-color: #0066cc;
                --secondary-color: #4d4d4d;
                --background-color: #1e1e1e;
                --text-color: #ffffff;
                --border-color: #333333;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                line-height: 1.6;
                color: var(--text-color);
                background-color: var(--background-color);
                margin: 0;
                padding: 20px;
            }
            
            .ai-insights {
                background: rgba(30, 34, 42, 0.9) !important;
            }
            
            .insight-container {
                border-radius: 8px;
                padding: 20px;
            }

            .insight-badges {
                margin-bottom: 15px;
            }

            .badge {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                margin-right: 8px;
            }

            .badge.opportunity {
                background-color: #0066cc;
                color: white;
            }

            .badge.medium {
                background-color: #996600;
                color: white;
            }

            .insight-title {
                margin: 0 0 15px 0;
                font-size: 18px;
                font-weight: 600;
            }

            .insight-text {
                margin: 0 0 20px 0;
                color: #e1e1e1;
            }

            .recommendations {
                border-top: 1px solid #333;
                padding-top: 15px;
                margin-top: 15px;
            }

            .recommendations h4 {
                margin: 0 0 10px 0;
                font-size: 16px;
                font-weight: 500;
            }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 2.5em;
        }
        .metadata {
            opacity: 0.9;
            font-size: 1.1em;
        }
        .section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: #2d3748;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
            margin-top: 0;
        }
        .expert-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .expert-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            background: #f8fafc;
        }
        .expert-name {
            font-weight: bold;
            font-size: 1.2em;
            color: #2d3748;
            margin-bottom: 10px;
        }
        .expert-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 15px 0;
        }
        .stat {
            text-align: center;
            padding: 10px;
            background: white;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
        }
        .stat-value {
            font-weight: bold;
            font-size: 1.1em;
            color: #667eea;
        }
        .stat-label {
            font-size: 0.9em;
            color: #64748b;
        }
        .insights-list {
            list-style: none;
            padding: 0;
        }
        .insights-list li {
            background: #f0f4f8;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .management-insights {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .management-card {
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid;
        }
        .management-card.risk { border-left-color: #ef4444; background: #fef2f2; }
        .management-card.opportunity { border-left-color: #22c55e; background: #f0fdf4; }
        .management-card.efficiency { border-left-color: #3b82f6; background: #eff6ff; }
        .management-card.growth { border-left-color: #a855f7; background: #faf5ff; }
        .analysis-summary {
            font-size: 1.1em;
            line-height: 1.8;
            padding: 25px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            border-left: 4px solid #3b82f6;
            margin: 20px 0;
        }
        .generated-info {
            text-align: center;
            color: #64748b;
            font-style: italic;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Team X-Ray Analysis Report</h1>
        <div class="metadata">
            📊 ${repoName} • Generated ${new Date().toLocaleDateString()}<br>
            ${analysis.totalFiles} files analyzed • ${analysis.expertProfiles.length} team experts identified
        </div>
    </div>

    <div class="section">
        <h2>👥 Team Expert Profiles</h2>
        <div class="expert-grid">
            ${analysis.expertProfiles.map(expert => `
                <div class="expert-card">
                    <div class="expert-name">${expert.name}</div>
                    <div>📧 ${expert.email}</div>
                    <div class="expert-stats">
                        <div class="stat">
                            <div class="stat-value">${expert.expertise}%</div>
                            <div class="stat-label">Expertise</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${expert.contributions}</div>
                            <div class="stat-label">Commits</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${ReportGenerator.calculateDaysAgo(expert.lastCommit)}</div>
                            <div class="stat-label">Days Ago</div>
                        </div>
                    </div>
                    ${expert.specializations?.length ? `
                        <div><strong>Specializations:</strong> ${expert.specializations.join(', ')}</div>
                    ` : ''}
                    ${expert.teamRole ? `<div><strong>Role:</strong> ${expert.teamRole}</div>` : ''}
                </div>
            `).join('')}
        </div>
    </div>

    ${analysis.managementInsights?.length ? `
        <div class="section">
            <h2>📊 Management Insights</h2>
            <div class="management-insights">
                ${analysis.managementInsights.map(insight => `
                    <div class="management-card ${insight.category.toLowerCase()}">
                        <h3>${insight.title}</h3>
                        <p><strong>Category:</strong> ${insight.category} | <strong>Priority:</strong> ${insight.priority}</p>
                        <p>${insight.description}</p>
                        <div>
                            <strong>Action Items (${insight.timeline}):</strong>
                            <ul>
                                ${insight.actionItems.map(action => `<li>${action}</li>`).join('')}
                            </ul>
                        </div>
                        <p><strong>Expected Impact:</strong> ${insight.impact}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}

    <div class="section ai-insights">
        <h2>💡 AI Insights & Recommendations</h2>
        <div class="insight-container">
            <div class="insight-badges">
                <span class="badge opportunity">OPPORTUNITY</span>
                <span class="badge medium">MEDIUM</span>
            </div>
            <h3 class="insight-title">Analysis Insight</h3>
            <p class="insight-text">${ReportGenerator.generateAnalysisSummary(analysis)}</p>
            <div class="recommendations">
                <h4>Recommendations:</h4>
                ${ReportGenerator.generateRecommendations(analysis)}
            </div>
        </div>
    </div>

    <div class="generated-info">
        Generated by Team X-Ray VS Code Extension<br>
        ${new Date().toLocaleString()}
    </div>
</body>
</html>`;
    }

    /**
     * Generates a CSV summary for spreadsheet analysis
     */
    public static generateCSV(analysis: ExpertiseAnalysis): { experts: string; files: string; managementInsights?: string } {
        // Experts CSV
        const expertsHeader = 'Name,Email,Expertise %,Contributions,Last Commit,Specializations,Team Role,Communication Style,Workload,Collaboration Style\n';
        const expertsRows = analysis.expertProfiles.map(expert => {
            return [
                `"${expert.name}"`,
                `"${expert.email}"`,
                expert.expertise,
                expert.contributions,
                `"${new Date(expert.lastCommit).toLocaleDateString()}"`,
                `"${(expert.specializations || []).join('; ')}"`,
                `"${expert.teamRole || ''}"`,
                `"${expert.communicationStyle || ''}"`,
                `"${expert.workloadIndicator || ''}"`,
                `"${expert.collaborationStyle || ''}"`
            ].join(',');
        }).join('\n');
        
        // Files CSV
        const filesHeader = 'File Name,File Path,Expert Count,Primary Expert,Change Frequency\n';
        const filesRows = analysis.fileExpertise.map(file => {
            const primaryExpert = file.experts[0];
            return [
                `"${file.fileName}"`,
                `"${file.filePath}"`,
                file.experts.length,
                `"${primaryExpert?.name || 'Unknown'}"`,
                file.changeFrequency
            ].join(',');
        }).join('\n');

        const result: { experts: string; files: string; managementInsights?: string } = {
            experts: expertsHeader + expertsRows,
            files: filesHeader + filesRows
        };

        // Management Insights CSV (if available)
        if (analysis.managementInsights?.length) {
            const insightsHeader = 'Category,Priority,Title,Description,Timeline,Impact,Action Items\n';
            const insightsRows = analysis.managementInsights.map(insight => {
                return [
                    `"${insight.category}"`,
                    `"${insight.priority}"`,
                    `"${insight.title}"`,
                    `"${insight.description}"`,
                    `"${insight.timeline}"`,
                    `"${insight.impact}"`,
                    `"${insight.actionItems.join('; ')}"`
                ].join(',');
            }).join('\n');
            
            result.managementInsights = insightsHeader + insightsRows;
        }

        return result;
    }

    /**
     * Generates an executive summary based on the analysis
     */
    private static generateAnalysisSummary(analysis: ExpertiseAnalysis): string {
        const { expertProfiles } = analysis;
        
        // Find key insights
        const topContributor = expertProfiles.sort((a, b) => b.contributions - a.contributions)[0];
        
        if (!topContributor) {
            return 'No team analysis available.';
        }
        
        // Generate concise insight
        return `${topContributor.name} is the primary contributor and a potential bottleneck for CI/CD expertise.`;
    }

    /**
     * Generates specific recommendations based on the analysis
     */
    private static generateRecommendations(analysis: ExpertiseAnalysis): string {
        const { teamHealthMetrics } = analysis;
        
        const recommendations = [];

        // Knowledge distribution recommendation
        const riskScore = teamHealthMetrics?.knowledgeDistribution?.riskScore ?? 0;
        if (riskScore > 70) {
            recommendations.push('Implement regular knowledge sharing sessions and documentation sprints');
        }

        // Collaboration recommendation
        const sharingScore = teamHealthMetrics?.collaborationMetrics?.knowledgeSharing ?? 0;
        if (sharingScore < 50) {
            recommendations.push('Establish regular code review rotations and pair programming sessions');
        }

        // If no specific metrics, provide general recommendations
        if (recommendations.length === 0) {
            recommendations.push(
                'Consider implementing pair programming sessions to distribute knowledge',
                'Document key workflows and architectural decisions',
                'Set up regular technical sharing sessions'
            );
        }

        return recommendations.map(rec => `<p>${rec}</p>`).join('');
    }

    /**
     * Calculate days ago from a date
     */
    private static calculateDaysAgo(lastCommitDate: any): string {
        try {
            if (!lastCommitDate) {
                return 'N/A';
            }
            
            let date: Date;
            
            if (lastCommitDate instanceof Date) {
                date = lastCommitDate;
            } else if (typeof lastCommitDate === 'string') {
                date = new Date(lastCommitDate);
            } else if (typeof lastCommitDate === 'number') {
                // Handle Unix timestamp (in seconds or milliseconds)
                const multiplier = lastCommitDate > 9999999999 ? 1 : 1000;
                date = new Date(lastCommitDate * multiplier);
            } else {
                return 'N/A';
            }

            if (isNaN(date.getTime())) {
                return 'N/A';
            }
            
            const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
            return String(days);
        } catch (e) {
            console.error("Error calculating days ago:", e);
            return 'N/A';
        }
    }
}
