import { ExpertiseAnalysis } from './expertise-analyzer';

export class ReportGenerator {
    /**
     * Generates an HTML report for a team analysis
     */
    public static generateHTMLReport(analysis: ExpertiseAnalysis): string {
        const repoName = analysis.repository.split('/').pop() || 'analysis';
        
        const priorityDots = (p: string) => p === 'HIGH' ? '●●●' : p === 'MEDIUM' ? '●●○' : '●○○';
        const categoryColor = (c: string) => ({ RISK: '#ef4444', OPPORTUNITY: '#10b981', EFFICIENCY: '#3b82f6', GROWTH: '#f59e0b' }[c] || '#64748b');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team X-Ray — ${repoName}</title>
    <style>
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
            --bg:#0a0a0f;--card:#12121a;--text:#e2e8f0;--muted:#64748b;
            --accent:#06b6d4;--purple:#8b5cf6;--border:#1e293b;
            --risk:#ef4444;--opportunity:#10b981;--efficiency:#3b82f6;--growth:#f59e0b;
        }
        body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            background:var(--bg);color:var(--text);line-height:1.6;padding:0;margin:0}
        code,pre,.mono{font-family:'JetBrains Mono','Fira Code','SF Mono',Consolas,monospace}

        .container{max-width:1200px;margin:0 auto;padding:40px 24px}

        /* ── Header ── */
        .header{
            position:relative;padding:56px 40px;margin-bottom:48px;
            background:var(--bg);border:1px solid var(--border);border-radius:16px;
            overflow:hidden;text-align:center;
        }
        .header::before{
            content:'';position:absolute;inset:0;
            background:
                repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(6,182,212,0.03) 3px,rgba(6,182,212,0.03) 4px),
                repeating-linear-gradient(90deg,transparent,transparent 3px,rgba(6,182,212,0.03) 3px,rgba(6,182,212,0.03) 4px);
            pointer-events:none;
        }
        .header h1{
            font-size:2.8em;font-weight:800;letter-spacing:0.08em;
            color:var(--accent);text-shadow:0 0 40px rgba(6,182,212,0.3);
            margin-bottom:12px;
        }
        .header .repo{font-size:1.1em;color:var(--muted);margin-bottom:16px}
        .header .repo code{color:var(--text);background:rgba(6,182,212,0.08);padding:4px 12px;border-radius:6px;font-size:0.95em}
        .pill{display:inline-block;padding:5px 14px;border-radius:999px;font-size:0.85em;font-weight:600;
            background:rgba(6,182,212,0.1);color:var(--accent);border:1px solid rgba(6,182,212,0.2);margin:0 4px}

        /* ── Sections ── */
        .section{margin-bottom:40px}
        .section-title{
            font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;
            color:var(--accent);margin-bottom:24px;padding-bottom:12px;
            border-bottom:1px solid var(--border);
        }

        /* ── Expert Cards ── */
        .expert-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px}
        .expert-card{
            background:var(--card);border:1px solid var(--border);border-radius:12px;
            padding:24px;position:relative;transition:border-color .2s;
        }
        .expert-card.glow{border-color:rgba(6,182,212,0.3);box-shadow:0 0 20px rgba(6,182,212,0.08)}
        .expert-card.muted-card{opacity:0.6}
        .expert-card.bot{opacity:0.65}
        .expert-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
        .expert-name{font-size:1.25em;font-weight:700;color:var(--text)}
        .expert-email{font-size:0.8em;color:var(--muted);margin-top:2px}
        .role-badge{
            font-size:0.7em;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;
            padding:4px 10px;border-radius:6px;
            background:rgba(139,92,246,0.15);color:var(--purple);white-space:nowrap;
        }
        .bar-wrap{margin:16px 0 12px}
        .bar-label{display:flex;justify-content:space-between;margin-bottom:6px}
        .bar-label span:first-child{font-size:0.75em;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em}
        .bar-label span:last-child{font-size:0.95em;font-weight:700;font-family:'JetBrains Mono','Fira Code',monospace}
        .expert-meta{display:flex;gap:24px;margin-bottom:14px}
        .expert-meta .meta-item{font-size:0.8em;color:var(--muted)}
        .expert-meta .meta-item strong{color:var(--text);font-weight:600}
        .tags{display:flex;flex-wrap:wrap;gap:6px}
        .tag{font-size:0.75em;padding:3px 10px;border-radius:4px;background:rgba(6,182,212,0.08);color:var(--accent);border:1px solid rgba(6,182,212,0.15)}

        /* ── Insight Cards ── */
        .insights-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:20px}
        .insight-card{
            background:var(--card);border:1px solid var(--border);border-radius:12px;
            padding:24px;border-left:4px solid var(--muted);
        }
        .insight-card.risk{border-left-color:var(--risk)}
        .insight-card.opportunity{border-left-color:var(--opportunity)}
        .insight-card.efficiency{border-left-color:var(--efficiency)}
        .insight-card.growth{border-left-color:var(--growth)}
        .insight-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
        .cat-badge{font-size:0.7em;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:3px 8px;border-radius:4px}
        .risk .cat-badge{background:rgba(239,68,68,0.15);color:var(--risk)}
        .opportunity .cat-badge{background:rgba(16,185,129,0.15);color:var(--opportunity)}
        .efficiency .cat-badge{background:rgba(59,130,246,0.15);color:var(--efficiency)}
        .growth .cat-badge{background:rgba(245,158,11,0.15);color:var(--growth)}
        .priority-dots{font-size:0.85em;letter-spacing:0.05em}
        .insight-title{font-size:1.15em;font-weight:700;margin-bottom:8px}
        .insight-desc{color:var(--muted);font-size:0.9em;margin-bottom:16px;line-height:1.5}
        .insight-impact{font-size:0.85em;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)}
        .insight-impact strong{color:var(--accent)}
        .action-box{background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-top:12px}
        .action-box .action-header{font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px}
        .action-box ul{padding-left:18px;margin:0}
        .action-box li{font-size:0.85em;color:var(--text);margin-bottom:4px;line-height:1.5}
        .action-box .timeline{font-size:0.75em;color:var(--muted);margin-top:8px}

        /* ── AI Insights ── */
        .ai-section{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:32px}
        .ai-summary{font-size:1.05em;line-height:1.8;margin-bottom:24px;color:var(--text)}
        .ai-recs{display:grid;gap:12px}
        .ai-recs p{
            background:rgba(6,182,212,0.05);border:1px solid rgba(6,182,212,0.1);
            border-radius:8px;padding:14px 18px;font-size:0.9em;line-height:1.5;
            color:var(--text);margin:0;
        }
        .recs-label{font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:14px}

        /* ── Key Insights list ── */
        .key-insights{display:grid;gap:0}
        .key-insight{padding:16px 0;border-bottom:1px solid var(--border);font-size:0.95em;line-height:1.6;display:flex;gap:12px}
        .key-insight:last-child{border-bottom:none}
        .ki-num{color:var(--accent);font-weight:700;font-family:'JetBrains Mono','Fira Code',monospace;flex-shrink:0}

        /* ── Footer ── */
        .footer{text-align:center;color:var(--muted);font-size:0.8em;margin-top:48px;padding-top:24px;border-top:1px solid var(--border)}
        .footer code{color:var(--accent)}

        /* ── Print ── */
        @media print{
            body{background:#fff;color:#1e293b}
            .header,.expert-card,.insight-card,.ai-section{border-color:#e2e8f0;background:#fff}
            .header h1{color:#0891b2;text-shadow:none}
            .section-title{color:#0891b2}
            .expert-card.glow{box-shadow:none}
        }
    </style>
</head>
<body>
    <div class="container">

        <div class="header">
            <h1>TEAM X-RAY</h1>
            <div class="repo"><code class="mono">${analysis.repository}</code></div>
            <div>
                <span class="pill">${analysis.totalFiles} files scanned</span>
                <span class="pill">${analysis.expertProfiles.filter(e => !e.isBot).length} humans · ${analysis.expertProfiles.filter(e => e.isBot).length} agents</span>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Expert Profiles</div>
            <div class="expert-grid">
                ${analysis.expertProfiles.map(expert => {
                    const bot = expert.isBot || false;
                    const barColor = bot ? '#475569' : 'var(--accent)';
                    const glowClass = bot ? ' bot' : (expert.expertise >= 70 ? ' glow' : expert.expertise < 20 ? ' muted-card' : '');
                    return `
                    <div class="expert-card${glowClass}">
                        <div class="expert-top">
                            <div>
                                <div class="expert-name">${expert.isBot ? '🤖 ' : ''}${expert.name}</div>
                                <div class="expert-email mono">${expert.email}</div>
                            </div>
                            ${expert.teamRole ? `<span class="role-badge">${expert.teamRole}</span>` : ''}
                        </div>
                        <div class="bar-wrap">
                            <div class="bar-label"><span>Expertise</span><span style="color:${barColor}">${expert.expertise}%</span></div>
                            <svg width="100%" height="8" role="img" aria-label="Expertise ${expert.expertise}%">
                                <rect width="100%" height="8" rx="4" fill="var(--border)"/>
                                <rect width="${expert.expertise}%" height="8" rx="4" fill="${barColor}"${expert.expertise >= 70 ? ' filter="url(#glow)"' : ''}/>
                                ${expert.expertise >= 70 ? '<defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' : ''}
                            </svg>
                        </div>
                        <div class="expert-meta">
                            <div class="meta-item"><strong>${expert.contributions}</strong> commits</div>
                            <div class="meta-item">last <strong>${ReportGenerator.calculateDaysAgo(expert.lastCommit)}</strong>d ago</div>
                        </div>
                        ${expert.specializations?.length ? `<div class="tags">${expert.specializations.map(s => `<span class="tag">${s}</span>`).join('')}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>

        ${analysis.managementInsights?.length ? `
        <div class="section">
            <div class="section-title">Management Insights</div>
            <div class="insights-grid">
                ${analysis.managementInsights.map(insight => `
                <div class="insight-card ${insight.category.toLowerCase()}">
                    <div class="insight-top">
                        <span class="cat-badge">${insight.category}</span>
                        <span class="priority-dots" style="color:${categoryColor(insight.category)}">${priorityDots(insight.priority)} ${insight.priority}</span>
                    </div>
                    <div class="insight-title">${insight.title}</div>
                    <div class="insight-desc">${insight.description}</div>
                    <div class="action-box">
                        <div class="action-header">Action Items</div>
                        <ul>${insight.actionItems.map(a => `<li>${a}</li>`).join('')}</ul>
                        <div class="timeline">Timeline: ${insight.timeline}</div>
                    </div>
                    <div class="insight-impact"><strong>Impact:</strong> ${insight.impact}</div>
                </div>`).join('')}
            </div>
        </div>` : ''}

        ${analysis.insights?.length ? `
        <div class="section">
            <div class="section-title">Key Insights</div>
            <div class="ai-section">
                <div class="key-insights">
                    ${analysis.insights.map((insight: any, i: number) => `<div class="key-insight"><span class="ki-num">${String(i + 1).padStart(2, '0')}</span><span><strong>${insight.title}</strong> — ${insight.description}</span></div>`).join('')}
                </div>
            </div>
        </div>` : ''}

        <div class="section">
            <div class="section-title">AI Strategic Analysis</div>
            <div class="ai-section">
                <div class="ai-summary">${ReportGenerator.generateAnalysisSummary(analysis)}</div>
                <div class="recs-label">Recommendations</div>
                <div class="ai-recs">${ReportGenerator.generateRecommendations(analysis)}</div>
            </div>
        </div>

        <div class="footer">
            Generated by <code class="mono">Team X-Ray</code> · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
        </div>

    </div>
</body>
</html>`;
    }

    /**
     * Generates a CSV summary for spreadsheet analysis
     */
    public static generateCSV(analysis: ExpertiseAnalysis): { experts: string; files: string; managementInsights?: string } {
        // Experts CSV
        const expertsHeader = 'Name,Email,Expertise %,Contributions,Last Commit,Specializations,Team Role,Communication Style,Workload,Collaboration Style\n';
        const expertsRows = analysis.expertProfiles.map(expert => {
            return [
                `"${expert.name}"`,
                `"${expert.email}"`,
                expert.expertise,
                expert.contributions,
                `"${new Date(expert.lastCommit).toLocaleDateString()}"`,
                `"${(expert.specializations || []).join('; ')}"`,
                `"${expert.teamRole || ''}"`,
                `"${expert.communicationStyle || ''}"`,
                `"${expert.workloadIndicator || ''}"`,
                `"${expert.collaborationStyle || ''}"`
            ].join(',');
        }).join('\n');
        
        // Files CSV
        const filesHeader = 'File Name,File Path,Expert Count,Primary Expert,Change Frequency\n';
        const filesRows = analysis.fileExpertise.map(file => {
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
            const insightsRows = analysis.managementInsights.map(insight => {
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

    /**
     * Generates an executive summary based on the analysis
     */
    private static generateAnalysisSummary(analysis: ExpertiseAnalysis): string {
        const { expertProfiles } = analysis;
        
        // Find key insights
        const topContributor = expertProfiles.sort((a, b) => b.contributions - a.contributions)[0];
        
        if (!topContributor) {
            return 'No team analysis available.';
        }
        
        // Generate concise insight
        return `${topContributor.name} is the primary contributor and a potential bottleneck for CI/CD expertise.`;
    }

    /**
     * Generates specific recommendations based on the analysis
     */
    private static generateRecommendations(analysis: ExpertiseAnalysis): string {
        const { teamHealthMetrics } = analysis;
        
        const recommendations = [];

        // Knowledge distribution recommendation
        const riskScore = teamHealthMetrics?.knowledgeDistribution?.riskScore ?? 0;
        if (riskScore > 70) {
            recommendations.push('Implement regular knowledge sharing sessions and documentation sprints');
        }

        // Collaboration recommendation
        const sharingScore = teamHealthMetrics?.collaborationMetrics?.knowledgeSharing ?? 0;
        if (sharingScore < 50) {
            recommendations.push('Establish regular code review rotations and pair programming sessions');
        }

        // If no specific metrics, provide general recommendations
        if (recommendations.length === 0) {
            recommendations.push(
                'Consider implementing pair programming sessions to distribute knowledge',
                'Document key workflows and architectural decisions',
                'Set up regular technical sharing sessions'
            );
        }

        return recommendations.map(rec => `<p>${rec}</p>`).join('');
    }

    /**
     * Calculate days ago from a date
     */
    private static calculateDaysAgo(lastCommitDate: any): string {
        try {
            if (!lastCommitDate) {
                return 'N/A';
            }
            
            let date: Date;
            
            if (lastCommitDate instanceof Date) {
                date = lastCommitDate;
            } else if (typeof lastCommitDate === 'string') {
                date = new Date(lastCommitDate);
            } else if (typeof lastCommitDate === 'number') {
                // Handle Unix timestamp (in seconds or milliseconds)
                const multiplier = lastCommitDate > 9999999999 ? 1 : 1000;
                date = new Date(lastCommitDate * multiplier);
            } else {
                return 'N/A';
            }

            if (isNaN(date.getTime())) {
                return 'N/A';
            }
            
            const days = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
            return String(days);
        } catch (e) {
            console.error("Error calculating days ago:", e);
            return 'N/A';
        }
    }
}
