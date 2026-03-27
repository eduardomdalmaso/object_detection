import { useEffect, useState, useMemo, memo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

export type ChartPeriod = 'hour' | 'day' | 'week' | 'month';

interface DashboardChartsProps {
    timeFilter: import('@/pages/Dashboard').IntervalFilter;
    cameraFilter: string;
    timeRange?: { start?: string | null; end?: string | null };
}

const DETECTION_SERIES = [
    { key: 'emocoes',    label: 'Emoções',       color: '#8b5cf6' },
    { key: 'sonolencia', label: 'Sonolência',    color: '#f59e0b' },
    { key: 'celular',    label: 'Celular',       color: '#3b82f6' },
    { key: 'cigarro',    label: 'Cigarro',       color: '#ef4444' },
    { key: 'maos_ao_alto', label: 'Mãos ao Alto', color: '#6b7280' },
    { key: 'arma',       label: 'Arma de Fogo',  color: '#06b6d4' },
];

function toDateOnly(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function DashboardChartsComponent({ timeFilter, cameraFilter, timeRange }: DashboardChartsProps) {
    const { t } = useTranslation();
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day');

    const fetchChartData = async () => {
        setIsLoading(true);
        try {
            const cameraKey = cameraFilter === 'all' ? 'all' : cameraFilter;
            const now = new Date();
            let start: string;
            let end: string;
            if (timeFilter === 'live') {
                const startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 6);
                start = toDateOnly(startDate);
                end = toDateOnly(now);
            } else {
                start = timeRange?.start ?? toDateOnly(now);
                end = timeRange?.end ?? start;
            }
            const params: Record<string, string> = { start, end };
            const url = `/api/v1/charts/${cameraKey}-${chartPeriod}?${new URLSearchParams(params)}`;
            const response = await api.get(url);
            const newData = response.data.data || [];
            setData(prev => newData.length === 0 && prev.length > 0 ? prev : newData);
        } catch (error) {
            console.error('Failed to fetch chart data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchChartData();
    }, [chartPeriod, cameraFilter, timeFilter, timeRange?.start, timeRange?.end]);

    // Auto-refresh every 30s when in live mode
    useEffect(() => {
        if (timeFilter !== 'live') return;
        const interval = setInterval(() => {
            fetchChartData();
        }, 30_000);
        return () => clearInterval(interval);
    }, [timeFilter, cameraFilter, chartPeriod]);

    const cameraLabel = cameraFilter === 'all' ? 'Todas as câmeras' : `Câmera ${cameraFilter}`;
    const chartData = useMemo(() => data || [], [data]);

    const periodButtons: { key: ChartPeriod; label: string }[] = [
        { key: 'hour',  label: t('dashboard.hourly')  },
        { key: 'day',   label: t('dashboard.daily')   },
        { key: 'week',  label: t('dashboard.weekly')  },
        { key: 'month', label: t('dashboard.monthly') },
    ];

    return (
        <div className="rounded-xl bg-card dark:bg-slate-800 p-6 shadow-sm border border-border dark:border-slate-700">
            <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-bold text-lg text-foreground">
                    Detecções por Objeto — {cameraLabel}
                </h3>
                <div className="flex bg-secondary dark:bg-slate-700 rounded-lg p-1 border border-border dark:border-slate-600">
                    {periodButtons.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setChartPeriod(key)}
                            className={cn(
                                "px-3 py-1 text-xs font-medium rounded shadow-sm transition-all",
                                chartPeriod === key ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[350px] w-full relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] z-10 rounded-lg">
                        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border opacity-50" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false}
                            tick={{ fill: 'currentColor', fontSize: 12 }} className="text-muted-foreground" dy={10} />
                        <YAxis axisLine={false} tickLine={false}
                            tick={{ fill: 'currentColor', fontSize: 12 }} className="text-muted-foreground"
                            domain={[0, 'auto']} allowDecimals={false} minTickGap={10} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'inherit' }}
                        />
                        <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px' }} iconType="circle" />

                        {DETECTION_SERIES.map((s, i) => (
                            <Area
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.label}
                                stackId={String(i + 1)}
                                stroke={s.color}
                                fill="transparent"
                                strokeWidth={3}
                                dot={{ fill: s.color, r: 4, strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 8 }}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export const DashboardCharts = memo(DashboardChartsComponent);
