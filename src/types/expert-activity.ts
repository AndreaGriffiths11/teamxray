export interface ExpertActivity {
    email: string;
    name?: string;
    commits: number;
    pullRequests: number;
    reviews: number;
    issues: number;
    lastActive: Date;
    activity: ActivityEntry[];
}

export interface ActivityEntry {
    type: 'commit' | 'review' | 'issue' | 'pull_request';
    title: string;
    description: string;
    date: Date;
    url?: string;
    stats?: {
        additions: number;
        deletions: number;
        files: number;
    };
}
