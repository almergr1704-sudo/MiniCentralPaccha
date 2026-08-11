import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, Copy, Check, FileText, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from './index';
import { toast } from 'react-hot-toast';

export interface ImportErrorItem {
  row?: number | string;
  identifier?: string;
  supply?: string;
  message: string;
  type?: 'error' | 'skipped' | 'duplicate';
}

interface ImportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  skippedCount?: number;
  errors: ImportErrorItem[];
}

export const ImportSummaryModal: React.FC<ImportSummaryModalProps> = ({
  isOpen,
  onClose,
  title = 'Resumen de Proceso Masivo',
  totalRecords,
  successCount,
  errorCount,
  skippedCount = 0,
  errors
}) => {
  const [showDetails, setShowDetails] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyErrors = () => {
    if (errors.length === 0) return;
    const textReport = errors
      .map(
        (err, index) =>
          `${index + 1}. ${err.row ? `[Fila ${err.row}] ` : ''}${err.identifier ? `(${err.identifier}) ` : ''}${err.supply ? `[Suministro ${err.supply}] ` : ''}: ${err.message}`
      )
      .join('\n');

    const fullReport = `--- REPORTE DE ERRORES / REGISTROS OMITIDOS (${title}) ---\nTotal procesados: ${totalRecords}\nExitosos: ${successCount}\nErrores: ${errorCount}\nOmitidos/Duplicados: ${skippedCount}\n\nDETALLES:\n${textReport}`;

    navigator.clipboard.writeText(fullReport);
    setCopied(true);
    toast.success('Reporte de errores copiado al portapapeles');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0B0E14]/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">{title}</h3>
                <p className="text-xs text-slate-400">
                  Resumen de la operación masiva realizada sobre {totalRecords} registro(s)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Correctos */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-emerald-400">{successCount}</div>
                  <div className="text-xs font-medium text-emerald-300/80">Procesados con Éxito</div>
                </div>
              </div>

              {/* Errores */}
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-red-500/20 text-red-400">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-red-400">{errorCount}</div>
                  <div className="text-xs font-medium text-red-300/80">Con Errores</div>
                </div>
              </div>

              {/* Omitidos/Duplicados */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-amber-400">{skippedCount}</div>
                  <div className="text-xs font-medium text-amber-300/80">Omitidos / Duplicados</div>
                </div>
              </div>
            </div>

            {/* Overall status notice */}
            {errorCount === 0 && skippedCount === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>¡La operación masiva se completó con éxito! Todos los {successCount} registros se procesaron correctamente sin inconvenientes.</span>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-300 text-sm flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-200">Atención: </span>
                    Se identificaron {errorCount + skippedCount} registro(s) que requieren revisión. Puede consultar el detalle a continuación para realizar las correcciones necesarias.
                  </div>
                </div>
              </div>
            )}

            {/* Error Details Section */}
            {errors.length > 0 && (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center justify-between px-4 py-3 bg-slate-800/50 cursor-pointer hover:bg-slate-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <span>Detalle de Registros con Errores u Omisiones ({errors.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyErrors();
                      }}
                      className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copiado' : 'Copiar Reporte'}</span>
                    </button>
                    {showDetails ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {showDetails && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60">
                    {errors.map((item, idx) => (
                      <div key={idx} className="p-3 text-xs flex items-start gap-3 hover:bg-slate-900/50 transition-colors">
                        <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                          {item.row ? `Fila ${item.row}` : `#${idx + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          {item.identifier && (
                            <span className="font-semibold text-slate-200 mr-2">
                              {item.identifier}
                            </span>
                          )}
                          {item.supply && (
                            <span className="text-blue-400 font-mono mr-2 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              {item.supply}
                            </span>
                          )}
                          <p className="text-slate-300 mt-0.5">{item.message}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            item.type === 'skipped' || item.type === 'duplicate'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {item.type === 'duplicate' ? 'Duplicado' : item.type === 'skipped' ? 'Omitido' : 'Error'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/80">
            {errors.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyErrors}
                className="text-slate-300 border-slate-700 hover:bg-slate-800"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                Copiar Reporte
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6"
            >
              Aceptar y Cerrar
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
