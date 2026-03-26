import { useState, useMemo, useEffect } from 'react';
import {
    FileText, Download, Filter, Loader2, CheckCircle2, XCircle,
    Activity, ClipboardList, RefreshCcw, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useCameraStore } from '@/store/useCameraStore';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface IntegrationLog {
    id: string;
    system: string;
    status: 'success' | 'error';
    date: string;
    message: string;
}

interface DetectionItem {
    id: string | number;
    timestamp: string;
    camera_id: string;
    camera_name: string;
    object_type: string;
    confidence: number;
}

const OBJECT_LABELS: Record<string, string> = {
    emocoes:   'Emoções',
    sonolencia:'Sonolência',
    celular:   'Celular',
    cigarro:   'Cigarro',
    maos_ao_alto: 'Mãos ao Alto',
};

const OBJECT_COLORS: Record<string, string> = {
    emocoes:   'bg-violet-100 text-violet-800',
    sonolencia:'bg-amber-100 text-amber-800',
    celular:   'bg-blue-100 text-blue-800',
    cigarro:   'bg-red-100 text-red-800',
    maos_ao_alto: 'bg-gray-100 text-gray-800',
};

const Reports = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'operations' | 'integrations'>('operations');

    const cameras = useCameraStore((state: any) => state.cameras);
    const [cameraFilter, setCameraFilter] = useState('all');
    const [objectFilter, setObjectFilter] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [includeTime, setIncludeTime] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    const [allData, setAllData] = useState<DetectionItem[]>([]);
    const [integrationLogs, setIntegrationLogs] = useState<IntegrationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const params: any = {};
            if (startDate) params.start = startDate;
            if (endDate) params.end = endDate;
            if (cameraFilter !== 'all') params.camera = cameraFilter;
            if (objectFilter !== 'all') params.object = objectFilter;

            const [reportsRes, logsRes] = await Promise.all([
                api.get('/api/v1/reports', { params }),
                api.get('/api/v1/integration-logs').catch(() => ({ data: { data: [] } }))
            ]);
            setAllData(reportsRes.data.data || []);
            setIntegrationLogs(logsRes.data.data || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            setAllData([]);
            setIntegrationLogs([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { fetchData(); }, [cameraFilter, objectFilter, startDate, endDate]);
    useEffect(() => { setCurrentPage(1); }, [cameraFilter, objectFilter, startDate, endDate]);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedData = useMemo(() => {
        const copy = allData.slice();
        if (!sortKey) return copy;
        copy.sort((a: any, b: any) => {
            const va = a[sortKey] ?? '';
            const vb = b[sortKey] ?? '';
            const dir = sortDirection === 'asc' ? 1 : -1;
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
        return copy;
    }, [allData, sortKey, sortDirection]);

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedData.slice(start, start + itemsPerPage);
    }, [sortedData, currentPage, itemsPerPage]);

    const handleExport = async (format: 'PDF' | 'CSV') => {
        setIsExporting(true);
        try {
            if (allData.length === 0) {
                alert('Não há dados para os filtros selecionados.');
                setIsExporting(false);
                return;
            }

            const today = new Date().toISOString().slice(0, 10);

            if (format === 'CSV') {
                const header = ['Data/Hora', 'Câmera', 'Objeto Detectado', 'Confiança (%)'];
                const rows = sortedData.map((item: any) => [
                    item.timestamp || '',
                    item.camera_name || item.camera_id || '',
                    OBJECT_LABELS[item.object_type] || item.object_type || '',
                    String(item.confidence ?? 0),
                ]);
                const csvContent = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `relatorio_deteccoes_${today}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            } else {
                // PDF via jsPDF + autoTable
                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

                // Title
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text('Relatorio de Deteccoes', 14, 20);

                // Subtitle
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100);
                doc.text('Object Detection System', 14, 27);

                // Metadata
                doc.setFontSize(9);
                doc.setTextColor(60);
                const camLabel = cameraFilter === 'all' ? 'Todas as cameras' : cameraFilter;
                const objLabel = objectFilter === 'all' ? 'Todos os objetos' : (OBJECT_LABELS[objectFilter] || objectFilter);
                doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 35);
                doc.text(`Camera: ${camLabel}  |  Objeto: ${objLabel}  |  Total: ${sortedData.length} registro(s)`, 14, 40);
                if (startDate || endDate) {
                    doc.text(`Periodo: ${startDate || '—'} ate ${endDate || '—'}`, 14, 45);
                }

                // Table
                const tableData = sortedData.map((item: any) => [
                    item.timestamp || '—',
                    item.camera_name || item.camera_id || '—',
                    OBJECT_LABELS[item.object_type] || item.object_type || '—',
                    `${item.confidence ?? 0}%`,
                ]);

                autoTable(doc, {
                    startY: startDate || endDate ? 50 : 45,
                    head: [['Data/Hora', 'Camera', 'Objeto Detectado', 'Confianca (%)']],
                    body: tableData,
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                    margin: { left: 14, right: 14 },
                });

                // Footer
                const pageCount = doc.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(
                        `Pagina ${i} de ${pageCount} — Gerado automaticamente pelo Object Detection System`,
                        14,
                        doc.internal.pageSize.height - 8,
                    );
                }

                doc.save(`relatorio_deteccoes_${today}.pdf`);
            }
        } catch (error: any) {
            alert(`Nao foi possivel gerar o ${format}. Tente novamente.`);
        } finally {
            setIsExporting(false);
        }
    };

    const SortTh = ({ label, sortId }: { label: string; sortId: string }) => (
        <th onClick={() => handleSort(sortId)} role="button" tabIndex={0}
            className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider cursor-pointer select-none">
            {label}
            <span className="ml-1 text-xs">{sortKey === sortId ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</span>
        </th>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{t('reports.title')}</h1>
                <p className="text-slate-500">{t('reports.subtitle')}</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex p-1 bg-secondary rounded-xl w-fit border border-border">
                <button onClick={() => setActiveTab('operations')}
                    className={cn("flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all",
                        activeTab === 'operations' ? "bg-background text-blue-600 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    <ClipboardList className="h-4 w-4" />
                    Detecções
                </button>
                <button onClick={() => setActiveTab('integrations')}
                    className={cn("flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all",
                        activeTab === 'integrations' ? "bg-background text-blue-600 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    <Activity className="h-4 w-4" />
                    {t('reports.tabs.integrations')}
                </button>
            </div>

            {activeTab === 'operations' ? (
                <>
                    {/* Filters */}
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                            <div className="flex items-center gap-2 text-foreground font-semibold">
                                <Filter className="h-5 w-5 text-blue-600" />
                                <h2>Filtros</h2>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
                                        checked={includeTime} onChange={(e) => setIncludeTime(e.target.checked)} />
                                    <span>Incluir hora</span>
                                </label>
                                <button onClick={() => { setCameraFilter('all'); setObjectFilter('all'); setStartDate(''); setEndDate(''); setCurrentPage(1); }}
                                    className="px-3 py-1 text-xs font-medium rounded-lg border border-border bg-secondary text-muted-foreground hover:bg-accent transition-colors">
                                    Resetar filtros
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Câmera */}
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">Câmera</label>
                                <select className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={cameraFilter} onChange={(e) => setCameraFilter(e.target.value)}>
                                    <option value="all">Todas as câmeras</option>
                                    {Array.isArray(cameras) && cameras.map((c: any) => (
                                        <option key={c.id} value={String(c.id)}>{c.name || `Câmera ${c.id}`}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Objeto detectado */}
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">Objeto detectado</label>
                                <select className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={objectFilter} onChange={(e) => setObjectFilter(e.target.value)}>
                                    <option value="all">Todos os objetos</option>
                                    {Object.entries(OBJECT_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Data início */}
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.startDate')}</label>
                                <input type={includeTime ? 'datetime-local' : 'date'}
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            </div>

                            {/* Data fim */}
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">{t('reports.filters.endDate')}</label>
                                <input type={includeTime ? 'datetime-local' : 'date'}
                                    className="w-full rounded-lg bg-background border-border border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                            <FileText className="h-5 w-5" />
                            <span className="font-medium">{allData.length} resultado(s)</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {(['PDF', 'CSV'] as const).map((fmt) => (
                                <button key={fmt} onClick={() => handleExport(fmt)} disabled={isExporting}
                                    className={cn("flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium bg-background border border-border rounded-lg hover:bg-accent transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
                                        fmt === 'PDF' ? 'text-red-600' : 'text-indigo-600')}>
                                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : fmt === 'PDF' ? <FileText className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                                    {isExporting ? 'Exportando...' : `Exportar ${fmt}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <SortTh label="Data/Hora"        sortId="timestamp"   />
                                        <SortTh label="Câmera"           sortId="camera_name" />
                                        <SortTh label="Objeto detectado" sortId="object_type" />
                                        <SortTh label="Confiança (%)"    sortId="confidence"  />
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
                                                <p className="text-lg font-medium">Carregando dados...</p>
                                            </td>
                                        </tr>
                                    ) : paginatedData.length > 0 ? (
                                        paginatedData.map((item: any, idx) => {
                                            const key = item.id ?? `row-${idx}`;
                                            const objColor = OBJECT_COLORS[item.object_type] || 'bg-gray-100 text-gray-800';
                                            const objLabel = OBJECT_LABELS[item.object_type] || item.object_type;
                                            return (
                                                <tr key={key} className="hover:bg-secondary/30 transition-colors">
                                                    <td className="px-4 py-4 text-sm text-foreground font-medium">{item.timestamp || '-'}</td>
                                                    <td className="px-4 py-4 text-sm text-muted-foreground">{item.camera_name || item.camera_id || '-'}</td>
                                                    <td className="px-4 py-4 text-sm">
                                                        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", objColor)}>
                                                            {objLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-sm text-foreground font-bold">{item.confidence ?? 0}%</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                                                <p className="text-lg font-medium">{t('reports.empty.noRecords')}</p>
                                                <p className="text-sm">{t('reports.empty.tryFilters')}</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="px-6 py-4 bg-secondary/30 border-t border-border flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    Mostrando <span className="font-medium text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, sortedData.length)}</span> de <span className="font-medium text-foreground">{sortedData.length}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                                        className="px-3 py-1 min-h-[44px] flex items-center text-sm font-medium rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                        Anterior
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button key={page} onClick={() => setCurrentPage(page)}
                                            className={cn("w-11 h-11 text-sm flex items-center justify-center font-medium rounded transition-colors",
                                                currentPage === page ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-accent")}>
                                            {page}
                                        </button>
                                    ))}
                                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
                                        className="px-3 py-1 min-h-[44px] flex items-center text-sm font-medium rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                        Próximo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* Integration Logs */}
                    <div className="flex justify-between items-center bg-orange-500/10 p-4 rounded-lg border border-orange-500/20">
                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                            <Activity className="h-5 w-5" />
                            <span className="font-medium">{t('reports.integrations.title')}</span>
                        </div>
                        <button onClick={fetchData} className="text-xs flex items-center gap-2 font-medium text-orange-600 dark:text-orange-400 hover:underline">
                            <RefreshCcw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                            {t('reports.integrations.refresh')}
                        </button>
                    </div>

                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[400px]">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">Sistema</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">Data/Hora</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground dark:text-white uppercase tracking-wider">Mensagem</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-border">
                                    {isLoading ? (
                                        <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                            <Loader2 className="h-10 w-10 mx-auto text-blue-500 animate-spin mb-3" />
                                        </td></tr>
                                    ) : integrationLogs.length > 0 ? (
                                        integrationLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {log.status === 'success' ? (
                                                        <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold px-2 py-1 bg-green-50 rounded-lg border border-green-100">
                                                            <CheckCircle2 className="h-3.5 w-3.5" /> Sucesso
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                                                            <XCircle className="h-3.5 w-3.5" /> Erro
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-bold">{log.system}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">{log.date}</td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground italic">"{log.message}"</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                            <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                                            <p className="text-lg font-medium">{t('reports.integrations.empty')}</p>
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Reports;
