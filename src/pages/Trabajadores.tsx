import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { Trabajador, PagoSueldo } from '../store/types';
import { 
  Briefcase, Plus, Search, Edit2, UserCheck, UserX, DollarSign, 
  FileText, Printer, Download, Eye, TrendingUp, Calendar, AlertTriangle, Info, CheckCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { generatePayrollReceiptPDF } from '../lib/receipts';

export default function Trabajadores() {
  const { 
    trabajadores = [], 
    pagosSueldos = [], 
    addTrabajador, 
    updateTrabajador, 
    userRole 
  } = useAppContext();

  // Navigation Tabs: 'directorio' (Worker Directory) or 'reportes' (Payroll Register & Reports)
  const [activeTab, setActiveTab] = useState<'directorio' | 'reportes'>('directorio');

  // Search & Filter state for Workers
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');

  // Selected worker details modal
  const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);

  // Modal State for Register / Edit Worker
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  
  // Worker Form State
  const [workerForm, setWorkerForm] = useState({
    nombres: '',
    apellidos: '',
    dni: '',
    cargo: '',
    sueldoMensual: 0,
    telefono: '',
    correo: '',
    direccion: '',
    observaciones: '',
    estado: 'ACTIVO' as 'ACTIVO' | 'INACTIVO'
  });

  // Report States: Selected month, worker, year for filtering
  const [reportMonth, setReportMonth] = useState(() => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${today.getFullYear()}-${mm}`;
  });
  const [reportWorkerId, setReportWorkerId] = useState('ALL');
  const [reportYear, setReportYear] = useState('2026');

  // Form Reset
  const resetWorkerForm = (worker?: Trabajador) => {
    try {
      if (worker) {
        setWorkerForm({
          nombres: worker.nombres || '',
          apellidos: worker.apellidos || '',
          dni: worker.dni || '',
          cargo: worker.cargo || '',
          sueldoMensual: worker.sueldoMensual || 0,
          telefono: worker.telefono || '',
          correo: worker.correo || '',
          direccion: worker.direccion || '',
          observaciones: worker.observaciones || '',
          estado: worker.estado || 'ACTIVO'
        });
        setEditingWorkerId(worker.id);
      } else {
        setWorkerForm({
          nombres: '',
          apellidos: '',
          dni: '',
          cargo: '',
          sueldoMensual: 0,
          telefono: '',
          correo: '',
          direccion: '',
          observaciones: '',
          estado: 'ACTIVO'
        });
        setEditingWorkerId(null);
      }
    } catch (error) {
      console.error('Error resetWorkerForm:', error);
      toast.error('Error al inicializar el formulario.');
    }
  };

  // Submit Worker registration / update
  const handleWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!workerForm.nombres.trim() || !workerForm.apellidos.trim()) {
        toast.error('Por favor, ingrese nombres y apellidos del trabajador.');
        return;
      }
      if (!/^\d{8}$/.test(workerForm.dni)) {
        toast.error('El DNI debe tener exactamente 8 dígitos.');
        return;
      }
      if (workerForm.sueldoMensual <= 0) {
        toast.error('El sueldo mensual debe ser mayor a cero.');
        return;
      }

      if (editingWorkerId) {
        await updateTrabajador(editingWorkerId, workerForm);
        toast.success('Trabajador actualizado con éxito.');
      } else {
        await addTrabajador(workerForm);
        toast.success('Trabajador registrado con éxito.');
      }
      setIsWorkerModalOpen(false);
      resetWorkerForm();
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar el trabajador.');
    }
  };

  // Toggle active status cleanly from card / row action
  const handleToggleState = async (worker: Trabajador) => {
    const nextStatus = worker.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      await updateTrabajador(worker.id, { estado: nextStatus });
      toast.success(`Trabajador cambiado a ${nextStatus.toLowerCase()} con éxito.`);
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado.');
    }
  };

  // Format YYYY-MM to Spanish Month Name
  const formatMes = (mesRaw: string) => {
    if (!mesRaw || typeof mesRaw !== 'string') return mesRaw || '';
    const parts = mesRaw.split('-');
    if (parts.length < 2) return mesRaw;
    const [year, month] = parts;
    const mNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = mNames[monthIndex] || month;
    return `${monthName} ${year}`;
  };

  const formatFecha = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('es-PE');
  };

  // Calculate Metrics
  const activeWorkers = (trabajadores || []).filter(t => t && t.estado === 'ACTIVO');
  const inactiveWorkers = (trabajadores || []).filter(t => t && t.estado === 'INACTIVO');
  
  // Total wages registered this year
  const filteredYearlyPayments = (pagosSueldos || []).filter(p => p && p.mesPagado && p.mesPagado.startsWith(reportYear));
  const totalYearlyWages = filteredYearlyPayments.reduce((acc, p) => acc + (p.monto || 0), 0);

  // Filtered workers list
  const filteredWorkers = (trabajadores || []).filter(worker => {
    if (!worker) return false;
    const query = `${worker.nombres || ''} ${worker.apellidos || ''} ${worker.dni || ''} ${worker.cargo || ''}`.toLowerCase();
    const matchesSearch = query.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'TODOS' || worker.estado === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const nameA = `${a.apellidos || ''}, ${a.nombres || ''}`.toLowerCase();
    const nameB = `${b.apellidos || ''}, ${b.nombres || ''}`.toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });

  // Payments lists corresponding to single worker or months
  const filteredPayments = (pagosSueldos || []).filter(p => {
    if (!p) return false;
    const matchesWorker = reportWorkerId === 'ALL' || p.trabajadorId === reportWorkerId;
    const matchesMonth = !reportMonth || p.mesPagado === reportMonth;
    return matchesWorker && matchesMonth;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-[#121824] border border-slate-800 rounded-xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-5 pointer-events-none">
          <Briefcase className="w-full h-full rotate-12 scale-125" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="bg-blue-500/10 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded-md border border-blue-500/20">
              Operaciones de Planta
            </span>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1.5">
              Gestión de Trabajadores y Remuneraciones
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Registro administrativo del personal de planta, control mensual de sueldos y auditoría de egresos planificados.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                try {
                  resetWorkerForm();
                  setIsWorkerModalOpen(true);
                } catch (err: any) {
                  toast.error('Ocurrió un error al cargar el formulario.');
                  console.error(err);
                }
              }}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all duration-150 shadow-sm"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo Trabajador
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Controls */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('directorio')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 -mb-[2px] ${
            activeTab === 'directorio' 
              ? 'border-blue-500 text-blue-400 bg-slate-900/40 rounded-t-lg' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5">
            <Briefcase className="h-4 w-4" />
            <span>Directorio de Trabajadores</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded ml-1">
              {trabajadores.length}
            </span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('reportes')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 -mb-[2px] ${
            activeTab === 'reportes' 
              ? 'border-blue-500 text-blue-400 bg-slate-900/40 rounded-t-lg' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-1.5">
            <TrendingUp className="h-4 w-4" />
            <span>Planilla de Pagos & Reportes</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded ml-1">
              {pagosSueldos.length}
            </span>
          </div>
        </button>
      </div>

      {/* TABS VIEW CONDITIONAL */}
      {activeTab === 'directorio' ? (
        <div className="space-y-6">
          {/* Dashboard Mini-Kpis */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#111622] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">TRABAJADORES REGISTRADOS</span>
                <span className="text-2xl font-bold text-slate-100 font-mono block mt-1">{trabajadores.length}</span>
              </div>
              <div className="h-10 w-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
                <Briefcase className="h-5 w-5 text-slate-400" />
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">PERSONAL ACTIVO</span>
                <span className="text-2xl font-bold text-emerald-400 font-mono block mt-1">{activeWorkers.length}</span>
              </div>
              <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                <UserCheck className="h-5 w-5 text-emerald-400" />
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">PERSONAL INACTIVO</span>
                <span className="text-2xl font-bold text-amber-500 font-mono block mt-1">{inactiveWorkers.length}</span>
              </div>
              <div className="h-10 w-10 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20">
                <UserX className="h-5 w-5 text-amber-500" />
              </div>
            </div>

            <div className="bg-[#111622] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">COSTO PLANILLA MENSUAL EST.</span>
                <span className="text-2xl font-bold text-blue-400 font-mono block mt-1">
                  S/ {activeWorkers.reduce((acc, t) => acc + (t.sueldoMensual || 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="h-10 w-10 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20">
                <DollarSign className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </div>

          {/* Search, Filter bar */}
          <div className="bg-[#111622] border border-slate-800 px-4 py-3 rounded-xl flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Buscar por nombre, apellidos, cargo, DNI..."
                className="block w-full pl-9 pr-3 py-2 bg-[#0C101A] border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-550 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <select
                className="py-1.5 px-3 bg-[#0C101A] border border-slate-800 rounded-lg text-xs font-semibold text-slate-300 outline-none"
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="ACTIVO">Activos únicamente</option>
                <option value="INACTIVO">Inactivos únicamente</option>
              </select>
            </div>
          </div>

          {/* Directory Core Grid */}
          {filteredWorkers.length === 0 ? (
            <div className="bg-[#111622] border border-slate-800 rounded-xl p-10 text-center">
              <Info className="mx-auto h-12 w-12 text-slate-500" />
              <h3 className="mt-2 text-sm font-semibold text-slate-300">No se encontraron trabajadores</h3>
              <p className="mt-1 text-xs text-slate-400">Intente modificando los filtros de búsqueda o regístrese un nuevo perfil.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWorkers.map(worker => {
                if (!worker) return null;
                return (
                <div 
                  key={worker.id}
                  className="bg-[#111622] border border-slate-800 rounded-xl p-5 hover:border-slate-750 transition-all duration-150 flex flex-col justify-between"
                >
                  <div>
                    {/* Worker Header Card */}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                          worker.estado === 'ACTIVO' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-550/10' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-550/10'
                        }`}>
                          {worker.estado || 'ACTIVO'}
                        </span>

                        <h3 className="text-base font-bold text-slate-100 mt-2">
                          {worker.apellidos || ''}, {worker.nombres || ''}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">DNI {worker.dni || ''}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">Sueldo Asignado</span>
                        <span className="text-sm font-bold text-teal-400 font-mono">S/ {(worker.sueldoMensual || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Quick Specs */}
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-800/60 pt-4 mt-4 text-xs">
                      <div>
                        <span className="text-slate-500 block">Cargo / Rol</span>
                        <span className="text-slate-200 font-medium">{worker.cargo || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Fecha Registro</span>
                        <span className="text-slate-200 font-medium font-mono">
                          {formatFecha(worker.fechaRegistro)}
                        </span>
                      </div>
                      {worker.telefono && (
                        <div>
                          <span className="text-slate-500 block">Celular</span>
                          <span className="text-slate-200 text-xs font-mono">{worker.telefono}</span>
                        </div>
                      )}
                      {worker.correo && (
                        <div className="truncate">
                          <span className="text-slate-500 block">Correo</span>
                          <span className="text-slate-200 text-xs truncate block" title={worker.correo}>{worker.correo}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operational Controls Footer */}
                  <div className="border-t border-slate-800/60 pt-4 mt-4 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleToggleState(worker)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded border transition-colors ${
                        worker.estado === 'ACTIVO'
                          ? 'border-amber-500/20 text-amber-500 hover:bg-amber-500/10'
                          : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                    >
                      {worker.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedWorker(worker)}
                        className="p-1 px-2.5 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        Ver Historial
                      </button>

                      <button
                        onClick={() => {
                          resetWorkerForm(worker);
                          setIsWorkerModalOpen(true);
                        }}
                        className="p-1 px-2.5 text-blue-400 hover:text-blue-300 border border-slate-800 hover:border-slate-700 rounded text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="h-3 w-3" />
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      ) : (
        /* REPORTS AND PAYROLL Tab */
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="bg-gradient-to-r from-emerald-950/20 to-slate-900 border border-slate-850 p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs text-emerald-400 font-semibold block uppercase tracking-wide">Inversión laboral consolidada</span>
              <h2 className="text-xl font-bold text-slate-100">Planilla Anual Histórica ({reportYear})</h2>
              <p className="text-slate-400 text-xs">Monitoreo consolidado de egresos mensuales en remuneraciones de planta.</p>
            </div>

            <div className="grid grid-cols-2 md:flex items-center gap-4 md:gap-8">
              <div className="bg-slate-900 border border-slate-800/80 px-4 py-2.5 rounded-lg text-right">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">NRO DE PAGOS</span>
                <span className="text-lg font-bold text-slate-100 font-mono">{filteredYearlyPayments.length}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800/80 px-4 py-2.5 rounded-lg text-right">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">COBERTURA TOTAL</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">S/ {totalYearlyWages.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Query, Filter and Reports Area */}
          <div className="bg-[#111622] border border-slate-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-semibold text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5 uppercase">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Parámetros de Búsqueda de Comprobantes & Reportes
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Filtrar por Mes Específico</label>
                <input
                  type="month"
                  className="w-full py-1.5 px-3 bg-[#0C101A] border border-slate-800 rounded-lg text-xs text-slate-200 outline-none"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                />
                {reportMonth && (
                  <button 
                    onClick={() => setReportMonth('')}
                    className="text-[10px] text-blue-400 mt-1 hover:underline block"
                  >
                    Ver todos los meses
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Filtrar por Trabajador</label>
                <select
                  className="w-full py-1.5 px-3 bg-[#0C101A] border border-slate-800 rounded-lg text-xs text-slate-200 outline-none"
                  value={reportWorkerId}
                  onChange={(e) => setReportWorkerId(e.target.value)}
                >
                  <option value="ALL">Todos los trabajadores</option>
                  {trabajadores.map(t => (
                    <option key={t.id} value={t.id}>{t.apellidos}, {t.nombres} ({t.estado})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Año para estadísticas anuales</label>
                <select
                  className="w-full py-1.5 px-3 bg-[#0C101A] border border-slate-800 rounded-lg text-xs text-slate-200 outline-none"
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                >
                  <option value="2026">Calendario 2026</option>
                  <option value="2027">Calendario 2027</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pay ledger results */}
          <div className="bg-[#111622] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
              <span className="text-xs font-semibold text-slate-350 uppercase">Planilla Histórica y Detallada ({filteredPayments.length} registros)</span>
            </div>

            {filteredPayments.length === 0 ? (
              <div className="p-10 text-center">
                <Info className="mx-auto h-11 w-11 text-slate-500" />
                <h4 className="text-slate-300 text-sm font-semibold mt-2">No se registran pagos para estos parámetros</h4>
                <p className="text-slate-400 text-xs mt-1">Proceda a registrar un pago desde el módulo de Finanzas utilizando la opción de "Pago de Sueldos".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800/80">
                  <thead className="bg-[#0C101A]">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Comprobante / Nro</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Trabajador</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Mes Remunerado</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Fecha Pago</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Registrado Por</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Monto</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 tracking-wider">Estado</th>
                      <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-400 tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#111622] divide-y divide-slate-800/40 text-xs text-slate-300">
                    {filteredPayments.map(payment => (
                      <tr key={payment.id} className="hover:bg-slate-800/20">
                        <td className="px-6 py-3.5 font-bold text-slate-200 whitespace-nowrap">{payment.comprobante}</td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <div className="font-semibold text-slate-100">{payment.trabajadorNombreCompleto}</div>
                          <div className="text-[10px] text-slate-500">DNI: {payment.trabajadorDni} | {payment.trabajadorCargo}</div>
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap font-medium text-slate-200">
                          {formatMes(payment.mesPagado)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-slate-400">
                          {new Date(payment.fechaPago).toLocaleString('es-PE')}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-slate-400">{payment.createdBy}</td>
                        <td className="px-6 py-3.5 whitespace-nowrap font-mono text-teal-400 font-semibold">
                          S/ {(payment.monto || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold">
                            CONFORME
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => generatePayrollReceiptPDF(payment)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded inline-flex items-center gap-1 transition-colors"
                            title="Descargar Comprobante PDF"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>Boleta</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WORKER REGISTRATION MODAL */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-[#07090E] bg-opacity-80 transition-opacity" aria-hidden="true" onClick={() => setIsWorkerModalOpen(false)}></div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative z-10 inline-block align-bottom bg-[#111622] rounded-xl border border-slate-800 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleWorkerSubmit}>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-blue-500" />
                      {editingWorkerId ? 'Editar Trabajador de Planta' : 'Registrar Trabajador de Planta'}
                    </h3>
                    <span className="text-[10px] text-slate-500">Formulario administrativo</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">Nombres <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Nombres del trabajador"
                        value={workerForm?.nombres || ''}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, nombres: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">Apellidos <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Apellidos del trabajador"
                        value={workerForm?.apellidos || ''}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, apellidos: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">DNI <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        maxLength={8}
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="8 dígitos"
                        value={workerForm?.dni || ''}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, dni: e.target.value.replace(/\D/g, '') }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">Sueldo Mensual (S/) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        required
                        min="0.10"
                        step="0.01"
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-emerald-400 font-bold outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ejemplo: 1200"
                        value={workerForm?.sueldoMensual === 0 ? '' : (workerForm?.sueldoMensual ?? '')}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, sueldoMensual: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400">Cargo o Puesto <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ej. Operario de Turbinas, Guardián, Electricista"
                      value={workerForm?.cargo || ''}
                      onChange={(e) => setWorkerForm(prev => ({ ...prev, cargo: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">Número de Celular</label>
                      <input
                        type="text"
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                        placeholder="Opcional"
                        value={workerForm?.telefono || ''}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, telefono: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400">Correo Electrónico</label>
                      <input
                        type="email"
                        className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Opcional"
                        value={workerForm?.correo || ''}
                        onChange={(e) => setWorkerForm(prev => ({ ...prev, correo: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400">Dirección</label>
                    <input
                      type="text"
                      className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Dirección del domicilio (Opcional)"
                      value={workerForm?.direccion || ''}
                      onChange={(e) => setWorkerForm(prev => ({ ...prev, direccion: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400">Observaciones</label>
                    <textarea
                      rows={2}
                      className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Añadir observaciones sobre el contrato, turnos, etc (Opcional)"
                      value={workerForm?.observaciones || ''}
                      onChange={(e) => setWorkerForm(prev => ({ ...prev, observaciones: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400">Estado Contractual</label>
                    <select
                      className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
                      value={workerForm?.estado || 'ACTIVO'}
                      onChange={(e: any) => setWorkerForm(prev => ({ ...prev, estado: e.target.value }))}
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="INACTIVO">INACTIVO</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-900/60 px-6 py-3 sm:flex sm:flex-row-reverse sm:gap-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white focus:outline-none sm:w-auto sm:text-xs"
                  >
                    Guardar Cambios
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWorkerModalOpen(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-lg border border-slate-800 shadow-sm px-4 py-2 bg-[#0C101A] hover:bg-slate-900 text-sm font-semibold text-slate-300 focus:outline-none sm:mt-0 sm:w-auto sm:text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* INDIVIDUAL WORKER HISTORY PROFILE MODAL */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-[#07090E] bg-opacity-80 transition-opacity" onClick={() => setSelectedWorker(null)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="relative z-10 inline-block align-bottom bg-[#111622] rounded-xl border border-slate-800 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      Boleta de Historial de Pagos
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedWorker.apellidos}, {selectedWorker.nombres} ({selectedWorker.cargo})
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedWorker(null)}
                    className="p-1 text-slate-450 hover:text-slate-200"
                  >
                    Cerrar (✕)
                  </button>
                </div>

                {/* Main mini report of individual worker */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-850 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">DNI</span>
                    <span className="text-slate-200 font-semibold">{selectedWorker.dni}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Sueldo</span>
                    <span className="text-emerald-400 font-bold">S/ {(selectedWorker.sueldoMensual || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Estado</span>
                    <span className={`font-semibold ${selectedWorker.estado === 'ACTIVO' ? 'text-emerald-400' : 'text-slate-450'}`}>
                      {selectedWorker.estado}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Pagos Emitidos</span>
                    <span className="text-blue-400 font-bold">
                      {pagosSueldos.filter(p => p.trabajadorId === selectedWorker.id).length} meses
                    </span>
                  </div>
                </div>

                {/* List payments for worker */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-350 block mb-2 uppercase tracking-wider">Historial de Remuneraciones</h4>

                  {pagosSueldos.filter(p => p.trabajadorId === selectedWorker.id).length === 0 ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-400">
                      No se han registrado pagos para este trabajador todavía.
                    </div>
                  ) : (
                    <div className="max-h-[220px] overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800 text-xs">
                      {pagosSueldos
                        .filter(p => p.trabajadorId === selectedWorker.id)
                        .map(p => (
                          <div key={p.id} className="p-3 bg-[#0C101A] hover:bg-slate-850 transition-colors flex items-center justify-between gap-4">
                            <div>
                              <div className="font-bold text-slate-200">{formatMes(p.mesPagado)}</div>
                              <div className="text-[10px] text-slate-550">
                                Emitido: {new Date(p.fechaPago).toLocaleString('es-PE')} | {p.comprobante}
                              </div>
                              {p.observaciones && (
                                <p className="text-[10.5px] text-slate-400 mt-1 italic">
                                  "{p.observaciones}"
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="font-mono text-teal-400 font-bold whitespace-nowrap">
                                S/ {(p.monto || 0).toFixed(2)}
                              </span>
                              <button
                                onClick={() => generatePayrollReceiptPDF(p)}
                                className="bg-slate-850 hover:bg-slate-750 border border-slate-800 hover:border-slate-700 p-1.5 rounded inline-flex items-center text-slate-200 transition-colors"
                              >
                                <Printer className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/60 px-6 py-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setSelectedWorker(null)}
                  className="rounded-lg border border-slate-800 shadow-sm px-4 py-2 bg-[#0C101A] hover:bg-slate-900 text-xs font-semibold text-slate-300 focus:outline-none"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
