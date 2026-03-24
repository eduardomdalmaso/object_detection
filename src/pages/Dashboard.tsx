import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useCameraStore } from '@/store/useCameraStore';

import { KPICards } from '@/components/dashboard/KPICards';
import { PlatformGrid } from '@/components/dashboard/PlatformGrid';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { RefreshCcw, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '@/hooks/useSocket';

export type IntervalFilter = 'live' | 'yesterday' | '7d' | '15d' | '30d' | 'custom';

function toDateOnly(d: Date): string {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getIntervalRange(timeFilter: IntervalFilter, customStart: string | null, customEnd: string | null): { start: string | null; end: string | null } {
    const now = new Date();
    const today = toDateOnly(now);
    if (timeFilter === 'custom' && customStart && customEnd) return { start: customStart.slice(0, 10), end: customEnd.slice(0, 10) };
    if (timeFilter === 'live') return { start: today, end: today };
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateOnly(yesterday);
    if (timeFilter === 'yesterday') return { start: yesterdayStr, end: yesterdayStr };
    const start = new Date(now);
    if (timeFilter === '7d') start.setDate(start.getDate() - 6);
    else if (timeFilter === '15d') start.setDate(start.getDate() - 14);
    else if (timeFilter === '30d') start.setDate(start.getDate() - 29);
    else return { start: null, end: null };
    return { start: toDateOnly(start), end: today };
}

const Dashboard = () => {
    const [timeFilter, setTimeFilter] = useState<IntervalFilter>('live');
    const [cameraFilter, setCameraFilter] = useState('all');
    const [timeRangeStart, setTimeRangeStart] = useState<string | null>(null);
    const [timeRangeEnd, setTimeRangeEnd] = useState<string | null>(null);
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [unsavedStart, setUnsavedStart] = useState<string | null>(null);
    const [unsavedEnd, setUnsavedEnd] = useState<string | null>(null);

    const effectiveTimeRange = useMemo(
        () => getIntervalRange(timeFilter, timeRangeStart, timeRangeEnd),
        [timeFilter, timeRangeStart, timeRangeEnd]
    );
    const cameras = useCameraStore((state: any) => state.cameras);
    const { t } = useTranslation();
    const [isReloading, setIsReloading] = useState(false);
    const [realtimeData, setRealtimeData] = useState<any>(null);

    const handleSocketUpdate = useCallback((data: any) => {
        setRealtimeData(data);
    }, []);

    useSocket(handleSocketUpdate);

    const handleReload = () => {
        setIsReloading(true);
        window.location.reload();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-start">
                <button
                    onClick={handleReload}
                    className={cn(
                        "flex items-center justify-center min-h-[44px] gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors shadow-sm",
                        isReloading && "opacity-50 cursor-not-allowed bg-accent"
                    )}
                    disabled={isReloading}
                >
                    <RefreshCcw className={cn("h-4 w-4", isReloading && "animate-spin")} />
                    {isReloading ? t('dashboard.refreshing') : t('dashboard.refreshData')}
                </button>
            </div>

            {/* KPI Cards */}
            <KPICards realtimeData={realtimeData} cameraFilter={cameraFilter} timeFilter={timeFilter} timeRange={{ start: effectiveTimeRange.start, end: effectiveTimeRange.end }} />

            {/* Filter Bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between rounded-xl bg-card dark:bg-slate-800 p-3 shadow-sm border border-border dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('dashboard.timeframe')}</span>
                    <div className="relative">
                        <select
                            value={timeFilter}
                            onChange={(e) => {
                                const v = e.target.value as IntervalFilter;
                                if (v === 'custom') {
                                    setTimeFilter('custom');
                                    setUnsavedStart(timeRangeStart);
                                    setUnsavedEnd(timeRangeEnd);
                                    setShowCustomModal(true);
                                } else {
                                    setTimeFilter(v);
                                }
                            }}
                            className="flex items-center gap-2 rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 min-h-[44px] text-sm font-medium text-secondary-foreground dark:text-slate-300 hover:bg-accent dark:hover:bg-slate-600 w-full md:w-auto md:min-w-[160px] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 border border-border dark:border-slate-600"
                        >
                            <option value="live">{t('dashboard.interval_live')}</option>
                            <option value="yesterday">{t('dashboard.interval_yesterday')}</option>
                            <option value="7d">{t('dashboard.interval_7d')}</option>
                            <option value="15d">{t('dashboard.interval_15d')}</option>
                            <option value="30d">{t('dashboard.interval_30d')}</option>
                            <option value="custom">{t('dashboard.custom_range') || 'Custom range'}</option>
                        </select>
                    </div>
                </div>

                {/* Camera Filter */}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Câmera</span>
                    <div className="relative">
                        <select
                            value={cameraFilter}
                            onChange={(e) => setCameraFilter(e.target.value)}
                            className="flex items-center gap-2 rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 min-h-[44px] text-sm font-medium text-secondary-foreground dark:text-slate-300 hover:bg-accent dark:hover:bg-slate-600 w-full md:w-auto md:min-w-[160px] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 border border-border dark:border-slate-600"
                        >
                            <option value="all">Todas as câmeras</option>
                            {Array.isArray(cameras) && cameras.map((c: any) => (
                                <option key={c.id} value={String(c.id)}>{c.name || `Câmera ${c.id}`}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 dark:text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Camera/Mosaic Grid */}
            <div className="pb-3">
                <div className="w-full">
                    <PlatformGrid platformFilter={cameraFilter} realtimeData={realtimeData} />
                </div>
            </div>

            {/* Detection Charts */}
            <DashboardCharts
                timeFilter={timeFilter}
                cameraFilter={cameraFilter}
                timeRange={{ start: effectiveTimeRange.start, end: effectiveTimeRange.end }}
            />

            {showCustomModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCustomModal(false)} />
                    <div className="relative bg-card rounded-lg p-6 w-[520px] shadow-lg border border-border">
                        <h3 className="text-lg font-bold mb-4">{t('dashboard.custom_range_modal_title') || 'Custom date & time range'}</h3>
                        <div className="flex flex-col gap-3">
                            <label className="text-sm text-muted-foreground">{t('dashboard.start') || 'Start'}</label>
                            <input type="datetime-local" value={unsavedStart || ''}
                                onChange={(e) => setUnsavedStart(e.target.value || null)}
                                className="rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm text-secondary-foreground dark:text-slate-300 border border-border dark:border-slate-600" />
                            <label className="text-sm text-muted-foreground">{t('dashboard.end') || 'End'}</label>
                            <input type="datetime-local" value={unsavedEnd || ''}
                                onChange={(e) => setUnsavedEnd(e.target.value || null)}
                                className="rounded-lg bg-secondary dark:bg-slate-700 px-3 py-2 text-sm text-secondary-foreground dark:text-slate-300 border border-border dark:border-slate-600" />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setShowCustomModal(false)}
                                className="px-3 py-2 min-h-[44px] flex items-center justify-center rounded-lg border border-border text-sm">
                                {t('dashboard.cancel') || 'Cancel'}
                            </button>
                            <button onClick={() => {
                                if (unsavedStart && unsavedEnd && new Date(unsavedStart) <= new Date(unsavedEnd)) {
                                    setTimeRangeStart(unsavedStart);
                                    setTimeRangeEnd(unsavedEnd);
                                    setTimeFilter('custom');
                                    setShowCustomModal(false);
                                } else {
                                    alert(t('dashboard.invalid_range') || 'Invalid range: start must be before end.');
                                }
                            }} className="px-3 py-2 min-h-[44px] flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm">
                                {t('dashboard.apply') || 'Apply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
