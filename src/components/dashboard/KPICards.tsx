import { useState, useEffect, memo } from 'react';
import { Smartphone, Smile, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface KPICardsProps {
    realtimeData?: any;
    cameraFilter: string;
    timeFilter: import('@/pages/Dashboard').IntervalFilter;
    timeRange?: { start?: string | null; end?: string | null };
}

function KPICardsComponent({ cameraFilter, timeFilter, timeRange }: KPICardsProps) {
    const [stats, setStats] = useState({
        distractions: 0,
        drowsiness: 0,
        criticals: 0,
        attentionScore: 100,
        riskLevel: 'Baixo' as 'Baixo' | 'Médio' | 'Alto',
        totalEvents: 0,
        emotions: {} as Record<string, number>
    });
    const [isLoading, setIsLoading] = useState(true);

    const timeRangeKey = JSON.stringify(timeRange || {});

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const now = new Date();
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
            let start = timeFilter === 'live' ? `${y}-${m}-${d}` : (timeRange?.start ?? '');
            let end = timeFilter === 'live' ? `${y}-${m}-${d}` : (timeRange?.end ?? start);
            if (!start || !end) { setIsLoading(false); return; }

            const params: Record<string, string> = { start, end };
            if (cameraFilter !== 'all') params.camera = cameraFilter;
            const res = await api.get('/api/v1/reports', { params });
            const data = res.data?.data || [];

            let distractions = 0;
            let drowsiness = 0;
            let criticals = 0;
            let emotionCounts: Record<string, number> = {};
            let totalEmotions = 0;

            for (const item of data) {
                if (item.object_type === 'celular') distractions++;
                else if (item.object_type === 'sonolencia') drowsiness++;
                else if (item.object_type === 'cigarro' || item.object_type === 'maos_ao_alto') criticals++;
                else if (['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'].includes(item.object_type)) {
                    emotionCounts[item.object_type] = (emotionCounts[item.object_type] || 0) + 1;
                    totalEmotions++;
                }
            }

            let emotionPercentages: Record<string, number> = {};
            if (totalEmotions > 0) {
               Object.keys(emotionCounts).forEach(key => {
                  emotionPercentages[key] = Math.round((emotionCounts[key] / totalEmotions) * 100);
               });
            }

            // Attention Score Logic
            // Start at 100%, subtract penalty for negative events.
            let penalty = (distractions * 2) + (drowsiness * 5) + (criticals * 15);
            let attention = Math.max(0, 100 - penalty);

            // Risk Logic
            let risk: 'Baixo' | 'Médio' | 'Alto' = 'Baixo';
            if (criticals > 0 || drowsiness >= 3) risk = 'Alto';
            else if (drowsiness > 0 || distractions >= 5) risk = 'Médio';

            setStats({
                distractions,
                drowsiness,
                criticals,
                attentionScore: attention,
                riskLevel: risk,
                totalEvents: data.length,
                emotions: emotionPercentages
            });
        } catch (err) {
            console.error('KPI fetch failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchStats(); }, [cameraFilter, timeFilter, timeRangeKey]);

    const riskColor = stats.riskLevel === 'Alto' ? 'text-red-500' : stats.riskLevel === 'Médio' ? 'text-yellow-500' : 'text-green-500';

    return (
        <div className="space-y-4">
            {/* Top KPIs Row */}
            <div className={cn("grid gap-4 grid-cols-2 md:grid-cols-5", isLoading && "opacity-60 pointer-events-none")}>
                
                {/* Emoções (substituindo Atenção) */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                        <Smile className="h-5 w-5 text-purple-500" />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Emoções</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {isLoading ? (
                            <span className="text-2xl font-bold text-foreground">...</span>
                        ) : Object.keys(stats.emotions).length > 0 ? (
                            Object.entries(stats.emotions)
                                .sort(([,a], [,b]) => b - a)
                                .map(([emotion, pct]) => {
                                    const emojiMap: Record<string, string> = {
                                        angry: '😡', disgust: '🤢', fear: '😨',
                                        happy: '😄', sad: '😢', surprise: '😲', neutral: '😐'
                                    };
                                    return (
                                        <div key={emotion} className="flex items-center gap-1 text-base font-bold text-foreground" title={emotion}>
                                            <span>{emojiMap[emotion] || '🤔'}</span>
                                            <span>{pct}%</span>
                                        </div>
                                    );
                                })
                        ) : (
                            <span className="text-xl font-bold text-muted-foreground">-</span>
                        )}
                    </div>
                </div>

                {/* Distrações */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2">
                        <Smartphone className="h-5 w-5 text-indigo-500" />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Distrações</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <span className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.distractions}</span>
                    </div>
                </div>

                {/* Sonolência */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2">
                        <Smile className="h-5 w-5 text-yellow-600" />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Sonolência</span>
                    </div>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.drowsiness}</span>
                        {!isLoading && (
                            <span className={cn("text-xs font-semibold px-2 py-1 rounded-md bg-secondary", stats.drowsiness > 0 ? "text-yellow-600" : "text-green-600")}>
                                {stats.drowsiness > 2 ? 'Alto' : stats.drowsiness > 0 ? 'Médio' : 'Baixo'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Críticos */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Críticos</span>
                    </div>
                    <div className="flex items-end gap-3">
                        <span className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.criticals}</span>
                        {!isLoading && (
                            <span className={cn("text-xs font-semibold px-2 py-1 rounded-md bg-secondary", stats.criticals > 0 ? "text-orange-500" : "text-green-600")}>
                                {stats.criticals > 0 ? 'Atenção' : 'OK'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Risco */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className={cn("h-5 w-5", riskColor)} />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Risco</span>
                    </div>
                    <div className="flex items-end gap-3">
                        <span className={cn("text-3xl font-bold", riskColor)}>{isLoading ? '...' : stats.riskLevel}</span>
                        {!isLoading && stats.riskLevel === 'Baixo' && (
                            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-secondary text-green-600">OK</span>
                        )}
                    </div>
                </div>

            </div>

            {/* Painel de Indicadores Row */}
            <div className="rounded-xl bg-card p-3 shadow-sm border border-border flex items-center justify-between overflow-x-auto text-sm">
                <div className="flex items-center gap-6 px-4">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Painel de Indicadores</span>
                    
                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-blue-500">📈</span>
                        <span className="text-foreground">Performance:</span>
                        <span className={stats.attentionScore >= 80 ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
                            {stats.attentionScore >= 80 ? 'Alta' : 'Baixa'}
                        </span>
                    </div>

                    <div className="w-px h-4 bg-border"></div>

                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-green-500">🛡️</span>
                        <span className="text-foreground">Risco:</span>
                        <span className={cn("font-medium", riskColor)}>{isLoading ? '-' : stats.riskLevel}</span>
                    </div>

                    <div className="w-px h-4 bg-border"></div>

                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-indigo-500">🔄</span>
                        <span className="text-foreground">Estabilidade:</span>
                        <span className="text-green-500 font-medium">Alta</span>
                    </div>

                    <div className="w-px h-4 bg-border"></div>

                    <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-slate-500">📅</span>
                        <span className="text-foreground">Eventos Hoje:</span>
                        <span className="font-medium text-foreground">{isLoading ? '-' : stats.totalEvents}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export const KPICards = memo(KPICardsComponent);
