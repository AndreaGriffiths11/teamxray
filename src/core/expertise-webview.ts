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
                    case 'getExpertActivity':
                        this.getExpertActivity(message.expert);
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

    private calculateDaysAgo(lastCommitDate: any): string {
        try {
            // For debugging - useful during development
            console.log("Input lastCommitDate:", lastCommitDate, typeof lastCommitDate);
            
            // If there's no date, return 'N/A' - we won't guess
            if (!lastCommitDate) {
                return 'N/A';
            }
            
            // If it's already a Date object and valid
            if (lastCommitDate instanceof Date && !isNaN(lastCommitDate.getTime())) {
                const days = Math.floor((new Date().getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24));
                return String(days);
            }
            
            // Handle string values - try multiple parsing approaches
            if (typeof lastCommitDate === 'string') {
                // Special case: if the string is empty, return 'N/A'
                if (lastCommitDate.trim() === '') {
                    return 'N/A';
                }
                
                // Try standard date parsing first
                let date = new Date(lastCommitDate);
                
                if (!isNaN(date.getTime())) {
                    const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                    return String(days);
                }
                
                // Try ISO-like format with flexible parsing
                const isoMatch = lastCommitDate.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
                if (isoMatch) {
                    date = new Date(Number(isoMatch[1]), Number(isoMatch[2])-1, Number(isoMatch[3]));
                    if (!isNaN(date.getTime())) {
                        const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                        return String(days);
                    }
                }
                
                // Try Unix timestamp (seconds since epoch)
                if (/^\d+$/.test(lastCommitDate)) {
                    const timestamp = parseInt(lastCommitDate, 10);
                    // Determine if seconds or milliseconds
                    const multiplier = timestamp > 9999999999 ? 1 : 1000;
                    date = new Date(timestamp * multiplier);
                    if (!isNaN(date.getTime())) {
                        const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                        return String(days);
                    }
                }
            }
            
            // Handle numeric timestamp
            if (typeof lastCommitDate === 'number') {
                // Determine if seconds or milliseconds
                const multiplier = lastCommitDate > 9999999999 ? 1 : 1000;
                const date = new Date(lastCommitDate * multiplier);
                if (!isNaN(date.getTime())) {
                    const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                    return String(days);
                }
            }
            
            // If all parsing attempts fail, return 'N/A'
            return 'N/A';
        } catch (e) {
            console.error("Error calculating days ago:", e);
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

        .file-section {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .file-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            transform: scaleY(0);
            transition: transform 0.3s ease;
        }

        .file-item:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateX(8px);
        }

        .file-item:hover::before {
            transform: scaleY(1);
        }

        .file-info {
            flex: 1;
        }

        .file-path {
            color: var(--vscode-foreground);
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .file-experts {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            opacity: 0.8;
        }

        .file-stats {
            display: flex;
            align-items: center;
            gap: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .insights-section {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
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

        .refresh-button {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
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
            margin: 0 auto;
            min-width: 200px;
        }

        .refresh-button:hover {
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            transform: translateY(-2px);
            box-shadow: 0 12px 24px rgba(59, 130, 246, 0.3);
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
        <h2>📁 File Expertise Map</h2>
        <div class="file-section">
            ${analysis.fileExpertise.slice(0, 20).map(file => `
                <div class="file-item" onclick="openFile('${file.filePath}')">
                    <div class="file-info">
                        <div class="file-path">${file.fileName}</div>
                        <div class="file-experts">
                            👨‍💻 ${file.experts.map(e => e.name).join(', ')}
                        </div>
                    </div>
                    <div class="file-stats">
                        <span>🔄 ${file.changeFrequency} changes</span>
                    </div>
                </div>
            `).join('')}
            ${analysis.fileExpertise.length > 20 ? 
                `<div class="empty-state">
                    <div class="empty-state-icon">📂</div>
                    <div>Showing first 20 files of ${analysis.fileExpertise.length} total</div>
                </div>` : ''
            }
        </div>
    </div>

    <div class="section">
        <h2>💡 AI Insights & Recommendations</h2>
        <div class="insights-section">
            <ul class="insights-list">
                ${analysis.insights.map(insight => `<li>${insight}</li>`).join('')}
            </ul>
        </div>
    </div>

    <button class="refresh-button" onclick="refreshAnalysis()">
        🔄 Refresh Analysis
    </button>
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
    </script>
</body>
</html>`;
    }
}
