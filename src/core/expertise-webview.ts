import * as vscode from 'vscode';
import { Expert } from '../types/expert';
import { ExpertiseAnalysis } from './expertise-analyzer';

export class ExpertiseWebviewProvider {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Creates and shows a webview panel with expertise analysis results
     */
    public showAnalysisResults(analysis: ExpertiseAnalysis): void {
        // Store analysis for export functionality
        this.setCurrentAnalysis(analysis);
        
        const panel = vscode.window.createWebviewPanel(
            'teamxray.analysis',
            'Team Expertise Analysis',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getWebviewContent(analysis);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showExpertDetails':
                        this.showExpertDetails(message.expert);
                        break;
                    case 'getExpertActivity':
                        this.getExpertActivity(message.expert);
                        break;
                    case 'openFile':
                        this.openFile(message.filePath);
                        break;
                    case 'refreshAnalysis':
                        vscode.commands.executeCommand('teamxray.analyzeRepository');
                        break;
                    case 'exportAnalysis':
                        this.exportAnalysis();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * Shows expert details in a quick pick
     */
    private showExpertDetails(expert: Expert): void {
        const items = [
            `Email: ${expert.email}`,
            `Expertise Score: ${expert.expertise}/100`,
            `Contributions: ${expert.contributions}`,
            `Last Commit: ${this.safeFormatDate(expert.lastCommit)}`,
            `Specializations: ${(expert.specializations || []).join(', ')}`
        ];

        vscode.window.showQuickPick(items, {
            title: `Expert Details: ${expert.name}`,
            canPickMany: false
        });
    }

    /**
     * Gets expert recent activity via MCP
     */
    private async getExpertActivity(expert: Expert): Promise<void> {
        // Trigger the extension command for getting expert activity
        vscode.commands.executeCommand('teamxray.showExpertDetails', expert);
    }

    /**
     * Opens a file in the editor
     */
    private async openFile(filePath: string): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
                const document = await vscode.workspace.openTextDocument(fullPath);
                await vscode.window.showTextDocument(document);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    /**
     * Extracts GitHub username from email or name
     */
    private getGitHubUsername(email: string, name: string): string {
        // First try to extract from email (common patterns)
        if (email.includes('@github.com') || email.includes('@users.noreply.github.com')) {
            // Handle GitHub noreply emails like: username@users.noreply.github.com
            // Also handle: 12345+username@users.noreply.github.com
            const match = email.match(/^(?:\d+\+)?([^@]+)@(users\.noreply\.)?github\.com$/);
            if (match) {
                return match[1];
            }
        }
        
        // Try to extract from common email patterns
        if (email.includes('@')) {
            const username = email.split('@')[0];
            // Clean up common patterns and remove numbers prefix from GitHub noreply
            const cleanUsername = username.replace(/^\d+\+/, '').replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
            
            // Only use if it looks like a valid GitHub username
            if (cleanUsername.length >= 1 && cleanUsername.length <= 39) {
                return cleanUsername;
            }
        }
        
        // Fallback to name-based username
        return name.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9\-]/g, '')
            .slice(0, 39); // GitHub username max length
    }

    /**
     * Safely formats a date that might be a Date object or string
     */
    private safeFormatDate(date: any): string {
        if (!date) return 'Unknown';
        try {
            const d = date instanceof Date ? date : new Date(date);
            return d.toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    }

    /**
     * Renders management insights section
     */
    private renderManagementInsights(analysis: ExpertiseAnalysis): string {
        if (!analysis.managementInsights || analysis.managementInsights.length === 0) {
            return `<div class="management-empty">
                <div class="empty-state-icon">📊</div>
                <div>Management insights will appear here after analysis</div>
            </div>`;
        }

        return `
            <div class="management-grid">
                ${analysis.managementInsights.map(insight => `
                    <div class="management-card ${insight.category.toLowerCase()}">
                        <div class="management-header">
                            <span class="management-category ${insight.category.toLowerCase()}">${insight.category}</span>
                            <span class="management-priority ${insight.priority.toLowerCase()}">${insight.priority}</span>
                        </div>
                        <h4>${insight.title}</h4>
                        <p>${insight.description}</p>
                        <div class="management-actions">
                            <h5>Action Items (${insight.timeline}):</h5>
                            <ul>
                                ${insight.actionItems.map(action => `<li>${action}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="management-impact">
                            <strong>Expected Impact:</strong> ${insight.impact}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Renders team health metrics section
     */
    private renderTeamHealthMetrics(analysis: ExpertiseAnalysis): string {
        if (!analysis.teamHealthMetrics) {
            return `<div class="health-empty">
                <div class="empty-state-icon">🏥</div>
                <div>Team health metrics will appear here after analysis</div>
            </div>`;
        }

        const metrics = analysis.teamHealthMetrics;
        
        return `
            <div class="health-metrics-grid">
                <!-- Knowledge Distribution -->
                <div class="health-metric-card">
                    <h4>🧠 Knowledge Distribution</h4>
                    <div class="risk-score ${this.getRiskLevel(metrics.knowledgeDistribution.riskScore)}">
                        Risk Score: ${metrics.knowledgeDistribution.riskScore}/100
                    </div>
                    <div class="metric-details">
                        <div class="metric-item critical">
                            <strong>Critical Areas:</strong>
                            <ul>
                                ${metrics.knowledgeDistribution.criticalAreas.map(area => `<li>${area}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="metric-item warning">
                            <strong>Single Points of Failure:</strong>
                            <ul>
                                ${metrics.knowledgeDistribution.singlePointsOfFailure.map(spof => `<li>${spof}</li>`).join('')}
                            </ul>
                        </div>
                        <div class="metric-item positive">
                            <strong>Well Distributed:</strong>
                            <ul>
                                ${metrics.knowledgeDistribution.wellDistributed.map(area => `<li>${area}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>

                <!-- Collaboration Metrics -->
                <div class="health-metric-card">
                    <h4>🤝 Collaboration Health</h4>
                    <div class="collaboration-stats">
                        <div class="collab-stat">
                            <span class="stat-value">${metrics.collaborationMetrics.crossTeamWork}%</span>
                            <span class="stat-label">Cross-team Work</span>
                        </div>
                        <div class="collab-stat">
                            <span class="stat-value">${metrics.collaborationMetrics.codeReviewParticipation}%</span>
                            <span class="stat-label">Code Review Participation</span>
                        </div>
                        <div class="collab-stat">
                            <span class="stat-value">${metrics.collaborationMetrics.knowledgeSharing}%</span>
                            <span class="stat-label">Knowledge Sharing</span>
                        </div>
                    </div>
                    ${metrics.collaborationMetrics.siloedMembers.length > 0 ? `
                        <div class="metric-item warning">
                            <strong>Siloed Members:</strong>
                            <ul>
                                ${metrics.collaborationMetrics.siloedMembers.map(member => `<li>${member}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>

                <!-- Performance Indicators -->
                <div class="health-metric-card">
                    <h4>⚡ Performance Indicators</h4>
                    <div class="performance-stats">
                        <div class="perf-stat">
                            <span class="stat-label">Average Review Time</span>
                            <span class="stat-value">${metrics.performanceIndicators.averageReviewTime}</span>
                        </div>
                        <div class="perf-stat">
                            <span class="stat-label">Deployment Frequency</span>
                            <span class="stat-value">${metrics.performanceIndicators.deploymentFrequency}</span>
                        </div>
                    </div>
                    ${metrics.performanceIndicators.blockers.length > 0 ? `
                        <div class="metric-item critical">
                            <strong>Current Blockers:</strong>
                            <ul>
                                ${metrics.performanceIndicators.blockers.map(blocker => `<li>${blocker}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Gets risk level class based on score
     */
    private getRiskLevel(score: number): string {
        if (score >= 70) return 'high-risk';
        if (score >= 40) return 'medium-risk';
        return 'low-risk';
    }

    /**
     * Handles export analysis functionality
     */
    private async exportAnalysis(): Promise<void> {
        if (!this.currentAnalysis) {
            vscode.window.showErrorMessage('No analysis data available to export');
            return;
        }

        try {
            const options = await vscode.window.showQuickPick([
                { 
                    label: '📊 JSON Data Export',
                    detail: 'Export raw analysis data in JSON format',
                    value: 'json'
                },
                { 
                    label: '📄 HTML Report',
                    detail: 'Export a complete HTML report with styling',
                    value: 'html'
                },
                { 
                    label: '📋 CSV Summary',
                    detail: 'Export team summary in CSV format for spreadsheets',
                    value: 'csv'
                },
                { 
                    label: '📦 Complete Package',
                    detail: 'Export all formats in a folder',
                    value: 'all'
                }
            ], {
                placeHolder: 'Choose export format',
                ignoreFocusOut: true
            });

            if (!options) return;

            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Export Folder',
                title: 'Choose folder to save Team X-Ray analysis'
            });

            if (!folderUri || folderUri.length === 0) {
                return;
            }

            const exportFolder = folderUri[0];
            await this.performExport(options.value, exportFolder);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
            vscode.window.showErrorMessage(`Export failed: ${errorMessage}`);
        }
    }

    private currentAnalysis: any = null;

    /**
     * Store current analysis for export
     */
    public setCurrentAnalysis(analysis: any): void {
        this.currentAnalysis = analysis;
    }

    /**
     * Performs the actual export based on selected format
     */
    private async performExport(format: string, folderUri: vscode.Uri): Promise<void> {
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
        const repoName = this.currentAnalysis.repository.split('/').pop() || 'analysis';
        const baseFileName = `team-xray-${repoName}-${timestamp}`;

        try {
            switch (format) {
                case 'json':
                    await this.exportJSON(folderUri, baseFileName);
                    break;
                case 'html':
                    await this.exportHTML(folderUri, baseFileName);
                    break;
                case 'csv':
                    await this.exportCSV(folderUri, baseFileName);
                    break;
                case 'all':
                    await Promise.all([
                        this.exportJSON(folderUri, baseFileName),
                        this.exportHTML(folderUri, baseFileName),
                        this.exportCSV(folderUri, baseFileName)
                    ]);
                    break;
            }

            const folderPath = folderUri.fsPath;
            const openFolderAction = 'Open Folder';
            const result = await vscode.window.showInformationMessage(
                `Team X-Ray analysis exported successfully to ${folderPath}`,
                openFolderAction
            );

            if (result === openFolderAction) {
                vscode.commands.executeCommand('revealFileInOS', folderUri);
            }

        } catch (error) {
            throw new Error(`Export operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Export analysis data as JSON
     */
    private async exportJSON(folderUri: vscode.Uri, baseFileName: string): Promise<void> {
        const filePath = vscode.Uri.joinPath(folderUri, `${baseFileName}.json`);
        const jsonData = JSON.stringify(this.currentAnalysis, null, 2);
        
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(jsonData, 'utf8'));
    }

    /**
     * Export analysis as standalone HTML report
     */
    private async exportHTML(folderUri: vscode.Uri, baseFileName: string): Promise<void> {
        const filePath = vscode.Uri.joinPath(folderUri, `${baseFileName}.html`);
        const htmlContent = this.generateStandaloneHTML();
        
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(htmlContent, 'utf8'));
    }

    /**
     * Export team summary as CSV
     */
    private async exportCSV(folderUri: vscode.Uri, baseFileName: string): Promise<void> {
        const csvContent = this.generateCSV();
        
        // Export experts CSV
        const expertsPath = vscode.Uri.joinPath(folderUri, `${baseFileName}-experts.csv`);
        await vscode.workspace.fs.writeFile(expertsPath, Buffer.from(csvContent.experts, 'utf8'));
        
        // Export file expertise CSV
        const filesPath = vscode.Uri.joinPath(folderUri, `${baseFileName}-files.csv`);
        await vscode.workspace.fs.writeFile(filesPath, Buffer.from(csvContent.files, 'utf8'));
        
        // Export management insights CSV if available
        if (csvContent.managementInsights) {
            const insightsPath = vscode.Uri.joinPath(folderUri, `${baseFileName}-insights.csv`);
            await vscode.workspace.fs.writeFile(insightsPath, Buffer.from(csvContent.managementInsights, 'utf8'));
        }
    }

    /**
     * Generate standalone HTML report
     */
    private generateStandaloneHTML(): string {
        const analysis = this.currentAnalysis;
        const categoryColors: Record<string, string> = { RISK: '#ef4444', OPPORTUNITY: '#10b981', EFFICIENCY: '#3b82f6', GROWTH: '#f59e0b' };
        const priorityDots: Record<string, string> = { HIGH: '●●●', MEDIUM: '●●○', LOW: '●○○' };
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team X-Ray Analysis Report - ${analysis.repository}</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto',sans-serif;line-height:1.6;color:#e2e8f0;max-width:1200px;margin:0 auto;padding:20px;background:#0a0a0f}
        .header{background:#0a0a0f;background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(6,182,212,0.03) 2px,rgba(6,182,212,0.03) 4px);padding:48px 40px;border:1px solid #1e293b;border-radius:12px;text-align:center;margin-bottom:30px}
        .header h1{font-size:2.5em;font-weight:800;letter-spacing:0.08em;color:#e2e8f0;text-shadow:0 0 20px rgba(6,182,212,0.4),0 0 40px rgba(6,182,212,0.15);margin-bottom:8px}
        .header .repo{font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;color:#06b6d4;font-size:1.1em;margin-bottom:16px}
        .header .stats{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
        .pill{display:inline-block;padding:4px 14px;border:1px solid #1e293b;border-radius:999px;font-size:0.85em;color:#64748b}
        .pill strong{color:#e2e8f0}
        .section{background:#12121a;border:1px solid #1e293b;border-radius:12px;padding:30px;margin-bottom:30px}
        .section h2{color:#e2e8f0;font-size:1.4em;border-bottom:2px solid #1e293b;padding-bottom:10px;margin-bottom:20px}
        .section h2 .accent{color:#06b6d4}
        .expert-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
        .expert-card{background:#12121a;border:1px solid #1e293b;border-radius:8px;padding:20px;transition:box-shadow 0.2s}
        .expert-card.high{border-left:3px solid #06b6d4;box-shadow:inset 4px 0 12px -4px rgba(6,182,212,0.15)}
        .expert-card.low{opacity:0.6}
        .expert-name{font-weight:700;font-size:1.15em;color:#e2e8f0;margin-bottom:2px}
        .expert-email{font-size:0.85em;color:#64748b;margin-bottom:12px}
        .role-badge{display:inline-block;font-size:0.7em;text-transform:uppercase;letter-spacing:0.08em;color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:middle}
        .bar-chart{width:100%;margin:10px 0}
        .bar-chart svg{width:100%;height:24px;border-radius:4px;overflow:hidden}
        .expert-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
        .stat{text-align:center;padding:8px;background:#0a0a0f;border-radius:6px;border:1px solid #1e293b}
        .stat-value{font-weight:700;font-size:1.05em;color:#06b6d4}
        .stat-label{font-size:0.78em;color:#64748b}
        .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .chip{font-size:0.75em;padding:3px 10px;background:#0a0a0f;border:1px solid #1e293b;border-radius:999px;color:#64748b}
        .mgmt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px}
        .mgmt-card{background:#12121a;border:1px solid #1e293b;border-radius:8px;padding:20px;border-top:6px solid}
        .mgmt-card h3{color:#e2e8f0;margin-bottom:6px;font-size:1.1em}
        .mgmt-meta{font-size:0.85em;color:#64748b;margin-bottom:10px}
        .mgmt-meta .dots{margin-left:6px}
        .mgmt-card p{color:#94a3b8;font-size:0.95em;margin-bottom:12px}
        .action-box{background:#0a0a0f;border:1px solid #1e293b;border-radius:6px;padding:14px;margin-top:10px}
        .action-box .label{font-size:0.8em;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:8px}
        .action-box ul{list-style:none;padding:0}
        .action-box li{padding:4px 0;color:#94a3b8;font-size:0.9em}
        .action-box li::before{content:'›';color:#06b6d4;margin-right:8px;font-weight:bold}
        .impact{font-size:0.85em;color:#64748b;margin-top:10px}
        .impact strong{color:#e2e8f0}
        .insight-item{display:flex;align-items:baseline;gap:14px;padding:14px 0;border-bottom:1px solid #1e293b}
        .insight-item:last-child{border-bottom:none}
        .insight-num{font-size:1.3em;font-weight:800;color:#06b6d4;min-width:28px;text-align:right}
        .insight-text{color:#94a3b8;font-size:0.95em}
        .footer{text-align:center;padding:24px 0;margin-top:20px;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:0.8em;color:#64748b;border-top:1px solid #1e293b}
        @media print{body{background:#fff;color:#1a1a1a}.header{background:#fff;border-color:#ddd}.header h1{color:#1a1a1a;text-shadow:none}.header .repo{color:#0891b2}.section{background:#fff;border-color:#ddd;box-shadow:none}.expert-card{background:#fff;border-color:#ddd;opacity:1!important;box-shadow:none!important}.stat{background:#f5f5f5;border-color:#ddd}.stat-value{color:#0891b2}.chip{background:#f5f5f5;border-color:#ddd;color:#555}.mgmt-card{background:#fff;border-color:#ddd}.action-box{background:#f5f5f5;border-color:#ddd}.footer{color:#999;border-color:#ddd}.insight-text{color:#444}.pill{border-color:#ddd;color:#666}}
    </style>
</head>
<body>
    <div class="header">
        <h1>TEAM X-RAY</h1>
        <div class="repo">${analysis.repository}</div>
        <div class="stats">
            <span class="pill">Generated <strong>${this.safeFormatDate(analysis.generatedAt)}</strong></span>
            <span class="pill"><strong>${analysis.totalFiles}</strong> files scanned</span>
            <span class="pill"><strong>${analysis.totalExperts}</strong> experts identified</span>
        </div>
    </div>

    <div class="section">
        <h2><span class="accent">▸</span> Expert Profiles</h2>
        <div class="expert-grid">
            ${analysis.expertProfiles.map((expert: any) => {
                const barColor = expert.expertise >= 20 ? '#06b6d4' : '#374151';
                const cardClass = expert.expertise >= 60 ? 'high' : expert.expertise < 20 ? 'low' : '';
                return `<div class="expert-card ${cardClass}">
                    <div class="expert-name">${expert.name}${expert.teamRole ? `<span class="role-badge">${expert.teamRole}</span>` : ''}</div>
                    <div class="expert-email">${expert.email}</div>
                    <div class="bar-chart"><svg viewBox="0 0 400 24"><rect width="400" height="24" fill="#1e293b"/><rect width="${expert.expertise * 4}" height="24" fill="${barColor}"/><text x="${Math.max(expert.expertise * 4 - 8, 30)}" y="17" text-anchor="end" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">${expert.expertise}%</text></svg></div>
                    <div class="expert-stats">
                        <div class="stat"><div class="stat-value">${expert.expertise}%</div><div class="stat-label">Expertise</div></div>
                        <div class="stat"><div class="stat-value">${expert.contributions}</div><div class="stat-label">Commits</div></div>
                        <div class="stat"><div class="stat-value">${this.calculateDaysAgo(expert.lastCommit)}</div><div class="stat-label">Days Ago</div></div>
                    </div>
                    ${expert.specializations?.length ? `<div class="chips">${expert.specializations.map((s: string) => `<span class="chip">${s}</span>`).join('')}</div>` : ''}
                </div>`;
            }).join('')}
        </div>
    </div>

    ${analysis.managementInsights?.length ? `
        <div class="section">
            <h2><span class="accent">▸</span> Management Insights</h2>
            <div class="mgmt-grid">
                ${analysis.managementInsights.map((insight: any) => `
                    <div class="mgmt-card" style="border-top-color:${categoryColors[insight.category] || '#06b6d4'}">
                        <h3>${insight.title}</h3>
                        <div class="mgmt-meta">${insight.category}<span class="dots" style="color:${categoryColors[insight.category] || '#64748b'}"> ${priorityDots[insight.priority] || '●○○'}</span></div>
                        <p>${insight.description}</p>
                        <div class="action-box">
                            <div class="label">Action Items · ${insight.timeline}</div>
                            <ul>${insight.actionItems.map((action: string) => `<li>${action}</li>`).join('')}</ul>
                        </div>
                        <div class="impact"><strong>Impact:</strong> ${insight.impact}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}

    <div class="section">
        <h2><span class="accent">▸</span> Key Insights</h2>
        ${analysis.insights.map((insight: any, i: number) => `
            <div class="insight-item">
                <div class="insight-num">${i + 1}</div>
                <div class="insight-text">${typeof insight === 'string' ? insight : insight.description}</div>
            </div>
        `).join('')}
    </div>

    <div class="footer">Generated by Team X-Ray · ${this.safeFormatDate(analysis.generatedAt)}</div>
</body>
</html>`;
    }

    /**
     * Generate CSV data for spreadsheet analysis
     */
    private generateCSV(): { experts: string; files: string; managementInsights?: string } {
        const analysis = this.currentAnalysis;
        
        // Experts CSV
        const expertsHeader = 'Name,Email,Expertise %,Contributions,Last Commit,Specializations,Team Role,Communication Style,Workload,Collaboration Style\n';
        const expertsRows = analysis.expertProfiles.map((expert: any) => {
            return [
                `"${expert.name}"`,
                `"${expert.email}"`,
                expert.expertise,
                expert.contributions,
                `"${this.safeFormatDate(expert.lastCommit)}"`,
                `"${(expert.specializations || []).join('; ')}"`,
                `"${expert.teamRole || ''}"`,
                `"${expert.communicationStyle || ''}"`,
                `"${expert.workloadIndicator || ''}"`,
                `"${expert.collaborationStyle || ''}"`
            ].join(',');
        }).join('\n');
        
        // Files CSV
        const filesHeader = 'File Name,File Path,Expert Count,Primary Expert,Change Frequency\n';
        const filesRows = analysis.fileExpertise.map((file: any) => {
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
            const insightsRows = analysis.managementInsights.map((insight: any) => {
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

    private calculateDaysAgo(lastCommitDate: any): string {
        try {
            if (!lastCommitDate) {
                return 'N/A';
            }

            let date: Date;
            
            // Convert the input to a Date object
            if (lastCommitDate instanceof Date) {
                date = lastCommitDate;
            } else if (typeof lastCommitDate === 'string') {
                // Try to parse the string date
                date = new Date(lastCommitDate);
            } else if (typeof lastCommitDate === 'number') {
                // For timestamp in seconds (standard Unix timestamps)
                if (lastCommitDate < 9999999999) {
                    date = new Date(lastCommitDate * 1000);
                } else {
                    // For timestamp in milliseconds
                    date = new Date(lastCommitDate);
                }
            } else {
                return 'N/A';
            }

            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'N/A';
            }

            // Calculate days difference using UTC to avoid timezone issues
            const currentDate = new Date();
            const utcDate1 = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
            const utcDate2 = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
            const millisecondsPerDay = 1000 * 60 * 60 * 24;
            const daysDifference = Math.floor((utcDate2 - utcDate1) / millisecondsPerDay);
            
            // Return "0" for same day commits
            if (daysDifference === 0) {
                return '0';
            }

            return daysDifference.toString();

        } catch (error) {
            console.error('Error calculating days ago:', error);
            return 'N/A';
        }
    }

    /**
     * Generates the HTML content for the webview
     */
    private getWebviewContent(analysis: ExpertiseAnalysis): string {
        const cspSource = 'vscode-resource:';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https://github.com https://avatars.githubusercontent.com data:;">
    <title>Team X-Ray Analysis</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto',sans-serif;font-size:14px;line-height:1.6;color:#e2e8f0;background:#0a0a0f;padding:0;margin:0;min-height:100vh}
        .container{max-width:1200px;margin:0 auto;padding:32px 24px}

        /* Header with scan-line pattern */
        .header{background:#0a0a0f;background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(6,182,212,0.03) 2px,rgba(6,182,212,0.03) 4px);padding:48px 40px;border:1px solid #1e293b;border-radius:12px;text-align:center;margin-bottom:30px}
        .header h1{font-size:2.5em;font-weight:800;letter-spacing:0.08em;color:#e2e8f0;text-shadow:0 0 20px rgba(6,182,212,0.4),0 0 40px rgba(6,182,212,0.15);margin-bottom:8px}
        .header .repo{font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;color:#06b6d4;font-size:1.1em;margin-bottom:16px}
        .header .stats{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
        .pill{display:inline-block;padding:4px 14px;border:1px solid #1e293b;border-radius:999px;font-size:0.85em;color:#64748b}
        .pill strong{color:#e2e8f0}

        /* Sections */
        .section{background:#12121a;border:1px solid #1e293b;border-radius:12px;padding:30px;margin-bottom:30px}
        .section h2{color:#e2e8f0;font-size:1.4em;border-bottom:2px solid #1e293b;padding-bottom:10px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;cursor:default}
        .section h2 .accent{color:#06b6d4}

        /* Expert grid & cards */
        .experts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
        .expert-card{background:#12121a;border:1px solid #1e293b;border-radius:8px;padding:20px;transition:box-shadow 0.2s,border-color 0.2s;display:flex;flex-direction:column;position:relative;overflow:hidden}
        .expert-card.high{border-left:3px solid #06b6d4;box-shadow:inset 4px 0 12px -4px rgba(6,182,212,0.15)}
        .expert-card.low{opacity:0.6}
        .expert-card:hover{border-color:#1e293b}

        .expert-header{display:flex;align-items:center;margin-bottom:12px}
        .expert-avatar{width:40px;height:40px;border-radius:8px;margin-right:12px;overflow:hidden;position:relative;flex-shrink:0}
        .expert-avatar img{width:100%;height:100%;object-fit:cover;position:relative;z-index:2}
        .expert-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:white;font-size:14px;font-weight:600;position:absolute;top:0;left:0;z-index:1}
        .expert-info{flex:1;min-width:0}
        .expert-info h3{margin:0 0 2px 0;font-size:1.15em;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .role-badge{display:inline-block;font-size:0.7em;text-transform:uppercase;letter-spacing:0.08em;color:#8b5cf6;border:1px solid rgba(139,92,246,0.3);border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:middle}
        .expert-email{font-size:0.85em;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        /* SVG bar chart */
        .bar-chart{width:100%;margin:10px 0}
        .bar-chart svg{width:100%;height:24px;border-radius:4px;overflow:hidden}

        /* Stats row */
        .expert-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
        .stat{text-align:center;padding:8px;background:#0a0a0f;border-radius:6px;border:1px solid #1e293b}
        .stat-value{font-weight:700;font-size:1.05em;color:#06b6d4;display:block}
        .stat-label{font-size:0.78em;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}

        /* Specialization chips */
        .chips,.specializations{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
        .chip,.specialization-tag{font-size:0.75em;padding:3px 10px;background:#0a0a0f;border:1px solid #1e293b;border-radius:999px;color:#64748b}

        /* Expert file list */
        .expert-files{margin:12px 0;border-radius:6px;overflow:hidden}
        .expert-files-header{padding:8px 12px;display:flex;justify-content:space-between;align-items:center;color:#e2e8f0;font-size:13px;background:#0a0a0f;border:1px solid #1e293b;border-radius:6px;cursor:pointer}
        .expert-files-header:hover{background:#12121a}
        .expert-files-content{max-height:500px;opacity:1;transition:all 0.3s ease;background:#0a0a0f}
        .expert-files-content.collapsed{max-height:0;opacity:0;overflow:hidden}
        .expert-file-item{padding:8px 12px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;font-size:12px;cursor:pointer}
        .expert-file-item:hover{background:rgba(6,182,212,0.05)}
        .expert-file-item .file-name{color:#06b6d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%}
        .expert-file-item .file-changes{color:#64748b;font-size:11px}
        .expert-file-item.more-files{text-align:center;color:#64748b;font-size:11px;cursor:default}

        /* Expert action buttons */
        .expert-actions{display:flex;gap:8px;margin-top:auto}
        .expert-button{flex:1;padding:8px 12px;font-size:12px;border-radius:6px;background:transparent;border:1px solid #1e293b;color:#e2e8f0;cursor:pointer;transition:all 0.2s ease;display:flex;align-items:center;justify-content:center;gap:6px}
        .expert-button:hover{background:rgba(6,182,212,0.1);border-color:#06b6d4}
        .expert-button.primary{background:rgba(6,182,212,0.15);border:1px solid #06b6d4;color:#06b6d4}
        .expert-button.primary:hover{background:rgba(6,182,212,0.25)}

        /* Management Insights - used by renderManagementInsights() */
        .management-empty,.health-empty{text-align:center;padding:48px 24px;color:#64748b}
        .management-empty .empty-state-icon,.health-empty .empty-state-icon{font-size:48px;margin-bottom:16px;opacity:0.5}
        .management-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px;margin-bottom:24px}
        .management-card{background:#12121a;border:1px solid #1e293b;border-radius:8px;padding:20px;border-top:6px solid #1e293b;transition:border-color 0.2s}
        .management-card.risk{border-top-color:#ef4444}
        .management-card.opportunity{border-top-color:#10b981}
        .management-card.efficiency{border-top-color:#3b82f6}
        .management-card.growth{border-top-color:#f59e0b}
        .management-card:hover{border-color:#2d3748}
        .management-card h4{color:#e2e8f0;margin:0 0 6px 0;font-size:1.1em}
        .management-card p{color:#94a3b8;font-size:0.95em;margin-bottom:12px}
        .management-header{display:flex;justify-content:space-between;margin-bottom:12px}
        .management-category{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase}
        .management-category.risk{background:rgba(239,68,68,0.15);color:#ef4444}
        .management-category.opportunity{background:rgba(16,185,129,0.15);color:#10b981}
        .management-category.efficiency{background:rgba(59,130,246,0.15);color:#3b82f6}
        .management-category.growth{background:rgba(245,158,11,0.15);color:#f59e0b}
        .management-priority{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600}
        .management-priority.high{color:#ef4444}
        .management-priority.medium{color:#f59e0b}
        .management-priority.low{color:#10b981}
        .management-actions{background:#0a0a0f;border:1px solid #1e293b;border-radius:6px;padding:14px;margin:12px 0}
        .management-actions h5{margin:0 0 8px 0;font-size:0.8em;text-transform:uppercase;letter-spacing:0.06em;color:#64748b}
        .management-actions ul{margin:0;padding:0;list-style:none}
        .management-actions li{padding:4px 0;color:#94a3b8;font-size:0.9em}
        .management-actions li::before{content:'›';color:#06b6d4;margin-right:8px;font-weight:bold}
        .management-impact{font-size:0.85em;color:#64748b;margin-top:10px}
        .management-impact strong{color:#e2e8f0}

        /* Team Health Metrics - used by renderTeamHealthMetrics() */
        .health-metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:24px}
        .health-metric-card{background:#12121a;border:1px solid #1e293b;border-radius:8px;padding:20px}
        .health-metric-card h4{margin:0 0 16px 0;color:#e2e8f0;font-size:1.1em}
        .risk-score{padding:8px 16px;border-radius:8px;font-weight:600;margin-bottom:16px;text-align:center}
        .risk-score.high-risk{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
        .risk-score.medium-risk{background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)}
        .risk-score.low-risk{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
        .metric-details{margin-top:12px}
        .metric-item{margin-bottom:12px;padding:12px;border-radius:6px}
        .metric-item.critical{background:rgba(239,68,68,0.08);border-left:3px solid #ef4444}
        .metric-item.warning{background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b}
        .metric-item.positive{background:rgba(16,185,129,0.08);border-left:3px solid #10b981}
        .metric-item strong{display:block;margin-bottom:8px;color:#e2e8f0}
        .metric-item ul{margin:0;padding-left:16px;color:#94a3b8}
        .collaboration-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px}
        .collab-stat{background:#0a0a0f;border:1px solid #1e293b;padding:12px;border-radius:6px;text-align:center}
        .collab-stat .stat-value{display:block;font-size:1.4em;font-weight:700;color:#06b6d4;margin-bottom:4px}
        .collab-stat .stat-label{font-size:0.78em;color:#64748b}
        .performance-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
        .perf-stat{background:#0a0a0f;border:1px solid #1e293b;padding:12px;border-radius:6px}
        .perf-stat .stat-label{display:block;font-size:0.78em;color:#64748b;margin-bottom:4px}
        .perf-stat .stat-value{font-size:1.1em;font-weight:600;color:#06b6d4}

        /* Key insights */
        .insight-item{display:flex;align-items:baseline;gap:14px;padding:14px 0;border-bottom:1px solid #1e293b}
        .insight-item:last-child{border-bottom:none}
        .insight-num{font-size:1.3em;font-weight:800;color:#06b6d4;min-width:28px;text-align:right}
        .insight-text{color:#94a3b8;font-size:0.95em}

        /* Action buttons */
        .action-buttons{display:flex;gap:16px;justify-content:center;margin-top:32px;flex-wrap:wrap}
        .refresh-button,.export-button{border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s ease;display:flex;align-items:center;justify-content:center;gap:8px;min-width:180px}
        .refresh-button{background:rgba(6,182,212,0.15);border:1px solid #06b6d4;color:#06b6d4}
        .refresh-button:hover{background:rgba(6,182,212,0.25)}
        .export-button{background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#8b5cf6}
        .export-button:hover{background:rgba(139,92,246,0.25)}

        /* Collapsible */
        .collapsible-header{cursor:pointer;user-select:none}
        .collapsible-header:hover{opacity:0.8}
        .toggle-icon{font-size:14px;transition:transform 0.3s ease;margin-left:12px;color:#64748b}
        .toggle-icon.collapsed{transform:rotate(-90deg)}
        .collapsible-content{overflow:hidden;transition:all 0.4s ease;max-height:5000px;opacity:1;margin-top:16px}
        .collapsible-content.collapsed{max-height:0;opacity:0;margin:0}

        /* Footer */
        .footer{text-align:center;padding:24px 0;margin-top:20px;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:0.8em;color:#64748b;border-top:1px solid #1e293b}

        /* Animations */
        @keyframes slideInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .expert-card{animation:slideInUp 0.4s ease forwards}
        .expert-card:nth-child(1){animation-delay:0.05s}
        .expert-card:nth-child(2){animation-delay:0.1s}
        .expert-card:nth-child(3){animation-delay:0.15s}
        .expert-card:nth-child(4){animation-delay:0.2s}

        @media(max-width:768px){.container{padding:16px}.experts-grid,.management-grid{grid-template-columns:1fr}.header{padding:24px 20px}.header h1{font-size:1.8em}}
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>TEAM X-RAY</h1>
        <div class="repo">${analysis.repository}</div>
        <div class="stats">
            <span class="pill">Generated <strong>${this.safeFormatDate(analysis.generatedAt)}</strong></span>
            <span class="pill"><strong>${analysis.totalFiles}</strong> files scanned</span>
            <span class="pill"><strong>${analysis.totalExperts}</strong> experts identified</span>
            <span class="pill"><strong>${analysis.insights.length}</strong> insights</span>
        </div>
    </div>

    <div class="section">
        <h2><span class="accent">▸</span> Expert Profiles</h2>
        <div class="experts-grid">
            ${analysis.expertProfiles.map(expert => {
                const barColor = expert.expertise >= 20 ? '#06b6d4' : '#374151';
                const cardClass = expert.expertise >= 60 ? 'high' : expert.expertise < 20 ? 'low' : '';
                return `
                <div class="expert-card ${cardClass}">
                    <div class="expert-header">
                        <div class="expert-avatar">
                            <img src="https://github.com/${this.getGitHubUsername(expert.email, expert.name)}.png?size=96" 
                                 alt="${expert.name}"
                                 class="expert-avatar-img"
                                 onload="this.nextElementSibling.style.display='none';"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="expert-avatar-fallback">
                                ${expert.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                        </div>
                        <div class="expert-info">
                            <h3>${expert.name}${expert.teamRole ? `<span class="role-badge">${expert.teamRole}</span>` : ''}</h3>
                            <div class="expert-email">${expert.email}</div>
                        </div>
                    </div>

                    <div class="bar-chart"><svg viewBox="0 0 400 24"><rect width="400" height="24" fill="#1e293b"/><rect width="${expert.expertise * 4}" height="24" fill="${barColor}"/><text x="${Math.max(expert.expertise * 4 - 8, 30)}" y="17" text-anchor="end" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">${expert.expertise}%</text></svg></div>

                    <div class="expert-stats">
                        <div class="stat"><div class="stat-value">${expert.expertise}%</div><div class="stat-label">Expertise</div></div>
                        <div class="stat"><div class="stat-value">${expert.contributions}</div><div class="stat-label">Commits</div></div>
                        <div class="stat"><div class="stat-value">${this.calculateDaysAgo(expert.lastCommit)}</div><div class="stat-label">Days Ago</div></div>
                    </div>

                    ${(expert.specializations || []).length ? `<div class="chips">${(expert.specializations || []).map(spec => `<span class="chip">${spec}</span>`).join('')}</div>` : ''}

                    <div class="expert-files">
                        <div class="expert-files-header" onclick="toggleExpertFiles('${expert.name.replace(/\s+/g, '-')}')">
                            <span>📁 Key Files (${analysis.fileExpertise.filter(file => 
                                file.experts.some(e => e.name === expert.name)
                            ).length})</span>
                            <span class="toggle-icon collapsed" id="${expert.name.replace(/\s+/g, '-')}-icon">▶</span>
                        </div>
                        <div class="expert-files-content collapsed" id="${expert.name.replace(/\s+/g, '-')}-content">
                            ${analysis.fileExpertise.filter(file => 
                                file.experts.some(e => e.name === expert.name)
                            ).slice(0, 5).map(file => `
                                <div class="expert-file-item" onclick="openFile('${file.filePath}'); event.stopPropagation();">
                                    <div class="file-name">${file.fileName}</div>
                                    <div class="file-changes">🔄 ${file.changeFrequency}</div>
                                </div>
                            `).join('')}
                            ${analysis.fileExpertise.filter(file => 
                                file.experts.some(e => e.name === expert.name)
                            ).length > 5 ? `
                                <div class="expert-file-item more-files">
                                    <em>+ ${analysis.fileExpertise.filter(file => 
                                        file.experts.some(e => e.name === expert.name)
                                    ).length - 5} more files</em>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="expert-actions">
                        <button class="expert-button primary" onclick="showExpertDetails('${expert.name}')">
                            📋 View Details
                        </button>
                        <button class="expert-button" onclick="getExpertActivity('${expert.name}')">
                            🔍 Recent Activity
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    </div>

    <div class="section">
        <h2 onclick="toggleSection('management')" class="collapsible-header">
            <span><span class="accent">▸</span> Management Insights</span>
            <span class="toggle-icon" id="management-icon">▼</span>
        </h2>
        <div class="collapsible-content" id="management-content">
            ${this.renderManagementInsights(analysis)}
        </div>
    </div>

    <div class="section">
        <h2 onclick="toggleSection('health')" class="collapsible-header">
            <span><span class="accent">▸</span> Team Health Metrics</span>
            <span class="toggle-icon" id="health-icon">▼</span>
        </h2>
        <div class="collapsible-content" id="health-content">
            ${this.renderTeamHealthMetrics(analysis)}
        </div>
    </div>

    <div class="section">
        <h2 onclick="toggleSection('ai-insights')" class="collapsible-header">
            <span><span class="accent">▸</span> Key Insights</span>
            <span class="toggle-icon" id="ai-insights-icon">▼</span>
        </h2>
        <div class="collapsible-content" id="ai-insights-content">
            ${analysis.insights.map((insight, i) => `
                <div class="insight-item">
                    <div class="insight-num">${i + 1}</div>
                    <div class="insight-text">${typeof insight === 'string' ? insight : insight.description}</div>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="action-buttons">
        <button class="refresh-button" onclick="refreshAnalysis()">
            🔄 Refresh Analysis
        </button>
        <button class="export-button" onclick="exportAnalysis()">
            📊 Export Analysis
        </button>
    </div>

    <div class="footer">Generated by Team X-Ray · ${this.safeFormatDate(analysis.generatedAt)}</div>
</div>

    <script>
        const vscode = acquireVsCodeApi();

        function showExpertDetails(expertName) {
            const expert = ${JSON.stringify(analysis.expertProfiles)}.find(e => e.name === expertName);
            if (expert) {
                vscode.postMessage({
                    command: 'showExpertDetails',
                    expert: expert
                });
            }
        }

        function getExpertActivity(expertName) {
            const expert = ${JSON.stringify(analysis.expertProfiles)}.find(e => e.name === expertName);
            if (expert) {
                vscode.postMessage({
                    command: 'getExpertActivity',
                    expert: expert
                });
            }
        }

        function openFile(filePath) {
            vscode.postMessage({
                command: 'openFile',
                filePath: filePath
            });
        }

        function refreshAnalysis() {
            vscode.postMessage({
                command: 'refreshAnalysis'
            });
        }

        function exportAnalysis() {
            vscode.postMessage({
                command: 'exportAnalysis'
            });
        }

        function toggleExpertFiles(expertId) {
            const content = document.getElementById(expertId + '-content');
            const icon = document.getElementById(expertId + '-icon');
            
            if (content && icon) {
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                    content.classList.remove('collapsed');
                    icon.classList.remove('collapsed');
                    icon.textContent = '▼';
                } else {
                    content.classList.add('collapsed');
                    icon.classList.add('collapsed');
                    icon.textContent = '▶';
                }
            }
        }

        function toggleSection(sectionId) {
            const content = document.getElementById(sectionId + '-content');
            const icon = document.getElementById(sectionId + '-icon');
            
            if (content && icon) {
                const isCollapsed = content.classList.contains('collapsed');
                
                if (isCollapsed) {
                    content.classList.remove('collapsed');
                    icon.classList.remove('collapsed');
                    icon.textContent = '▼';
                } else {
                    content.classList.add('collapsed');
                    icon.classList.add('collapsed');
                    icon.textContent = '▶';
                }
            }
        }
    </script>
</body>
</html>`;
    }
}
