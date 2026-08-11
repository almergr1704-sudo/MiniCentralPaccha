import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './index';
import { AlertTriangle, CheckCircle, Info, XCircle, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ConfirmType = 'success' | 'warning' | 'error' | 'info' | 'confirm' | 'danger';

export interface ConfirmOptions {
  title?: string;
  message: string | ReactNode;
  type?: ConfirmType;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [currentConfirm, setCurrentConfirm] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setCurrentConfirm({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (currentConfirm) {
      currentConfirm.resolve(true);
      setCurrentConfirm(null);
    }
  }, [currentConfirm]);

  const handleCancel = useCallback(() => {
    if (currentConfirm) {
      currentConfirm.resolve(false);
      setCurrentConfirm(null);
    }
  }, [currentConfirm]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {currentConfirm && (
          <div key="confirm-modal-wrapper" className="fixed inset-0 z-[100] flex items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0 pointer-events-auto">
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-0 transition-opacity bg-[#0B0E14]/80 backdrop-blur-[2px]"
              onClick={handleCancel}
            />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            
            <motion.div
              key="dialog"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 inline-block px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 pointer-events-auto"
            >
              <ConfirmModalContent
                options={currentConfirm}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
};

const ConfirmModalContent = ({ options, onConfirm, onCancel }: { options: ConfirmOptions, onConfirm: () => void, onCancel: () => void }) => {
  const { 
    title, 
    message = 'Se procederá a guardar la información ingresada. Verifique los datos antes de continuar.', 
    type = 'confirm', 
    confirmLabel = 'Confirmar', 
    cancelLabel = 'Cancelar' 
  } = options;

  const iconMap = {
    success: <CheckCircle className="w-10 h-10 text-emerald-400" />,
    warning: <AlertTriangle className="w-10 h-10 text-amber-400" />,
    error: <XCircle className="w-10 h-10 text-red-400" />,
    info: <Info className="w-10 h-10 text-blue-400" />,
    confirm: <HelpCircle className="w-10 h-10 text-emerald-400" />,
    danger: <AlertTriangle className="w-10 h-10 text-red-400" />
  };

  const colorMap = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
    confirm: 'bg-emerald-500/10 border-emerald-500/20',
    danger: 'bg-red-500/10 border-red-500/20'
  };

  const defaultTitleMap = {
    success: 'Éxito',
    warning: 'Advertencia',
    error: 'Error',
    info: 'Información',
    confirm: '¿Está seguro de que desea realizar esta acción?',
    danger: 'Atención'
  };

  const displayTitle = title || defaultTitleMap[type];

  return (
    <>
      <div className="sm:flex sm:items-start text-center sm:text-left">
        <div className={cn("flex flex-shrink-0 items-center justify-center w-12 h-12 mx-auto sm:mx-0 sm:h-14 sm:w-14 rounded-2xl border", colorMap[type])}>
          {iconMap[type]}
        </div>
        <div className="mt-3 sm:mt-0 sm:ml-4 flex-1">
          <h3 className="text-lg font-bold leading-6 text-slate-100 mb-2 mt-1">
            {displayTitle}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {message}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-end gap-3">
        <button
          type="button"
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm border border-red-500/40 shadow-sm shadow-red-950/50 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
        >
          <XCircle className="w-4 h-4 text-red-200 shrink-0" />
          <span>{cancelLabel}</span>
        </button>
        <button
          type="button"
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm border border-emerald-500/50 shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirm();
          }}
        >
          <CheckCircle className="w-4 h-4 text-emerald-100 shrink-0" />
          <span>{confirmLabel}</span>
        </button>
      </div>
    </>
  );
};
