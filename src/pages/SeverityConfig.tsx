import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Loader2, ShieldAlert, Search } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

// Labels used for UI only
const SEVERITY_OBJECTS: Record<string, string> = {
    arma: 'Arma de Fogo',
    celular: 'Celular',
    cigarro: 'Cigarro',
    maos_ao_alto: 'Mãos ao Alto',
    sonolencia: 'Sonolência',
    feliz: 'Emoção: Feliz',
    triste: 'Emoção: Triste',
    medo: 'Emoção: Medo',
    neutro: 'Emoção: Normal (Neutro)',
    raiva: 'Emoção: Raiva',
};

// Possible levels
const SEVERITY_LEVELS = [
    { value: 'Baixo', label: 'Baixo', color: 'bg-green-100 text-green-800' },
    { value: 'Normal', label: 'Normal', color: 'bg-blue-100 text-blue-800' },
    { value: 'Alto', label: 'Alto', color: 'bg-orange-100 text-orange-800' },
    { value: 'Crítico', label: 'Crítico', color: 'bg-red-100 text-red-800' },
];

export default function SeverityConfig() {
    const user = useAuthStore(state => state.user);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [severities, setSeverities] = useState<Record<string, string>>({});

    const fetchConfig = async () => {
        setIsLoading(true);
        try {
            const res = await api.get('/api/v1/severities');
            // default unconfigured fields to 'Normal'
            const data = res.data.severities || {};
            const initial: Record<string, string> = {};
            Object.keys(SEVERITY_OBJECTS).forEach(key => {
                initial[key] = data[key] || 'Normal';
            });
            setSeverities(initial);
        } catch (error) {
            console.error('Failed to fetch severities', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleChange = (key: string, value: string) => {
        setSeverities(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!user || user.role !== 'admin') return;
        setIsSaving(true);
        try {
            await api.post('/api/v1/severities', severities);
            alert('Configurações de Severidade salvas com sucesso!');
        } catch (error) {
            console.error('Failed to save severities', error);
            alert('Erro ao salvar as configurações.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    const filteredObjects = Object.entries(SEVERITY_OBJECTS).filter(([key, label]) => 
        label.toLowerCase().includes(searchTerm.toLowerCase()) || key.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 relative">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Classificação de Risco</h1>
                    <p className="text-muted-foreground mt-1">
                        Define o grau de risco (Severidade) para cada tipo de objeto ou emoção detectada pelo sistema.
                    </p>
                </div>
                {user?.role === 'admin' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Salvar Configurações
                    </button>
                )}
            </div>

            <div className="flex items-center rounded-lg border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-600">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Pesquisar categoria ou chave..."
                    className="ml-2 flex-1 border-none bg-transparent outline-none placeholder:text-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-secondary/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Objeto / Categoria</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Amostra Visual</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Grau de Risco</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                        {filteredObjects.map(([key, label]) => {
                            const currentVal = severities[key] || 'Normal';
                            const activeColor = SEVERITY_LEVELS.find(l => l.value === currentVal)?.color || 'bg-gray-100 text-gray-800';

                            return (
                                <tr key={key} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                                                <ShieldAlert className="h-5 w-5 opacity-80" />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-foreground">{label}</div>
                                                <div className="text-xs text-muted-foreground">Chave interna: {key}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${activeColor}`}>
                                            {currentVal}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex justify-end">
                                            <select
                                                value={currentVal}
                                                disabled={user?.role !== 'admin'}
                                                onChange={(e) => handleChange(key, e.target.value)}
                                                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-foreground w-40"
                                            >
                                                {SEVERITY_LEVELS.map(level => (
                                                    <option key={level.value} value={level.value}>{level.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredObjects.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                    Nenhuma categoria de risco encontrada.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
