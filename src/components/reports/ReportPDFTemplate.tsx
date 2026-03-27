import { memo } from 'react';
import { 
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, 
    ResponsiveContainer, Tooltip, XAxis, YAxis 
} from 'recharts';
import { Camera, AlertTriangle, Activity, Crosshair } from 'lucide-react';

interface DetectionItem {
    id: string | number;
    timestamp: string;
    camera_id: string;
    camera_name: string;
    object_type: string;
    severity?: string;
    confidence: number;
}

const OBJECT_LABELS: Record<string, string> = {
    arma:      'Arma de Fogo',
    emocoes:   'Emoções (Legado)',
    sonolencia:'Sonolência',
    celular:   'Celular',
    cigarro:   'Cigarro',
    maos_ao_alto: 'Mãos ao Alto',
    feliz:     'Feliz',
    triste:    'Triste',
    medo:      'Medo',
    neutro:    'Normal (Neutro)',
    raiva:     'Raiva',
    surpresa:  'Surpresa',
    nojo:      'Nojo',
};

const SEVERITY_COLORS: Record<string, string> = {
    'Baixo': '#10B981',    // Emerald 500
    'Normal': '#3B82F6',   // Blue 500
    'Alto': '#F59E0B',     // Amber 500
    'Crítico': '#EF4444',  // Red 500
};

const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4'];

interface Props {
    data: DetectionItem[];
    filters: {
        camera: string;
        object: string;
        severity: string;
        startDate: string;
        endDate: string;
    };
}

const ReportPDFTemplate = memo(({ data, filters }: Props) => {
    // Math computations
    const totalDetections = data.length;
    
    // Severity Dist
    const severityCount = data.reduce((acc, curr) => {
        const s = curr.severity || 'Normal';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const severityChartData = Object.entries(severityCount).map(([name, value]) => ({ name, value }));

    // Object Dist
    const objCount = data.reduce((acc, curr) => {
        const o = OBJECT_LABELS[curr.object_type] || curr.object_type;
        acc[o] = (acc[o] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const objChartData = Object.entries(objCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value }));
        
    // Camera Top Offender
    const camCount = data.reduce((acc, curr) => {
        const c = curr.camera_name || curr.camera_id;
        acc[c] = (acc[c] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topCamArray = Object.entries(camCount).sort((a, b) => b[1] - a[1]);
    const topCam = topCamArray[0] ? topCamArray[0][0] : 'N/A';
    const topCamCount = topCamArray[0] ? topCamArray[0][1] : 0;
    const topCamPct = totalDetections > 0 ? Math.round((topCamCount / totalDetections) * 100) : 0;

    // Temporal Peak (by hour)
    const hourCount = data.reduce((acc, curr) => {
        if (!curr.timestamp) return acc;
        // Parse "YYYY-MM-DD HH:MM:SS"
        const timePart = curr.timestamp.split(' ')[1];
        if (timePart) {
            const hour = timePart.substring(0, 2) + 'h';
            acc[hour] = (acc[hour] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);
    const timeChartData = Object.entries(hourCount)
        .map(([time, count]) => ({ time, count }))
        .sort((a, b) => a.time.localeCompare(b.time));
    
    const peakHourObj = timeChartData.length > 0 ? timeChartData.reduce((prev, current) => (prev.count > current.count) ? prev : current) : { time: 'N/A', count: 0 };
    const peakHourCount = peakHourObj.count;
    const peakHourPct = totalDetections > 0 ? Math.round((peakHourCount / totalDetections) * 100) : 0;
    
    // Most recurrent object
    const topObject = objChartData[0] ? objChartData[0].name : 'N/A';
    const numCriticos = (severityCount['Crítico'] || 0) + (severityCount['Alto'] || 0);

    return (
        <div id="pdf-report-container" className="bg-slate-900 text-slate-100 p-8 w-[1200px] h-[1697px] flex flex-col box-border font-sans absolute left-[-9999px] top-[-9999px]">
            {/* Header */}
            <header className="flex justify-between items-start border-b border-slate-700 pb-6 mb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-blue-400 tracking-tight">k-Monitor Security OMS</h1>
                    <h2 className="text-xl font-medium text-slate-300 mt-2">Relatório Executivo de Incidentes</h2>
                    <p className="text-slate-500 mt-1 text-sm">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div className="text-right text-sm text-slate-400 space-y-1 bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div><span className="font-semibold text-slate-300">Câmera:</span> {filters.camera === 'all' ? 'Todas' : filters.camera}</div>
                    <div><span className="font-semibold text-slate-300">Objeto:</span> {filters.object === 'all' ? 'Todos' : (OBJECT_LABELS[filters.object] || filters.object)}</div>
                    <div><span className="font-semibold text-slate-300">Severidade:</span> {filters.severity === 'all' ? 'Todas' : filters.severity}</div>
                    {(filters.startDate || filters.endDate) && (
                        <div><span className="font-semibold text-slate-300">Período:</span> {filters.startDate || '—'} até {filters.endDate || '—'}</div>
                    )}
                </div>
            </header>

            {totalDetections === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-2xl">
                    Nenhum dado encontrado para o período/filtros selecionados.
                </div>
            ) : (
                <>
                    {/* Insights Text */}
                    <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-5 mb-8">
                        <h3 className="text-lg font-bold text-blue-300 flex items-center gap-2 mb-3">
                            <Activity className="h-5 w-5" /> Highlights e Resoluções
                        </h3>
                        <ul className="space-y-2 text-slate-300 text-base leading-relaxed">
                            <li><span className="text-amber-400 font-bold">⚠️ Risco Primário:</span> Foram registradas <strong>{numCriticos}</strong> ocorrências de nível Crítico/Alto. O tipo de detecção mais prevalente no período foi <strong>{topObject}</strong>.</li>
                            <li><span className="text-red-400 font-bold">🎯 Top Ofensor (Câmera):</span> O maior gargalo ocorreu na câmera <strong>{topCam}</strong>, responsável por {topCamPct}% do total de eventos.</li>
                            <li><span className="text-emerald-400 font-bold">⏱️ Análise Temporal:</span> O maior pico de atividade ocorreu na faixa das <strong>{peakHourObj.time}</strong>, englobando {peakHourPct}% do movimento diário captado.</li>
                        </ul>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-4 gap-4 mb-8">
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-center">
                            <div className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                                <Crosshair className="h-4 w-4" /> Total Registros
                            </div>
                            <div className="text-4xl font-bold text-slate-50 leading-tight pb-1">{totalDetections}</div>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-center">
                            <div className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-400" /> Tx Crítica
                            </div>
                            <div className="text-4xl font-bold text-red-400 leading-tight pb-1">
                                {totalDetections > 0 ? Math.round(((severityCount['Crítico'] || 0) / totalDetections) * 100) : 0}%
                            </div>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-center overflow-hidden">
                            <div className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                                <Camera className="h-4 w-4 flex-shrink-0" /> Câmera +Acionada
                            </div>
                            <div className="text-2xl font-bold text-slate-50 leading-tight pb-1 whitespace-nowrap overflow-hidden text-ellipsis" title={topCam}>{topCam}</div>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-center overflow-hidden">
                            <div className="text-slate-400 text-sm font-medium mb-3 flex items-center gap-2">
                                <Activity className="h-4 w-4 flex-shrink-0" /> Tipo Principal
                            </div>
                            <div className="text-2xl font-bold text-slate-50 leading-tight pb-1 whitespace-nowrap overflow-hidden text-ellipsis" title={topObject}>{topObject}</div>
                        </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-2 gap-6 flex-1 max-h-[700px]">
                        {/* Line Chart: Evolução Temporal */}
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col col-span-2 shadow-sm">
                            <h3 className="text-slate-300 font-semibold mb-4">Volume de Detecções (Por Hora)</h3>
                            <div className="flex-1 min-h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeChartData}>
                                        <defs>
                                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="time" stroke="#94A3B8" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="#94A3B8" fontSize={12} tickFormatter={(tick) => Math.floor(tick).toString()} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#F8FAFC' }}
                                            itemStyle={{ color: '#F8FAFC' }}
                                        />
                                        <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" name="Eventos" isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Pie Chart: Severidade */}
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col shadow-sm">
                            <h3 className="text-slate-300 font-semibold mb-2">Classificação por Severidade</h3>
                            <div className="flex-1 min-h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={severityChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={4}
                                            dataKey="value"
                                            isAnimationActive={false}
                                        >
                                            {severityChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || '#64748B'} stroke="rgba(0,0,0,0)" />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155' }} itemStyle={{ color: '#F8FAFC' }} />
                                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '13px', color: '#CBD5E1' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Bar Chart: Objetos Top 10 */}
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col shadow-sm">
                            <h3 className="text-slate-300 font-semibold mb-4">Top 10 Tipos Detectados</h3>
                            <div className="flex-1 min-h-[240px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={objChartData} layout="vertical" margin={{ left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                        <XAxis type="number" stroke="#94A3B8" fontSize={12} />
                                        <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={11} width={80} />
                                        <Tooltip cursor={{fill: '#334155'}} contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#F8FAFC' }} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Ocorrências" isAnimationActive={false}>
                                            {objChartData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-6 text-center text-slate-500 text-xs border-t border-slate-800">
                        {new Date().getFullYear()} © k-Monitor Security OMS — Documento gerado confidencialmente
                    </div>
                </>
            )}
        </div>
    );
});

ReportPDFTemplate.displayName = 'ReportPDFTemplate';
export default ReportPDFTemplate;
