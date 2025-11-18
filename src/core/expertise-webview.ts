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
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team X-Ray Analysis Report - ${analysis.repository}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
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
            📊 ${analysis.repository} • Generated ${this.safeFormatDate(analysis.generatedAt)}<br>
            ${analysis.totalFiles} files analyzed • ${analysis.totalExperts} team experts identified
        </div>
    </div>

    <div class="section">
        <h2>👥 Team Expert Profiles</h2>
        <div class="expert-grid">
            ${analysis.expertProfiles.map((expert: any) => `
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
                            <div class="stat-value">${this.calculateDaysAgo(expert.lastCommit)}</div>
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
                ${analysis.managementInsights.map((insight: any) => `
                    <div class="management-card ${insight.category.toLowerCase()}">
                        <h3>${insight.title}</h3>
                        <p><strong>Category:</strong> ${insight.category} | <strong>Priority:</strong> ${insight.priority}</p>
                        <p>${insight.description}</p>
                        <div>
                            <strong>Action Items (${insight.timeline}):</strong>
                            <ul>
                                ${insight.actionItems.map((action: string) => `<li>${action}</li>`).join('')}
                            </ul>
                        </div>
                        <p><strong>Expected Impact:</strong> ${insight.impact}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}

    <div class="section">
        <h2>💡 Key Insights</h2>
        <ul class="insights-list">
            ${analysis.insights.map((insight: any) => `
                <li>${typeof insight === 'string' ? insight : insight.description}</li>
            `).join('')}
        </ul>
    </div>

    <div class="generated-info">
        Generated by Team X-Ray VS Code Extension<br>
        ${new Date().toLocaleString()}
    </div>
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
    <title>Team Expertise Analysis</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: var(--vscode-foreground);
            background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-sideBar-background) 100%);
            padding: 0;
            margin: 0;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 32px 24px;
        }

        .header {
            text-align: center;
            margin-bottom: 48px;
            background: rgba(255, 255, 255, 0.02);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 32px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header h1 {
            background: linear-gradient(135deg, var(--vscode-textLink-foreground) 0%, #3b82f6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0 0 16px 0;
            font-size: 36px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .metadata {
            color: var(--vscode-descriptionForeground);
            font-size: 16px;
            opacity: 0.8;
        }

        .section {
            margin-bottom: 56px;
        }

        .section h2 {
            color: var(--vscode-foreground);
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 24px 0;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .section h2::before {
            content: '';
            width: 4px;
            height: 24px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 2px;
        }

        .experts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .expert-card {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .expert-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .expert-card:hover::before {
            opacity: 1;
        }

        .expert-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }

        .expert-avatar {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            margin-right: 12px;
            overflow: hidden;
            position: relative;
            flex-shrink: 0;
        }

        .expert-avatar-fallback {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            font-size: 16px;
            font-weight: 600;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
        }

        .expert-info {
            flex: 1;
            min-width: 0; /* Enables text truncation */
        }

        .expert-info h3 {
            margin: 0 0 2px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .expert-email {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .expert-content {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
        }

        .expert-stats {
            display: flex;
            gap: 8px;
            flex: 1;
        }

        .stat {
            background: rgba(255, 255, 255, 0.05);
            padding: 8px;
            border-radius: 8px;
            text-align: center;
            flex: 1;
        }

        .stat-value {
            display: block;
            font-size: 18px;
            font-weight: 700;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 2px;
        }

        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .expertise-indicator {
            width: 70px;
            height: 70px;
            flex-shrink: 0;
            margin-left: 8px;
        }

        .expertise-ring {
            position: relative;
            width: 100%;
            height: 100%;
        }

        .expertise-circle {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
            padding: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .expertise-inner {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: var(--vscode-editor-background);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        .expertise-score {
            font-size: 18px;
            font-weight: 700;
            color: var(--vscode-textLink-foreground);
            line-height: 1;
        }

        .expertise-text {
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .specializations {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 12px;
        }

        .specialization-tag {
            background: rgba(59, 130, 246, 0.1);
            color: var(--vscode-textLink-foreground);
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 4px;
            white-space: nowrap;
        }

        .expert-files {
            margin: 12px 0;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
        }

        .expert-files-header {
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: var(--vscode-foreground);
            font-size: 13px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
        }

        .expert-files-header:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .expert-files-content {
            max-height: 500px;
            opacity: 1;
            transition: all 0.3s ease;
            background: rgba(0, 0, 0, 0.2);
        }

        .expert-files-content.collapsed {
            max-height: 0;
            opacity: 0;
        }

        .expert-file-item {
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            cursor: pointer;
        }

        .expert-file-item:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .expert-file-item .file-name {
            color: var(--vscode-textLink-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 70%;
        }

        .expert-file-item .file-changes {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .expert-file-item.more-files {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            background: rgba(255, 255, 255, 0.02);
            cursor: default;
        }

        .expert-actions {
            display: flex;
            gap: 8px;
            margin-top: auto;
        }

        .expert-button {
            flex: 1;
            padding: 8px 12px;
            font-size: 12px;
            border-radius: 6px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .expert-button:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
            transform: translateY(-1px);
        }

        .expert-button.primary {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            border: none;
            color: white;
        }

        .expert-button.primary:hover {
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
        }
        }

        .expertise-bar {
            background-color: var(--vscode-progressBar-background);
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 10px;
        }

        .expertise-fill {
            background-color: var(--vscode-progressBar-foreground);
            height: 100%;
            transition: width 0.3s ease;
        }



        .insights-section {
            background: rgb(30, 34, 42);
            border-radius: 16px;
            padding: 24px;
        }

        .insight-container {
            background: rgba(30, 34, 42, 0.9);
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
            display: inline-block;
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
            color: var(--vscode-foreground);
        }

        .insight-text {
            margin: 0 0 20px 0;
            color: #e1e1e1;
            font-size: 14px;
            line-height: 1.6;
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
            color: var(--vscode-foreground);
        }

        .recommendations p {
            margin: 8px 0;
            color: #e1e1e1;
            font-size: 14px;
            line-height: 1.6;
        }

        .insights-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .insights-list li {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
            border: 1px solid rgba(59, 130, 246, 0.2);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 12px;
            position: relative;
            transition: all 0.3s ease;
        }

        .insights-list li::before {
            content: '💡';
            margin-right: 12px;
            font-size: 16px;
        }

        .insights-list li:hover {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
            border-color: rgba(59, 130, 246, 0.3);
            transform: translateY(-2px);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 24px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            text-align: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .stat-number {
            font-size: 32px;
            font-weight: 700;
            background: linear-gradient(135deg, var(--vscode-textLink-foreground), #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            display: block;
            margin-bottom: 8px;
        }

        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .action-buttons {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-top: 32px;
            flex-wrap: wrap;
        }

        .refresh-button, .export-button {
            border: none;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-width: 200px;
        }

        .refresh-button {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
        }

        .refresh-button:hover {
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            transform: translateY(-2px);
            box-shadow: 0 12px 24px rgba(59, 130, 246, 0.3);
        }

        .export-button {
            background: linear-gradient(135deg, #059669, #047857);
            color: white;
        }

        .export-button:hover {
            background: linear-gradient(135deg, #047857, #065f46);
            transform: translateY(-2px);
            box-shadow: 0 12px 24px rgba(5, 150, 105, 0.3);
        }

        .empty-state {
            text-align: center;
            padding: 48px 24px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        @keyframes slideInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .expert-card {
            animation: slideInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .expert-card:nth-child(1) { animation-delay: 0.1s; }
        .expert-card:nth-child(2) { animation-delay: 0.2s; }
        .expert-card:nth-child(3) { animation-delay: 0.3s; }
        .expert-card:nth-child(4) { animation-delay: 0.4s; }

        @media (max-width: 768px) {
            .container {
                padding: 16px;
            }
            
            .experts-grid {
                grid-template-columns: 1fr;
            }
            
            .expert-stats {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media (max-width: 480px) {
            .header h1 {
                font-size: 28px;
            }
            
            .expert-actions {
                flex-direction: column;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 20px;
        }

        .refresh-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        /* Management Insights Styles */
        .management-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .management-card {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
        }

        .management-card:hover {
            transform: translateY(-2px);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .management-card.risk {
            border-left: 4px solid #ef4444;
        }

        .management-card.opportunity {
            border-left: 4px solid #22c55e;
        }

        .management-card.efficiency {
            border-left: 4px solid #3b82f6;
        }

        .management-card.growth {
            border-left: 4px solid #a855f7;
        }

        .management-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .management-category {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .management-category.risk {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .management-category.opportunity {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .management-category.efficiency {
            background: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
        }

        .management-category.growth {
            background: rgba(168, 85, 247, 0.2);
            color: #a855f7;
        }

        .management-priority {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }

        .management-priority.high {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .management-priority.medium {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
        }

        .management-priority.low {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .management-actions {
            margin: 16px 0;
        }

        .management-actions h5 {
            margin: 0 0 8px 0;
            color: var(--vscode-textLink-foreground);
        }

        .management-actions ul {
            margin: 0;
            padding-left: 16px;
        }

        .management-impact {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
        }

        /* Team Health Metrics Styles */
        .health-metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }

        .health-metric-card {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .health-metric-card h4 {
            margin: 0 0 16px 0;
            color: var(--vscode-foreground);
            font-size: 18px;
        }

        .risk-score {
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 600;
            margin-bottom: 16px;
            text-align: center;
        }

        .risk-score.high-risk {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid #ef4444;
        }

        .risk-score.medium-risk {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
            border: 1px solid #f59e0b;
        }

        .risk-score.low-risk {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            border: 1px solid #22c55e;
        }

        .metric-item {
            margin-bottom: 16px;
            padding: 12px;
            border-radius: 8px;
        }

        .metric-item.critical {
            background: rgba(239, 68, 68, 0.1);
            border-left: 3px solid #ef4444;
        }

        .metric-item.warning {
            background: rgba(245, 158, 11, 0.1);
            border-left: 3px solid #f59e0b;
        }

        .metric-item.positive {
            background: rgba(34, 197, 94, 0.1);
            border-left: 3px solid #22c55e;
        }

        .metric-item strong {
            display: block;
            margin-bottom: 8px;
        }

        .metric-item ul {
            margin: 0;
            padding-left: 16px;
        }

        .collaboration-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        .collab-stat {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }

        .collab-stat .stat-value {
            display: block;
            font-size: 24px;
            font-weight: 700;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 4px;
        }

        .collab-stat .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .performance-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        .perf-stat {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 8px;
        }

        .perf-stat .stat-label {
            display: block;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }

        .perf-stat .stat-value {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }

        /* Enhanced Insight Styles */
        .insight-header {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }

        .insight-type, .insight-impact {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }

        .insight-type.strength {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .insight-type.gap {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .insight-type.opportunity {
            background: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
        }

        .insight-type.risk {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
        }

        .insight-impact.high {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .insight-impact.medium {
            background: rgba(245, 158, 11, 0.2);
            color: #f59e0b;
        }

        .insight-impact.low {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .insight-recommendations {
            margin-top: 12px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
        }

        .insight-recommendations ul {
            margin: 8px 0 0 0;
            padding-left: 16px;
        }

        /* Collapsible Section Styles */
        .collapsible-header {
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.3s ease;
            user-select: none;
        }

        .collapsible-header:hover {
            opacity: 0.8;
            transform: translateX(4px);
        }

        .toggle-icon {
            font-size: 16px;
            transition: transform 0.3s ease;
            margin-left: 12px;
        }

        .toggle-icon.collapsed {
            transform: rotate(-90deg);
        }

        .collapsible-content {
            overflow: hidden;
            transition: all 0.4s ease;
            max-height: 2000px;
            opacity: 1;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            margin-top: 10px;
            background: rgba(255, 255, 255, 0.02);
        }

        .collapsible-content.collapsed {
            max-height: 0;
            opacity: 0;
            margin: 0;
            padding: 0;
            border: none;
        }

        /* Override file-section margin when collapsed */
        .file-section.collapsed {
            margin-bottom: 0;
            padding: 0;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>✨ Team Expertise Analysis</h1>
        <div class="metadata">
            📊 ${analysis.repository} • Generated ${this.safeFormatDate(analysis.generatedAt)} • ${analysis.totalFiles} files • ${analysis.totalExperts} experts
        </div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <span class="stat-number">${analysis.totalFiles}</span>
            <div class="stat-label">Files Analyzed</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.totalExperts}</span>
            <div class="stat-label">Team Experts</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.fileExpertise.length}</span>
            <div class="stat-label">Code Files</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.insights.length}</span>
            <div class="stat-label">AI Insights</div>
        </div>
    </div>

    <div class="section">
        <h2>👥 Expert Profiles</h2>
        <div class="experts-grid">
            ${analysis.expertProfiles.map(expert => `
                <div class="expert-card">
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
                            <h3>${expert.name}</h3>
                            <div class="expert-email">${expert.email}</div>
                        </div>
                    </div>
                    
                    <div class="expert-content">
                        <div class="expert-stats">
                            <div class="stat">
                                <span class="stat-value">${expert.expertise}%</span>
                                <span class="stat-label">Expertise</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${expert.contributions}</span>
                                <span class="stat-label">Commits</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${
                                    this.calculateDaysAgo(expert.lastCommit)
                                }</span>
                                <span class="stat-label">Days Ago</span>
                            </div>
                        </div>

                        <div class="expertise-indicator">
                            <div class="expertise-ring">
                                <div class="expertise-circle">
                                    <div class="expertise-inner">
                                        <div class="expertise-score">${expert.expertise}%</div>
                                        <div class="expertise-text">Expertise</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="specializations">
                        ${(expert.specializations || []).map(spec => 
                            `<span class="specialization-tag">${spec}</span>`
                        ).join('')}
                    </div>

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
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h2>📊 Management Dashboard</h2>
        ${this.renderManagementInsights(analysis)}
    </div>


    <div class="section">
        <h2>🏥 Team Health Metrics</h2>
        ${this.renderTeamHealthMetrics(analysis)}
    </div>

    <div class="section">
        <h2 onclick="toggleSection('ai-insights')" class="collapsible-header">
            💡 AI Insights & Recommendations
            <span class="toggle-icon" id="ai-insights-icon">▼</span>
        </h2>
        <div class="insights-section collapsible-content" id="ai-insights-content">
            <div class="insight-container">
                <div class="insight-badges">
                    <span class="badge opportunity">OPPORTUNITY</span>
                    <span class="badge medium">MEDIUM</span>
                </div>
                <h3 class="insight-title">Analysis Insight</h3>
                <p class="insight-text">${analysis.insights[0]?.description || 'No insights available.'}</p>
                <div class="recommendations">
                    <h4>Recommendations:</h4>
                    ${(analysis.insights.slice(1) || []).map(insight => `
                        <p>${typeof insight === 'string' ? insight : insight.description}</p>
                    `).join('')}
                </div>
            </div>
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
                    // Expand
                    content.classList.remove('collapsed');
                    icon.classList.remove('collapsed');
                    icon.textContent = '▼';
                } else {
                    // Collapse
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
