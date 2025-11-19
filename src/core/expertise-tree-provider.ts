import * as vscode from 'vscode';
import { Expert, FileExpertise } from '../types/expert';
import { ExpertiseAnalysis } from './expertise-analyzer';

export class ExpertiseTreeProvider implements vscode.TreeDataProvider<ExpertiseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ExpertiseTreeItem | undefined | null | void> = new vscode.EventEmitter<ExpertiseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ExpertiseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private analysis: ExpertiseAnalysis | undefined;

    constructor() {}

    refresh(analysis?: ExpertiseAnalysis): void {
        this.analysis = analysis;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ExpertiseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ExpertiseTreeItem): Thenable<ExpertiseTreeItem[]> {
        if (!this.analysis) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level items
            return Promise.resolve([
                new ExpertiseTreeItem(
                    `📊 Overview (${this.analysis.totalFiles} files, ${this.analysis.totalExperts} experts)`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'overview'
                ),
                new ExpertiseTreeItem(
                    '👥 Team Members',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'experts'
                ),
                new ExpertiseTreeItem(
                    '📁 File Expertise',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'files'
                ),
                new ExpertiseTreeItem(
                    '💡 Insights',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'insights'
                )
            ]);
        }

        switch (element.contextValue) {
            case 'overview':
                return Promise.resolve([
                    new ExpertiseTreeItem(
                        `Repository: ${this.analysis.repository}`,
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    ),
                    new ExpertiseTreeItem(
                        `Generated: ${this.analysis.generatedAt.toLocaleString()}`,
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    ),
                    new ExpertiseTreeItem(
                        `Total Files: ${this.analysis.totalFiles}`,
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    ),
                    new ExpertiseTreeItem(
                        `Team Members: ${this.analysis.totalExperts}`,
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    )
                ]);

            case 'experts':
                return Promise.resolve(
                    this.analysis.expertProfiles.map(expert => 
                        new ExpertiseTreeItem(
                            `${expert.name} (${expert.expertise}%)`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'expert',
                            expert
                        )
                    )
                );

            case 'expert':
                if (element.expert) {
                    return Promise.resolve([
                        new ExpertiseTreeItem(
                            `📧 ${element.expert.email}`,
                            vscode.TreeItemCollapsibleState.None,
                            'expert-detail'
                        ),
                        new ExpertiseTreeItem(
                            `📈 ${element.expert.contributions} contributions`,
                            vscode.TreeItemCollapsibleState.None,
                            'expert-detail'
                        ),
                        new ExpertiseTreeItem(
                            `⏰ Last commit: ${this.safeFormatDate(element.expert.lastCommit)}`,
                            vscode.TreeItemCollapsibleState.None,
                            'expert-detail'
                        ),
                        new ExpertiseTreeItem(
                            `🎯 Specializations: ${(element.expert.specializations || []).join(', ')}`,
                            vscode.TreeItemCollapsibleState.None,
                            'expert-detail'
                        )
                    ]);
                }
                break;

            case 'files':
                return Promise.resolve(
                    this.analysis.fileExpertise.slice(0, 10).map(file => 
                        new ExpertiseTreeItem(
                            file.fileName,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'file',
                            undefined,
                            file
                        )
                    )
                );

            case 'file':
                if (element.fileExpertise) {
                    return Promise.resolve(
                        element.fileExpertise.experts.map(expert =>
                            new ExpertiseTreeItem(
                                `👤 ${expert.name} (${expert.expertise}%)`,
                                vscode.TreeItemCollapsibleState.None,
                                'file-expert',
                                expert
                            )
                        )
                    );
                }
                break;

            case 'insights':
                return Promise.resolve(
                    this.analysis.insights.map((insight) =>
                        new ExpertiseTreeItem(
                            typeof insight === 'string' ? insight : insight.title,
                            vscode.TreeItemCollapsibleState.None,
                            'insight'
                        )
                    )
                );
        }

        return Promise.resolve([]);
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
}

class ExpertiseTreeItem extends vscode.TreeItem {
    constructor(
        public override readonly label: string,
        public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public override readonly contextValue: string,
        public readonly expert?: Expert,
        public readonly fileExpertise?: FileExpertise
    ) {
        super(label, collapsibleState);

        this.tooltip = label;

        // Set icons based on context
        switch (contextValue) {
            case 'overview':
                this.iconPath = new vscode.ThemeIcon('graph');
                break;
            case 'experts':
                this.iconPath = new vscode.ThemeIcon('organization');
                break;
            case 'expert':
                this.iconPath = new vscode.ThemeIcon('person');
                break;
            case 'files':
                this.iconPath = new vscode.ThemeIcon('files');
                break;
            case 'file':
                this.iconPath = new vscode.ThemeIcon('file-code');
                // Make file clickable
                this.command = {
                    command: 'teamxray.openFileFromTree',
                    title: 'Open File',
                    arguments: [this.fileExpertise?.filePath]
                };
                break;
            case 'insights':
                this.iconPath = new vscode.ThemeIcon('lightbulb');
                break;
            case 'file-expert':
                this.iconPath = new vscode.ThemeIcon('account');
                break;
            case 'expert-detail':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            case 'insight':
                this.iconPath = new vscode.ThemeIcon('comment');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('circle-filled');
        }

        // Add commands for interactive items
        if (contextValue === 'expert') {
            this.command = {
                command: 'teamxray.showExpertDetails',
                title: 'Show Expert Details',
                arguments: [this.expert]
            };
        }
    }
}
