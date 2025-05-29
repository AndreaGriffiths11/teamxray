import * as vscode from 'vscode';
import { ExpertiseAnalysis, Expert, FileExpertise } from './expertise-analyzer';

export class ExpertiseWebviewProvider {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Creates and shows a webview panel with expertise analysis results
     */
    public showAnalysisResults(analysis: ExpertiseAnalysis): void {
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
                    case 'openFile':
                        this.openFile(message.filePath);
                        break;
                    case 'refreshAnalysis':
                        vscode.commands.executeCommand('teamxray.analyzeRepository');
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
            `Last Commit: ${expert.lastCommit instanceof Date ? expert.lastCommit.toLocaleDateString() : 'Unknown'}`,
            `Specializations: ${(expert.specializations || []).join(', ')}`
        ];

        vscode.window.showQuickPick(items, {
            title: `Expert Details: ${expert.name}`,
            canPickMany: false
        });
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
     * Generates the HTML content for the webview
     */
    private getWebviewContent(analysis: ExpertiseAnalysis): string {
        const cspSource = 'vscode-resource:';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
    <title>Team Expertise Analysis</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }

        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }

        .header h1 {
            color: var(--vscode-textLink-foreground);
            margin: 0 0 10px 0;
            font-size: 24px;
        }

        .metadata {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .section {
            margin-bottom: 40px;
        }

        .section h2 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        .expert-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .expert-card:hover {
            border-color: var(--vscode-textLink-foreground);
        }

        .expert-name {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
        }

        .expert-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 10px;
        }

        .stat {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
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

        .specializations {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }

        .specialization-tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }

        .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .file-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .file-path {
            color: var(--vscode-textLink-foreground);
            font-family: var(--vscode-editor-font-family);
        }

        .file-experts {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .insights-list {
            list-style: none;
            padding: 0;
        }

        .insights-list li {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 12px 16px;
            margin-bottom: 10px;
            border-radius: 0 4px 4px 0;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 20px;
            border-radius: 6px;
            text-align: center;
        }

        .stat-number {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            display: block;
        }

        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            margin-top: 5px;
        }

        .refresh-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 20px;
        }

        .refresh-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Team Expertise Analysis</h1>
        <div class="metadata">
            Repository: <strong>${analysis.repository}</strong> | 
            Generated: ${analysis.generatedAt.toLocaleString()} |
            Files: ${analysis.totalFiles} |
            Experts: ${analysis.totalExperts}
        </div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <span class="stat-number">${analysis.totalFiles}</span>
            <div class="stat-label">Files Analyzed</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.totalExperts}</span>
            <div class="stat-label">Team Members</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.fileExpertise.length}</span>
            <div class="stat-label">Code Files</div>
        </div>
        <div class="stat-card">
            <span class="stat-number">${analysis.insights.length}</span>
            <div class="stat-label">Insights</div>
        </div>
    </div>

    <div class="section">
        <h2>👥 Team Experts</h2>
        ${analysis.expertProfiles.map(expert => `
            <div class="expert-card" onclick="showExpertDetails('${expert.name}')">
                <div class="expert-name">${expert.name}</div>
                <div class="expert-stats">
                    <span class="stat">Expertise: ${expert.expertise}%</span>
                    <span class="stat">Contributions: ${expert.contributions}</span>
                    <span class="stat">Last Commit: ${expert.lastCommit instanceof Date ? expert.lastCommit.toLocaleDateString() : 'Unknown'}</span>
                </div>
                <div class="expertise-bar">
                    <div class="expertise-fill" style="width: ${expert.expertise}%"></div>
                </div>
                <div class="specializations">
                    ${(expert.specializations || []).map(spec => 
                        `<span class="specialization-tag">${spec}</span>`
                    ).join('')}
                </div>
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>📁 File Expertise Map</h2>
        ${analysis.fileExpertise.slice(0, 20).map(file => `
            <div class="file-item" onclick="openFile('${file.filePath}')">
                <div>
                    <div class="file-path">${file.fileName}</div>
                    <div class="file-experts">
                        Experts: ${file.experts.map(e => e.name).join(', ')}
                    </div>
                </div>
                <div class="stat">
                    Changes: ${file.changeFrequency}
                </div>
            </div>
        `).join('')}
        ${analysis.fileExpertise.length > 20 ? 
            `<div style="color: var(--vscode-descriptionForeground); text-align: center; margin-top: 15px;">
                Showing first 20 files of ${analysis.fileExpertise.length} total
            </div>` : ''
        }
    </div>

    <div class="section">
        <h2>💡 Insights & Recommendations</h2>
        <ul class="insights-list">
            ${analysis.insights.map(insight => `<li>${insight}</li>`).join('')}
        </ul>
    </div>

    <button class="refresh-button" onclick="refreshAnalysis()">
        🔄 Refresh Analysis
    </button>

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
    </script>
</body>
</html>`;
    }
}
