/**
 * Represents the category of a management insight
 */
export type InsightCategory = 'RISK' | 'OPPORTUNITY' | 'EFFICIENCY' | 'GROWTH';

/**
 * Represents the priority level of a management insight
 */
export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Represents a management insight
 */
export interface ManagementInsight {
    category: InsightCategory;
    priority: InsightPriority;
    title: string;
    description: string;
    timeline: string;
    actionItems: string[];
    impact: string;
}

/**
 * Represents team health metrics
 */
export interface TeamHealthMetrics {
    knowledgeDistribution: {
        riskScore: number;
        criticalAreas: string[];
        singlePointsOfFailure: string[];
        wellDistributed: string[];
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

/**
 * Represents a team insight with impact analysis
 */
export interface TeamInsight {
    type: 'strength' | 'gap' | 'opportunity' | 'risk';
    impact: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    recommendations: string[];
}
