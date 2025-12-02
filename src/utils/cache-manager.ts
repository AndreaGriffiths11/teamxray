import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Represents a cached entry with metadata for TTL and validation
 */
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    hash: string;
    expiresAt: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
    enabled: boolean;
    ttlHours: number;
    maxEntries: number;
}

/**
 * Intelligent cache manager for AI analysis results
 * Implements LRU eviction, TTL-based expiration, and change detection
 */
export class CacheManager {
    private static instance: CacheManager | null = null;
    private context: vscode.ExtensionContext | null = null;
    private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
    private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 };
    private outputChannel: vscode.OutputChannel | null = null;
    
    // Default configuration
    private config: CacheConfig = {
        enabled: true,
        ttlHours: 24,
        maxEntries: 100
    };

    private constructor() {}

    /**
     * Gets the singleton instance of CacheManager
     */
    static getInstance(): CacheManager {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }

    /**
     * Initializes the cache manager with VS Code extension context
     */
    initialize(context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel): void {
        this.context = context;
        this.outputChannel = outputChannel || null;
        this.loadConfig();
        this.loadPersistedCache();
        this.log('Cache manager initialized');
    }

    /**
     * Loads configuration from VS Code settings
     */
    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('teamxray.cache');
        this.config = {
            enabled: config.get<boolean>('enabled', true),
            ttlHours: config.get<number>('ttlHours', 24),
            maxEntries: config.get<number>('maxEntries', 100)
        };
        this.log(`Cache config loaded: enabled=${this.config.enabled}, ttlHours=${this.config.ttlHours}`);
    }

    /**
     * Loads persisted cache from workspace state
     */
    private loadPersistedCache(): void {
        if (!this.context) {
            return;
        }

        try {
            const persistedCache = this.context.workspaceState.get<Record<string, CacheEntry<unknown>>>('teamxray.cache');
            if (persistedCache) {
                const now = Date.now();
                // Only load non-expired entries
                Object.entries(persistedCache).forEach(([key, entry]) => {
                    if (entry.expiresAt > now) {
                        this.memoryCache.set(key, entry);
                    }
                });
                this.stats.size = this.memoryCache.size;
                this.log(`Loaded ${this.memoryCache.size} cached entries from workspace state`);
            }
        } catch (error) {
            this.log(`Failed to load persisted cache: ${error}`);
        }
    }

    /**
     * Persists the cache to workspace state
     */
    private async persistCache(): Promise<void> {
        if (!this.context) {
            return;
        }

        try {
            const cacheObject: Record<string, CacheEntry<unknown>> = {};
            this.memoryCache.forEach((value, key) => {
                cacheObject[key] = value;
            });
            await this.context.workspaceState.update('teamxray.cache', cacheObject);
        } catch (error) {
            this.log(`Failed to persist cache: ${error}`);
        }
    }

    /**
     * Generates a hash for cache key based on repository data
     */
    generateCacheKey(repositoryName: string, dataHash: string): string {
        return `analysis:${repositoryName}:${dataHash}`;
    }

    /**
     * Creates a hash from repository data for cache invalidation
     */
    hashRepositoryData(data: {
        contributors: Array<{ name: string; email: string; commits: number }>;
        commits: Array<{ sha?: string; date?: string }>;
        files: string[];
    }): string {
        const significantData = {
            contributorCount: data.contributors?.length || 0,
            topContributors: (data.contributors || [])
                .slice(0, 5)
                .map(c => `${c.name}:${c.commits}`),
            commitCount: data.commits?.length || 0,
            recentCommits: (data.commits || [])
                .slice(0, 10)
                .map(c => c.sha || c.date || ''),
            fileCount: data.files?.length || 0,
            sampleFiles: (data.files || []).slice(0, 20)
        };

        const hashInput = JSON.stringify(significantData);
        return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
    }

    /**
     * Gets a cached value if it exists and is valid
     */
    get<T>(key: string): { data: T; isCached: true } | { data: null; isCached: false } {
        if (!this.config.enabled) {
            this.stats.misses++;
            return { data: null, isCached: false };
        }

        const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
        
        if (!entry) {
            this.stats.misses++;
            this.log(`Cache miss for key: ${key}`);
            return { data: null, isCached: false };
        }

        // Check if entry has expired
        if (Date.now() > entry.expiresAt) {
            this.memoryCache.delete(key);
            this.stats.misses++;
            this.stats.evictions++;
            this.stats.size = this.memoryCache.size;
            this.log(`Cache expired for key: ${key}`);
            return { data: null, isCached: false };
        }

        this.stats.hits++;
        this.log(`Cache hit for key: ${key}`);
        
        // Move to end for LRU tracking (re-insert to maintain insertion order)
        this.memoryCache.delete(key);
        this.memoryCache.set(key, entry);

        return { data: entry.data, isCached: true };
    }

    /**
     * Stores a value in the cache
     */
    async set<T>(key: string, data: T, dataHash: string): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        // Enforce LRU eviction if at max capacity
        if (this.memoryCache.size >= this.config.maxEntries) {
            const oldestKey = this.memoryCache.keys().next().value;
            if (oldestKey) {
                this.memoryCache.delete(oldestKey);
                this.stats.evictions++;
                this.log(`LRU eviction: removed ${oldestKey}`);
            }
        }

        const ttlMs = this.config.ttlHours * 60 * 60 * 1000;
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            hash: dataHash,
            expiresAt: Date.now() + ttlMs
        };

        this.memoryCache.set(key, entry);
        this.stats.size = this.memoryCache.size;
        this.log(`Cache set for key: ${key}, expires in ${this.config.ttlHours} hours`);

        await this.persistCache();
    }

    /**
     * Checks if the cache entry is still valid based on current repository data
     */
    isValid(key: string, currentDataHash: string): boolean {
        const entry = this.memoryCache.get(key);
        if (!entry) {
            return false;
        }

        // Check if data has changed
        if (entry.hash !== currentDataHash) {
            this.log(`Cache invalidated for key: ${key} - repository data changed`);
            return false;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.log(`Cache invalidated for key: ${key} - entry expired`);
            return false;
        }

        return true;
    }

    /**
     * Invalidates a specific cache entry
     */
    async invalidate(key: string): Promise<void> {
        if (this.memoryCache.has(key)) {
            this.memoryCache.delete(key);
            this.stats.size = this.memoryCache.size;
            this.log(`Cache invalidated for key: ${key}`);
            await this.persistCache();
        }
    }

    /**
     * Clears all cache entries
     */
    async clearAll(): Promise<void> {
        const count = this.memoryCache.size;
        this.memoryCache.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
        
        if (this.context) {
            await this.context.workspaceState.update('teamxray.cache', undefined);
        }
        
        this.log(`Cache cleared: removed ${count} entries`);
    }

    /**
     * Gets cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Gets the current cache configuration
     */
    getConfig(): CacheConfig {
        return { ...this.config };
    }

    /**
     * Gets formatted cache information for display
     */
    getCacheInfo(): {
        enabled: boolean;
        size: number;
        hitRate: string;
        ttlHours: number;
    } {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 
            ? `${((this.stats.hits / totalRequests) * 100).toFixed(1)}%`
            : 'N/A';

        return {
            enabled: this.config.enabled,
            size: this.stats.size,
            hitRate,
            ttlHours: this.config.ttlHours
        };
    }

    /**
     * Gets cache entry timestamp if it exists
     */
    getEntryTimestamp(key: string): Date | null {
        const entry = this.memoryCache.get(key);
        return entry ? new Date(entry.timestamp) : null;
    }

    /**
     * Checks if caching is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Logs a message to the output channel
     */
    private log(message: string): void {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[Cache] ${message}`);
        }
    }

    /**
     * Resets the singleton instance (for testing purposes)
     */
    static reset(): void {
        CacheManager.instance = null;
    }
}
