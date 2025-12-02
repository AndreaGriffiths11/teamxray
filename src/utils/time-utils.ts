/**
 * Formats a time difference as a human-readable string
 * @param date The date to compare against current time
 * @param format The format style: 'short' for abbreviated (1h, 2d) or 'long' for full words
 * @returns Human-readable time difference string
 */
export function formatTimeAgo(date: Date, format: 'short' | 'long' = 'long'): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        if (format === 'short') {
            return `${days}d ago`;
        }
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (diffHours >= 1) {
        if (format === 'short') {
            return `${diffHours}h ago`;
        }
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes >= 1) {
        if (format === 'short') {
            return `${diffMinutes}m ago`;
        }
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
    return 'just now';
}
