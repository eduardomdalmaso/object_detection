import { useState, useEffect, memo } from 'react';
import { Eye, Camera, Target, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface KPICardsProps {
    realtimeData?: any;
    cameraFilter: string;
    timeFilter: import('@/pages/Dashboard').IntervalFilter;
    timeRange?: { start?: string | null; end?: string | null };
}

const OBJECT_LABELS: Record<string, string> = {
    emocoes: 'Emoções',
    sonolencia: 'Sonolência',
    celular: 'Celular',
    cigarro: 'Cigarro',
    arma: 'Arma de Fogo',
};

function KPICardsComponent({ cameraFilter, timeFilter, timeRange }: KPICardsProps) {
    const [stats, setStats] = useState({
        total: 0,
        topCamera: '-',
        topObject: '-',
        topObjectCount: 0,
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

            // Count totals
            const cameraCounts: Record<string, number> = {};
            const objectCounts: Record<string, number> = {};
            for (const item of data) {
                cameraCounts[item.camera_name] = (cameraCounts[item.camera_name] || 0) + 1;
                objectCounts[item.object_type] = (objectCounts[item.object_type] || 0) + 1;
            }

            const topCamera = Object.entries(cameraCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
            const topObjectEntry = Object.entries(objectCounts).sort((a, b) => b[1] - a[1])[0];
            const topObject = topObjectEntry ? OBJECT_LABELS[topObjectEntry[0]] || topObjectEntry[0] : '-';
            const topObjectCount = topObjectEntry?.[1] || 0;

            setStats({ total: data.length, topCamera, topObject, topObjectCount });
        } catch (err) {
            console.error('KPI fetch failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchStats(); }, [cameraFilter, timeFilter, timeRangeKey]);

    const cameraLabel = cameraFilter === 'all' ? 'Todas as câmeras' : `Câmera ${cameraFilter}`;

    return (
        <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", isLoading && "opacity-60 pointer-events-none")}>
            {/* Total detecções */}
            <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex items-center gap-4">
                <div className="bg-blue-500/10 p-3 rounded-full shrink-0">
                    <Eye className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                    <p className="text-3xl font-bold text-foreground">{isLoading ? '...' : stats.total.toLocaleString()}</p>
                    <p className="text-sm font-medium text-muted-foreground">Detecções no período</p>
                </div>
            </div>

            {/* Câmera com mais detecções */}
            <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex items-center gap-4">
                <div className="bg-green-500/10 p-3 rounded-full shrink-0">
                    <Camera className="h-8 w-8 text-green-600" />
                </div>
                <div>
                    <p className="text-xl font-bold text-foreground truncate max-w-[160px]">{isLoading ? '...' : stats.topCamera}</p>
                    <p className="text-sm font-medium text-muted-foreground">Câmera mais ativa</p>
                </div>
            </div>

            {/* Objeto mais detectado */}
            <div className="rounded-xl bg-card p-4 shadow-sm border border-border flex items-center gap-4">
                <div className="bg-yellow-500/10 p-3 rounded-full shrink-0">
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                </div>
                <div>
                    <p className="text-xl font-bold text-foreground">{isLoading ? '...' : stats.topObject}</p>
                    <p className="text-sm font-medium text-muted-foreground">
                        {isLoading ? '' : `${stats.topObjectCount} ocorrências`}
                    </p>
                </div>
            </div>

            {/* Câmera selecionada */}
            <div className="rounded-xl bg-card dark:bg-blue-500/10 p-4 shadow-sm border border-border dark:border-blue-500/20 flex items-center gap-4">
                <div className="bg-blue-200/50 p-3 rounded-full shrink-0">
                    <Target className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                    <p className="text-lg font-bold text-foreground">{cameraLabel}</p>
                    <p className="text-sm font-medium text-muted-foreground">Filtro ativo</p>
                </div>
            </div>
        </div>
    );
}

export const KPICards = memo(KPICardsComponent);
