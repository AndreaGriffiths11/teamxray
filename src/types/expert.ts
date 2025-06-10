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
}

export interface FileExpertise {
    fileName: string;
    filePath: string;
    experts: Expert[];
    lastModified: Date;
    changeFrequency: number;
}
