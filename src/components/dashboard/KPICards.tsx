import { useState, useEffect, memo } from 'react';
import { Smartphone, Smile, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { HighRiskModal } from './HighRiskModal';

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
        emotions: {} as Record<string, number>,
        unackRiskEvents: [] as any[]
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

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
            let unackCriticals = 0;
            let unackDrowsiness = 0;
            let unackRiskEvents: any[] = [];

            for (const item of data) {
                const isCriticalType = item.object_type === 'cigarro' || item.object_type === 'maos_ao_alto' || item.object_type === 'arma';
                
                if (item.object_type === 'celular') distractions++;
                else if (item.object_type === 'sonolencia') drowsiness++;
                else if (isCriticalType) criticals++;
                else if (['feliz', 'triste', 'medo', 'neutro', 'raiva', 'surpresa', 'nojo',
                          'happy', 'sad', 'fear', 'neutral', 'angry', 'surprise', 'disgust'].includes(item.object_type)) {
                    const ptMap: Record<string, string> = {
                        happy: 'feliz', sad: 'triste', fear: 'medo',
                        neutral: 'neutro', angry: 'raiva', surprise: 'surpresa', disgust: 'nojo'
                    };
                    const key = ptMap[item.object_type] || item.object_type;
                    emotionCounts[key] = (emotionCounts[key] || 0) + 1;
                    totalEmotions++;
                }

                if (item.acknowledged !== true) {
                    if (isCriticalType) unackCriticals++;
                    if (item.object_type === 'sonolencia' && item.severity !== 'Normal') unackDrowsiness++;
                    if (isCriticalType || (item.object_type === 'sonolencia' && item.severity !== 'Normal')) {
                        unackRiskEvents.push(item);
                    }
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
            if (unackCriticals > 0 || unackDrowsiness >= 3) risk = 'Alto';
            else if (unackDrowsiness > 0 || distractions >= 5) risk = 'Médio';

            setStats(prev => {
                if (prev.riskLevel !== 'Alto' && risk === 'Alto' && unackRiskEvents.length > prev.unackRiskEvents.length) {
                    try {
                        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                    } catch (e) {}
                }
                return {
                    distractions,
                    drowsiness,
                    criticals,
                    attentionScore: attention,
                    riskLevel: risk,
                    totalEvents: data.length,
                    emotions: emotionPercentages,
                    unackRiskEvents
                };
            });
        } catch (err) {
            console.error('KPI fetch failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchStats(); }, [cameraFilter, timeFilter, timeRangeKey]);

    // Auto-refresh every 30s when in live mode
    useEffect(() => {
        if (timeFilter !== 'live') return;
        const interval = setInterval(() => { fetchStats(); }, 30_000);
        return () => clearInterval(interval);
    }, [timeFilter, cameraFilter]);

    const riskColor = stats.riskLevel === 'Alto' ? 'text-red-500' : stats.riskLevel === 'Médio' ? 'text-yellow-500' : 'text-green-500';

    return (
        <div className="space-y-4">
            {/* Top KPIs Row */}
            <div className={cn("grid gap-4 grid-cols-2 md:grid-cols-5", isLoading && "opacity-60 pointer-events-none")}>
                
                {/* Emoções (substituindo Atenção) */}
                <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                        <Smile className="h-5 w-5 text-purple-500" />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Medidor de Humor</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {isLoading ? (
                            <span className="text-2xl font-bold text-foreground">...</span>
                        ) : Object.keys(stats.emotions).length > 0 ? (
                            Object.entries(stats.emotions)
                                .sort(([,a], [,b]) => b - a)
                                .map(([emotion, pct]) => {
                                    const emojiMap: Record<string, string> = {
                                        raiva: '😡', nojo: '🤢', medo: '😨',
                                        feliz: '😄', triste: '😢', surpresa: '😲', neutro: '😐'
                                    };
                                    const labelMap: Record<string, string> = {
                                        feliz: 'Feliz', triste: 'Triste', medo: 'Medo',
                                        neutro: 'Neutro', raiva: 'Raiva', surpresa: 'Surpresa', nojo: 'Nojo'
                                    };
                                    return (
                                        <div key={emotion} className="flex items-center gap-1 text-base font-bold text-foreground" title={labelMap[emotion] || emotion}>
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
                <div 
                    onClick={() => { if (stats.riskLevel === 'Alto') setIsRiskModalOpen(true); }}
                    className={cn(
                        "rounded-xl bg-card p-4 shadow-sm border border-border flex flex-col justify-between transition-all duration-300",
                        stats.riskLevel === 'Alto' && "border-red-500/50 cursor-pointer hover:bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className={cn("h-5 w-5", riskColor, stats.riskLevel === 'Alto' && "animate-pulse")} />
                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Risco</span>
                    </div>
                    <div className="flex items-end gap-3">
                        <span className={cn("text-3xl font-bold", riskColor)}>{isLoading ? '...' : stats.riskLevel}</span>
                        {!isLoading && stats.riskLevel === 'Baixo' && (
                            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-secondary text-green-600">OK</span>
                        )}
                        {!isLoading && stats.riskLevel === 'Alto' && (
                            <span className="text-xs font-semibold px-2 py-1 rounded-md bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">Verificar</span>
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

            {isRiskModalOpen && (
                <HighRiskModal 
                    events={stats.unackRiskEvents} 
                    onClose={() => setIsRiskModalOpen(false)} 
                    onReset={() => {
                        setIsRiskModalOpen(false);
                        fetchStats();
                    }} 
                />
            )}
        </div>
    );
}

export const KPICards = memo(KPICardsComponent);
