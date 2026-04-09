import { X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useState } from 'react';

interface HighRiskModalProps {
    events: any[];
    onClose: () => void;
    onReset: () => void;
}

export function HighRiskModal({ events, onClose, onReset }: HighRiskModalProps) {
    const [isResetting, setIsResetting] = useState(false);

    const handleReset = async () => {
        setIsResetting(true);
        try {
            const ids = events.map(e => e.id);
            await api.post('/api/v1/detections/acknowledge', { ids });
            onReset(); // Should trigger a re-fetch of KPIs and close modal
        } catch (err) {
            console.error('Failed to reset risks:', err);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-card w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[85vh] border border-red-500/30">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border bg-red-500/10 rounded-t-xl">
                    <div className="flex items-center gap-3 text-red-500">
                        <ShieldAlert className="h-6 w-6" />
                        <h2 className="text-xl font-bold tracking-tight">Painel de Alertas de Risco</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-secondary transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body / Table */}
                <div className="p-5 overflow-auto flex-1">
                    <p className="text-sm text-muted-foreground mb-4">
                        Os seguintes eventos críticos estão ativos e requerem atenção. Eles mantêm o indicador do painel em estado de Risco Alto.
                    </p>

                    {events.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            Nenhum alerta de alto risco ativo no momento.
                        </div>
                    ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-secondary text-secondary-foreground text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3">ID</th>
                                        <th className="px-4 py-3">Data/Hora</th>
                                        <th className="px-4 py-3">Câmera</th>
                                        <th className="px-4 py-3">Objeto Detectado</th>
                                        <th className="px-4 py-3">Confiança</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {events.map((evt) => (
                                        <tr key={evt.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-4 py-3 font-medium">#{evt.id}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{evt.timestamp}</td>
                                            <td className="px-4 py-3">{evt.camera_name || evt.camera_id}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-500/20">
                                                    {evt.object_type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{evt.confidence}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-border bg-muted/20 flex items-center justify-between rounded-b-xl">
                    <span className="text-sm font-medium text-foreground">
                        Total de Ocorrências Críticas: {events.length}
                    </span>
                    <button 
                        onClick={handleReset}
                        disabled={events.length === 0 || isResetting}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-lg shadow-red-500/20 transition-all",
                            (events.length === 0 || isResetting) && "opacity-50 cursor-not-allowed shadow-none"
                        )}
                    >
                        {isResetting ? (
                            <span className="flex items-center gap-2">Processando...</span>
                        ) : (
                            <><CheckCircle2 className="h-5 w-5" /> Resetar Rastreio de Riscos</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
