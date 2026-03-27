import { useState, useEffect, memo } from "react";
import { X, Check, Loader2, Hand } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

const DETECTION_MODES = [
  { key: "emotion",   label: "Emoções",        icon: "😄", color: "bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300" },
  { key: "sleeping",  label: "Sonolência",     icon: "😴", color: "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300" },
  { key: "phone",     label: "Celular",        icon: "📱", color: "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300" },
  { key: "cigarette", label: "Cigarro",        icon: "🚬", color: "bg-red-500/20 border-red-500 text-red-700 dark:text-red-300" },
  { key: "hand",      label: "Mãos ao Alto",   icon: <Hand className="w-4 h-4 text-slate-500" strokeWidth={2.5} />, color: "bg-slate-500/20 border-slate-500 text-slate-700 dark:text-slate-300" },
  { key: "gun",       label: "Arma de Fogo",   icon: "🔫", color: "bg-cyan-500/20 border-cyan-500 text-cyan-700 dark:text-cyan-300" },
];


interface DetectionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraId: string;
  cameraName: string;
  currentModes: string[];
  onModesChanged?: (cameraId: string, newModes: string[]) => void;
}

function DetectionConfigModalComponent({
  isOpen,
  onClose,
  cameraId,
  cameraName,
  currentModes,
  onModesChanged,
}: DetectionConfigModalProps) {
  const [selectedModes, setSelectedModes] = useState<string[]>(currentModes?.length ? currentModes : ["emotion"]);
  const [isSaving, setIsSaving] = useState(false);
  const [streamKey] = useState(Date.now());

  const mjpegBase = "";
  const streamUrl = `${mjpegBase}/video_feed?plat=${encodeURIComponent(cameraId)}&t=${streamKey}`;

  useEffect(() => {
    setSelectedModes(currentModes?.length ? currentModes : ["emotion"]);
  }, [currentModes, isOpen]);

  const toggleMode = (key: string) => {
    setSelectedModes((prev) => {
      if (prev.includes(key)) {
        // Don't allow deselecting all
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== key);
      }
      return [...prev, key];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.post("/api/v1/set_modes", {
        camera_id: cameraId,
        modes: selectedModes,
      });
      onModesChanged?.(cameraId, selectedModes);
      onClose();
    } catch (err) {
      console.error("Failed to set detection modes:", err);
      alert("Erro ao salvar modos de detecção.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl rounded-2xl bg-card dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex items-center justify-between text-white">
          <div>
            <h2 className="text-xl font-bold">{cameraName}</h2>
            <p className="text-slate-400 text-sm">Configurar detecções ativas</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stream Preview */}
            <div className="lg:col-span-2">
              <div
                className="relative bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-700 shadow-inner"
                style={{ aspectRatio: "16/9" }}
              >
                <img
                  src={streamUrl}
                  alt={cameraName}
                  className="w-full h-full object-cover"
                  crossOrigin="use-credentials"
                  referrerPolicy="no-referrer"
                  decoding="async"
                />
                {/* Active modes badge */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                  {selectedModes.map((m) => {
                    const mode = DETECTION_MODES.find((d) => d.key === m);
                    if (!mode) return null;
                    return (
                      <div
                        key={m}
                        className="bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg text-white text-xs font-medium flex items-center gap-1.5"
                      >
                        <span>{mode.icon}</span>
                        {mode.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-foreground mb-1">Detecções Ativas</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Selecione quais detecções estarão ativas nesta câmera. É possível selecionar múltiplas.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {DETECTION_MODES.map((mode) => {
                  const isActive = selectedModes.includes(mode.key);
                  return (
                    <button
                      key={mode.key}
                      onClick={() => toggleMode(mode.key)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                        isActive
                          ? mode.color + " shadow-md scale-[1.02]"
                          : "border-border hover:border-slate-400 dark:hover:border-slate-500 bg-card"
                      )}
                    >
                      <span className="text-2xl">{mode.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{mode.label}</div>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isActive
                            ? "bg-current border-current"
                            : "border-slate-300 dark:border-slate-600"
                        )}
                      >
                        {isActive && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] text-muted-foreground mt-2">
                Mínimo 1 detecção ativa. {selectedModes.length} selecionada(s).
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || selectedModes.length === 0}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Aplicar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export const DetectionConfigModal = memo(DetectionConfigModalComponent);
