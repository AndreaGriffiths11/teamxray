export interface Expert {
    name: string;
    email: string;
    expertise: number;
    contributions: number;
    lastCommit: Date;
    specializations: string[];
    communicationStyle: string;
    teamRole: string;
    hiddenStrengths: string[];
    idealChallenges: string[];
    workloadIndicator?: 'balanced' | 'overloaded' | 'underutilized';
    collaborationStyle?: 'independent' | 'collaborative' | 'mentoring';
    riskFactors?: string[];
}

export interface FileExpertise {
    fileName: string;
    filePath: string;
    experts: Expert[];
    lastModified: Date;
    changeFrequency: number;
}

// Git-related types
export interface GitCommit {
    sha: string;
    author: GitAuthor;
    message: string;
    date: string;
    files: string[];
}

export interface GitAuthor {
    name: string;
    email: string;
}

export interface GitContributor {
    name: string;
    email: string;
    commits: number;
    additions: number;
    deletions: number;
    firstCommit: string;
    lastCommit: string;
}

// Repository analysis types
export interface RepositoryStats {
    totalFiles: number;
    totalCommits: number;
    totalContributors: number;
    languages: Record<string, number>;
    recentActivity: number;
    primaryLanguages: string[];
    recentActivityLevel: 'low' | 'medium' | 'high';
    repositorySize: 'small' | 'medium' | 'large' | 'enterprise';
}

export interface RepositoryData {
    repository: string;
    files: string[];
    commits: GitCommit[];
    contributors: GitContributor[];
    stats: RepositoryStats;
    collaborationData: CollaborationData;
}

export interface CollaborationData {
    teamSize: number;
    communicationPatterns: CommunicationPattern[];
    knowledgeSharing: KnowledgeSharing[];
    expertiseDistribution: ExpertiseDistribution[];
}

export interface CommunicationPattern {
    author: string;
    frequency: number;
    style: 'detailed' | 'concise' | 'collaborative' | 'technical';
    avgMessageLength: number;
}

export interface KnowledgeSharing {
    expert: string;
    knowledge: string[];
    sharingScore: number;
}

export interface ExpertiseDistribution {
    domain: string;
    experts: string[];
    coverage: number;
}

// Analysis result types
export interface AnalysisResult {
    repository: string;
    timestamp: Date;
    experts: Expert[];
    fileExpertise: FileExpertise[];
    insights: TeamInsight[];
    stats: RepositoryStats;
    // Legacy compatibility
    totalFiles: number;
    totalExperts: number;
    expertProfiles: Expert[];
    generatedAt: Date;
}

export interface TeamInsight {
    type: 'strength' | 'gap' | 'opportunity' | 'risk';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    recommendations: string[];
}

// Management-focused insights
export interface ManagementInsight {
    category: 'RISK' | 'OPPORTUNITY' | 'EFFICIENCY' | 'GROWTH';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    description: string;
    actionItems: string[];
    timeline: '1-2 weeks' | '1 month' | '1 quarter';
    impact: string;
}

export interface TeamHealthMetrics {
    knowledgeDistribution: {
        criticalAreas: string[];
        singlePointsOfFailure: string[];
        wellDistributed: string[];
        riskScore: number;
    };
    collaborationMetrics: {
        crossTeamWork: number;
        codeReviewParticipation: number;
        knowledgeSharing: number;
        siloedMembers: string[];
    };
    performanceIndicators: {
        averageReviewTime: string;
        deploymentFrequency: string;
        blockers: string[];
    };
}

// API response types
export interface GitHubAPIResponse<T> {
    data: T;
    status: number;
    headers: Record<string, string>;
}

export interface GitHubUser {
    login: string;
    id: number;
    name: string | null;
    email: string | null;
    company: string | null;
    location: string | null;
    bio: string | null;
}

export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    language: string | null;
    size: number;
    created_at: string;
    updated_at: string;
    pushed_at: string;
}

// Error types
export interface TeamXRayError {
    code: string;
    message: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, any>;
}

export type ErrorCode = 
    | 'INVALID_TOKEN'
    | 'NETWORK_ERROR'
    | 'REPOSITORY_NOT_FOUND'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'ANALYSIS_FAILED'
    | 'VALIDATION_ERROR'
    | 'RESOURCE_ERROR';

// Validation types
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export interface TokenValidationResult extends ValidationResult {
    hasRepoAccess: boolean;
    hasUserAccess: boolean;
    rateLimitRemaining: number;
}

// MCP related types
export interface MCPResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    activity?: any;
}

export interface ExpertActivity {
    expert: string;
    recentCommits: GitCommit[];
    activeFiles: string[];
    collaborations: string[];
    insights: string[];
}
