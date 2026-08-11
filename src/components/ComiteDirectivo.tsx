import React, { useState, useMemo } from 'react';
import { 
  Shield, UserCheck, Calendar, Award, History, UserX, Zap, ZapOff, Check, 
  Trash, Plus, Search, AlertCircle, FileText, Download, Edit2, AlertTriangle, RefreshCw, Key, Users
} from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from './ui';
import { toast } from 'react-hot-toast';
import { useConfirm } from './ui/ConfirmDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import bcrypt from 'bcryptjs';

interface MemberFormState {
  clientId: string;
  supplyCodeExonerado: string;
}

// Custom Searchable Autocomplete select for members with assignment awareness
interface SocioSearchSelectProps {
  label: string;
  value: string;
  onChange: (clientId: string) => void;
  onSupplyChange: (supply: string) => void;
  supplyValue: string;
  socios: any[];
  getClientSupplies: (id: string) => string[];
  currentRole: string;
  getAssignmentError: (id: string, role: string) => string | null;
  icon: any;
}

function SocioSearchSelect({
  label,
  value,
  onChange,
  onSupplyChange,
  supplyValue,
  socios,
  getClientSupplies,
  currentRole,
  getAssignmentError,
  icon: Icon
}: SocioSearchSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedSocio = useMemo(() => {
    return socios.find(s => s.id === value);
  }, [socios, value]);

  const filteredSocios = useMemo(() => {
    if (!searchTerm.trim()) return socios;
    const term = searchTerm.toLowerCase();
    return socios.filter(s => {
      const nombres = s.nombres || '';
      const apellidos = s.apellidos || '';
      const dni = s.dni || '';
      const fullName = `${nombres} ${apellidos}`.toLowerCase();
      return (
        dni.includes(term) ||
        nombres.toLowerCase().includes(term) ||
        apellidos.toLowerCase().includes(term) ||
        fullName.includes(term)
      );
    });
  }, [socios, searchTerm]);

  return (
    <div className="space-y-2 p-4 bg-slate-900/40 rounded-xl border border-slate-800/80 hover:border-slate-700/60 transition-all relative">
      <div>
        <label className="block text-sm font-semibold text-slate-200 flex items-center mb-1">
          {Icon && <Icon className="w-4.5 h-4.5 mr-1.5 text-blue-400" />} {label}
        </label>
        
        <div className="relative">
          {/* Custom Select Trigger */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full bg-[#0B0E14] border border-slate-700 rounded-lg py-2.5 px-3.5 text-left text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex justify-between items-center text-sm"
          >
            {selectedSocio ? (
              <span className="truncate">
                {selectedSocio.nombres} {selectedSocio.apellidos} <span className="text-slate-400 font-mono text-xs">(DNI: {selectedSocio.dni})</span>
              </span>
            ) : (
              <span className="text-slate-400">Seleccionar Socio...</span>
            )}
            <span className="text-slate-500">▼</span>
          </button>

          {isOpen && (
            <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto p-2 space-y-2">
              <div className="relative sticky top-0 bg-slate-900 pb-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar DNI, nombres, apellidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                {filteredSocios.length > 0 ? (
                  filteredSocios.map(s => {
                    const assignError = getAssignmentError(s.id, currentRole);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!!assignError}
                        onClick={() => {
                          onChange(s.id);
                          setIsOpen(false);
                          setSearchTerm('');
                        }}
                        className={`w-full text-left py-2 px-3 rounded-md text-xs sm:text-sm flex justify-between items-center transition-all ${
                          value === s.id
                            ? 'bg-blue-600/20 text-blue-400 font-semibold'
                            : !!assignError
                            ? 'text-slate-500 cursor-not-allowed bg-slate-950/20'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">
                          {s.nombres} {s.apellidos} <span className="text-slate-400 font-mono text-xs">(DNI: {s.dni})</span>
                        </span>
                        {!!assignError && (
                          <span className="text-red-400/95 font-semibold text-[10px] bg-red-950/50 px-2 py-0.5 rounded border border-red-900/30">
                            Asignado: {assignError}
                          </span>
                        )}
                        {value === s.id && !assignError && (
                          <span className="text-blue-400">✓</span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-center py-2 text-xs text-slate-500">No se encontraron socios.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suministro selection */}
      {value && (
        <div className="pt-2 animate-fade-in">
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Suministro a Exonerar
          </label>
          <select
            required
            value={supplyValue}
            onChange={(e) => onSupplyChange(e.target.value)}
            className="w-full bg-[#0B0E14] border border-slate-700 rounded-lg py-2 px-3 text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 animate-fadeIn"
          >
            <option value="">-- Seleccionar Suministro --</option>
            {getClientSupplies(value).map(code => (
              <option key={code} value={code}>Suministro: {code}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function ComiteDirectivo() {
  const { 
    clients, comites, addCommittee, updateCommittee, deleteCommittee, 
    toggleCommitteeStatus, suppliesInfo, userRole, admins, updateAdmin 
  } = useAppContext();
  
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'vigente' | 'registrar' | 'historial' | 'reportes'>('vigente');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nombrePeriodo, setNombrePeriodo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [activo, setActivo] = useState(false);
  
  const [presidente, setPresidente] = useState<MemberFormState>({ clientId: '', supplyCodeExonerado: '' });
  const [secretario, setSecretario] = useState<MemberFormState>({ clientId: '', supplyCodeExonerado: '' });
  const [tesorero, setTesorero] = useState<MemberFormState>({ clientId: '', supplyCodeExonerado: '' });
  const [fiscalizador, setFiscalizador] = useState<MemberFormState>({ clientId: '', supplyCodeExonerado: '' });
  const [vocal, setVocal] = useState<MemberFormState>({ clientId: '', supplyCodeExonerado: '' });

  // Get eligible partners (Socios Only)
  const sociosHabilitados = useMemo(() => {
    return clients.filter(client => {
      const isSocioCategory = client.tipo === 'SOCIO';
      const ownsSocioSupply = (client.suministros || (client.codigoSuministro ? [client.codigoSuministro] : [])).some(code => {
        const info = suppliesInfo.find(s => s.codigo === code);
        return info?.isSocio === true;
      });
      return (isSocioCategory || ownsSocioSupply) && client.estado === 'ACTIVO';
    });
  }, [clients, suppliesInfo]);

  // Find active committee
  const comiteVigente = useMemo(() => {
    return comites?.find(c => c.activo) || null;
  }, [comites]);

  // Get client's supplies
  const getClientSupplies = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return [];
    return client.suministros || (client.codigoSuministro ? [client.codigoSuministro] : []);
  };

  const getAdminUsernameByDni = (dni: string) => {
    const a = admins.find(adm => adm.dni === dni);
    return a ? a.username : null;
  };

  const getAdminUsername = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return '---';
    const username = getAdminUsernameByDni(client.dni);
    return username ? `@${username}` : 'Por generar';
  };

  const resetForm = () => {
    setEditingId(null);
    setNombrePeriodo('');
    setFechaInicio('');
    setFechaFin('');
    setActivo(false);
    setPresidente({ clientId: '', supplyCodeExonerado: '' });
    setSecretario({ clientId: '', supplyCodeExonerado: '' });
    setTesorero({ clientId: '', supplyCodeExonerado: '' });
    setFiscalizador({ clientId: '', supplyCodeExonerado: '' });
    setVocal({ clientId: '', supplyCodeExonerado: '' });
  };

  const handleEdit = (comite: any) => {
    setEditingId(comite.id);
    setNombrePeriodo(comite.nombrePeriodo);
    setFechaInicio(comite.fechaInicio);
    setFechaFin(comite.fechaFin);
    setActivo(comite.activo);
    setPresidente({ clientId: comite.presidente.clientId, supplyCodeExonerado: comite.presidente.supplyCodeExonerado || '' });
    setSecretario({ clientId: comite.secretario.clientId, supplyCodeExonerado: comite.secretario.supplyCodeExonerado || '' });
    setTesorero({ clientId: comite.tesorero.clientId, supplyCodeExonerado: comite.tesorero.supplyCodeExonerado || '' });
    setFiscalizador({ clientId: comite.fiscalizador.clientId, supplyCodeExonerado: comite.fiscalizador.supplyCodeExonerado || '' });
    setVocal({ clientId: comite.vocal?.clientId || '', supplyCodeExonerado: comite.vocal?.supplyCodeExonerado || '' });
    setActiveTab('registrar');
  };

  const handleToggleActive = async (id: string, name: string) => {
    const comite = comites.find(c => c.id === id);
    if (!comite) return;

    const willBeActive = !comite.activo;
    const isConfirmed = await confirm({
      title: willBeActive ? 'Activar Comité Directivo' : 'Desactivar Comité',
      message: willBeActive 
        ? `¿Está seguro de activar el comité "${name}"?\nEsto otorgará automáticamente permisos y revocará los accesos del anterior comité.` 
        : `¿Está seguro de desactivar el comité "${name}"?\nEsto suspenderá las exoneraciones y desactivará las cuentas de acceso de sus miembros.`,
      type: willBeActive ? 'confirm' : 'warning',
      confirmLabel: willBeActive ? 'Activar' : 'Desactivar'
    });

    if (!isConfirmed) return;

    try {
      await toggleCommitteeStatus(id);
      toast.success(willBeActive ? 'Comité activado y permisos sincronizados.' : 'Comité desactivado correctamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al modificar estado del comité.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const isConfirmed = await confirm({
      title: 'Eliminar Comité',
      message: `¿Está seguro de eliminar permanentemente el registro del comité "${name}"?\nEsta acción no se puede deshacer.`,
      type: 'danger',
      confirmLabel: 'Eliminar'
    });

    if (!isConfirmed) return;

    try {
      await deleteCommittee(id);
      toast.success('Comité eliminado correctamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el comité.');
    }
  };

  const handleResetPassword = async (memberDni: string, fullName: string) => {
    const admin = admins.find(a => a.dni === memberDni);
    if (!admin) {
      toast.error(`No existe un usuario del sistema creado para ${fullName}. Registre una nueva elección con estado Activo para generar su usuario automáticamente.`);
      return;
    }

    const isConfirmed = await confirm({
      title: 'Restablecer Contraseña',
      message: `¿Está seguro de restablecer el acceso para ${fullName}?\n\nLa contraseña se restaurará a la contraseña temporal "Comite2026#" y se le solicitará cambiarla obligatoriamente en el primer inicio de sesión.`,
      type: 'warning',
      confirmLabel: 'Restablecer'
    });

    if (!isConfirmed) return;

    try {
      const hashedPassword = bcrypt.hashSync('Comite2026#', 10);
      await updateAdmin(admin.id, {
        password: hashedPassword,
        mustChangePassword: true,
        estado: 'ACTIVO'
      });
      toast.success(`La contraseña de ${fullName} se restableció con éxito a: Comite2026#`);
    } catch (err: any) {
      toast.error(err.message || 'Error al restablecer la contraseña.');
    }
  };

  const getAssignmentError = (clientId: string, excludeRole: string) => {
    if (!clientId) return null;
    if (presidente.clientId === clientId && excludeRole !== 'presidente') return 'PRESIDENTE';
    if (secretario.clientId === clientId && excludeRole !== 'secretario') return 'SECRETARIO';
    if (tesorero.clientId === clientId && excludeRole !== 'tesorero') return 'TESORERO';
    if (fiscalizador.clientId === clientId && excludeRole !== 'fiscalizador') return 'FISCALIZADOR';
    if (vocal.clientId === clientId && excludeRole !== 'vocal') return 'VOCAL';
    return null;
  };

  const validateForm = () => {
    if (!nombrePeriodo.trim()) {
      toast.error('Debe ingresar un nombre o descripción para el periodo.');
      return false;
    }
    if (!fechaInicio || !fechaFin) {
      toast.error('Debe seleccionar las fechas de inicio y fin.');
      return false;
    }
    if (new Date(fechaInicio) >= new Date(fechaFin)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha de finalización.');
      return false;
    }

    const roles = { presidente, secretario, tesorero, fiscalizador, vocal };
    const selectedIds = [
      presidente.clientId, 
      secretario.clientId, 
      tesorero.clientId, 
      fiscalizador.clientId,
      vocal.clientId
    ].filter(Boolean);
    
    // Check if any role is empty
    if (!presidente.clientId || !secretario.clientId || !tesorero.clientId || !fiscalizador.clientId || !vocal.clientId) {
      toast.error('Todos los cargos del comité deben tener un socio asignado.');
      return false;
    }

    // Check unique members in same period
    const uniqueIds = new Set(selectedIds);
    if (uniqueIds.size !== 5) {
      toast.error('No se pueden asignar múltiples cargos a la misma persona en un mismo período.');
      return false;
    }

    // Ensure supply designation
    for (const [key, value] of Object.entries(roles)) {
      const clientSupplies = getClientSupplies(value.clientId);
      if (clientSupplies.length > 0 && !value.supplyCodeExonerado) {
        toast.error(`Debe seleccionar el suministro a exonerar para el cargo de ${key.toUpperCase()}.`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'OPERATOR' || userRole === 'FISCALIZADOR') {
      toast.error('No tiene permisos para modificar el comité directivo.');
      return;
    }

    if (!validateForm()) return;

    const buildMemberObj = (roleForm: MemberFormState) => {
      const client = clients.find(c => c.id === roleForm.clientId);
      return {
        clientId: roleForm.clientId,
        nombreCompleto: client ? `${client.nombres} ${client.apellidos}` : '',
        supplyCodeExonerado: roleForm.supplyCodeExonerado
      };
    };

    const payload = {
      nombrePeriodo: nombrePeriodo.trim(),
      fechaInicio,
      fechaFin,
      presidente: buildMemberObj(presidente),
      secretario: buildMemberObj(secretario),
      tesorero: buildMemberObj(tesorero),
      fiscalizador: buildMemberObj(fiscalizador),
      vocal: buildMemberObj(vocal),
      activo
    };

    try {
      if (editingId) {
        await updateCommittee(editingId, payload);
        toast.success('Comité directivo actualizado correctamente.');
      } else {
        await addCommittee(payload);
        toast.success('Nuevo comité directivo guardado correctamente. Los accesos del sistema se han sincronizado.');
      }
      resetForm();
      setActiveTab('vigente');
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar comité directivo.');
    }
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(15, 23, 42); 
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('REPORTE OFICIAL - COMITÉ DIRECTIVO DE LA CENTRAL', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Mini Central Hidroeléctrica Paccha', 105, 24, { align: 'center' });

    let yOffset = 40;

    // Active block
    if (comiteVigente) {
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.text(`Comité Directivo Vigente: ${comiteVigente.nombrePeriodo}`, 14, yOffset);
      doc.setFontSize(10);
      doc.text(`Vigencia: Desde ${comiteVigente.fechaInicio} hasta ${comiteVigente.fechaFin}`, 14, yOffset + 6);
      
      const tableData = [
        ['PRESIDENTE', comiteVigente.presidente.nombreCompleto, comiteVigente.presidente.supplyCodeExonerado || 'Ninguno', 'Acceso Total (ADMIN)'],
        ['SECRETARIO', comiteVigente.secretario.nombreCompleto, comiteVigente.secretario.supplyCodeExonerado || 'Ninguno', 'Control Reuniones (SECRETARIO)'],
        ['TESORERO', comiteVigente.tesorero.nombreCompleto, comiteVigente.tesorero.supplyCodeExonerado || 'Ninguno', 'Cobros & Finanzas (TESORERO)'],
        ['FISCALIZADOR', comiteVigente.fiscalizador.nombreCompleto, comiteVigente.fiscalizador.supplyCodeExonerado || 'Ninguno', 'Solo Consulta (FISCALIZADOR)']
      ];

      if (comiteVigente.vocal) {
        tableData.push(['VOCAL', comiteVigente.vocal.nombreCompleto, comiteVigente.vocal.supplyCodeExonerado || 'Ninguno', 'Acceso Reducido (VOCAL)']);
      }

      autoTable(doc, {
        startY: yOffset + 12,
        head: [['CARGO', 'NOMBRE COMPLETO', 'SUMINISTRO EXONERADO', 'ROL ASIGNADO']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9 }
      });
      
      yOffset = (doc as any).lastAutoTable.finalY + 15;
    } else {
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(12);
      doc.text('NO HAY COMITÉ DIRECTIVO ACTUALMENTE ACTIVO EN EL SISTEMA', 14, yOffset);
      yOffset += 15;
    }

    // Historical list
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text('Historial de Gestión de Comités Directivos', 14, yOffset);
    
    const historyRows = (comites || []).map(c => [
      c.nombrePeriodo,
      `${c.fechaInicio} a ${c.fechaFin}`,
      c.presidente.nombreCompleto,
      c.secretario.nombreCompleto,
      c.tesorero.nombreCompleto,
      c.fiscalizador.nombreCompleto,
      c.vocal?.nombreCompleto || 'Ninguno',
      c.activo ? 'ACTIVO' : 'INACTIVO'
    ]);

    autoTable(doc, {
      startY: yOffset + 6,
      head: [['Gestión', 'Periodo', 'Presidente', 'Secretario', 'Tesorero', 'Fiscalizador', 'Vocal', 'Estado']],
      body: historyRows,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105] },
      styles: { fontSize: 8 }
    });

    // Signature/Date stamps
    const finalY = (doc as any).lastAutoTable.finalY + 25;
    doc.setFontSize(9);
    doc.text('________________________________', 105, finalY, { align: 'center' });
    doc.text('Firma Certificada', 105, finalY + 5, { align: 'center' });
    doc.text(`Fecha de Impresión: ${new Date().toLocaleDateString()} - Sistema MiniHydro Paccha ERP`, 105, finalY + 12, { align: 'center' });

    doc.save(`Reporte_Comite_Directivo_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('Reporte PDF descargado con éxito.');
  };

  const selectedSocioIds = useMemo(() => {
    return [
      presidente.clientId,
      secretario.clientId,
      tesorero.clientId,
      fiscalizador.clientId,
      vocal.clientId
    ].filter(Boolean);
  }, [presidente.clientId, secretario.clientId, tesorero.clientId, fiscalizador.clientId, vocal.clientId]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation header */}
      <div className="bg-slate-800/20 p-1 rounded-lg border border-slate-700/50 flex space-x-1">
        <button 
          onClick={() => setActiveTab('vigente')}
          className={`flex-1 py-2 px-3 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center justify-center ${
            activeTab === 'vigente' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Award className="w-4 h-4 mr-1.5" />
          Comité Vigente
        </button>
        <button 
          onClick={() => setActiveTab('registrar')}
          className={`flex-1 py-2 px-3 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center justify-center ${
            activeTab === 'registrar' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {editingId ? 'Editar Comité' : 'Nueva Elección'}
        </button>
        <button 
          onClick={() => setActiveTab('historial')}
          className={`flex-1 py-2 px-3 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center justify-center ${
            activeTab === 'historial' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <History className="w-4 h-4 mr-1.5" />
          Historial
        </button>
        <button 
          onClick={() => setActiveTab('reportes')}
          className={`flex-1 py-2 px-3 text-xs md:text-sm font-medium rounded-md transition-colors flex items-center justify-center ${
            activeTab === 'reportes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FileText className="w-4 h-4 mr-1.5" />
          Reportes & Exoneraciones
        </button>
      </div>

      {/* 1. COMITÉ DIRECTIVO VIGENTE */}
      {activeTab === 'vigente' && (
        <div className="space-y-6">
          {comiteVigente ? (
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-gradient-to-r from-blue-900/40 to-slate-950 p-6 rounded-2xl border border-blue-500/30 shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
                  <div>
                    <span className="bg-blue-500/20 text-blue-400 text-xs px-3 py-1 rounded-full border border-blue-500/30 font-semibold uppercase tracking-wider">
                      Gestión Activa Vigente
                    </span>
                    <h3 className="text-2xl font-bold text-white mt-2 leading-tight">
                      {comiteVigente.nombrePeriodo}
                    </h3>
                    <p className="text-slate-400 text-xs md:text-sm mt-1 flex items-center">
                      <Calendar className="w-4 h-4 mr-1 text-slate-500" />
                      Desde: <span className="text-slate-200 font-medium mx-1">{comiteVigente.fechaInicio}</span> hasta: <span className="text-slate-200 font-medium ml-1">{comiteVigente.fechaFin}</span>
                    </p>
                  </div>
                  {(userRole === 'ADMIN' || userRole === 'CLIENT') && (
                    <Button variant="outline" size="sm" onClick={() => handleEdit(comiteVigente)} className="text-blue-400 hover:bg-blue-500/10 border-blue-500/20 bg-slate-900/40">
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar Comité Vigente
                    </Button>
                  )}
                </div>
              </div>

              {/* Members Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Presidente */}
                <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-blue-400">
                        <Shield className="w-6 h-6" />
                      </div>
                      <Badge variant="success">PRESIDENTE</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-100 mt-4 truncate">
                      {comiteVigente.presidente.nombreCompleto}
                    </h4>
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2 text-xs text-slate-400">
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Acceso del Sistema:</span>
                        <strong className="text-slate-200 font-medium">ADMIN (Control Total)</strong>
                      </p>
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Usuario ERP:</span>
                        <strong className="text-blue-400 font-mono">{getAdminUsername(comiteVigente.presidente.clientId)}</strong>
                      </p>
                      <p className="flex justify-between items-center bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <span className="flex items-center text-emerald-400 font-medium">
                          <Zap className="w-3 h-3 mr-1 text-emerald-500" /> Suministro Exonerado:
                        </span>
                        <strong className="text-slate-100 font-mono tracking-wider">{comiteVigente.presidente.supplyCodeExonerado || 'No Asignado'}</strong>
                      </p>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="pt-4 border-t border-slate-800/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const client = clients.find(c => c.id === comiteVigente.presidente.clientId);
                          if (client) handleResetPassword(client.dni, comiteVigente.presidente.nombreCompleto);
                        }}
                        className="text-[11px] text-blue-450 hover:text-blue-300 font-semibold flex items-center bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded transition-all"
                      >
                        <Key className="w-3.5 h-3.5 mr-1" /> Restablecer Contraseña
                      </button>
                    </div>
                  )}
                </div>

                {/* Secretario */}
                <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 text-indigo-400">
                        <FileText className="w-6 h-6" />
                      </div>
                      <Badge variant="info">SECRETARIO</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-100 mt-4 truncate">
                      {comiteVigente.secretario.nombreCompleto}
                    </h4>
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2 text-xs text-slate-400">
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Acceso del Sistema:</span>
                        <strong className="text-slate-200 font-medium">SECRETARIO (Reuniones)</strong>
                      </p>
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Usuario ERP:</span>
                        <strong className="text-blue-400 font-mono">{getAdminUsername(comiteVigente.secretario.clientId)}</strong>
                      </p>
                      <p className="flex justify-between items-center bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <span className="flex items-center text-emerald-400 font-medium">
                          <Zap className="w-3 h-3 mr-1 text-emerald-500" /> Suministro Exonerado:
                        </span>
                        <strong className="text-slate-100 font-mono tracking-wider">{comiteVigente.secretario.supplyCodeExonerado || 'No Asignado'}</strong>
                      </p>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="pt-4 border-t border-slate-800/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const client = clients.find(c => c.id === comiteVigente.secretario.clientId);
                          if (client) handleResetPassword(client.dni, comiteVigente.secretario.nombreCompleto);
                        }}
                        className="text-[11px] text-blue-450 hover:text-blue-300 font-semibold flex items-center bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded transition-all"
                      >
                        <Key className="w-3.5 h-3.5 mr-1" /> Restablecer Contraseña
                      </button>
                    </div>
                  )}
                </div>

                {/* Tesorero */}
                <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-amber-400">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <Badge variant="warning">TESORERO</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-100 mt-4 truncate">
                      {comiteVigente.tesorero.nombreCompleto}
                    </h4>
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2 text-xs text-slate-400">
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Acceso del Sistema:</span>
                        <strong className="text-slate-200 font-medium">TESORERO (Finanzas)</strong>
                      </p>
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Usuario ERP:</span>
                        <strong className="text-blue-400 font-mono">{getAdminUsername(comiteVigente.tesorero.clientId)}</strong>
                      </p>
                      <p className="flex justify-between items-center bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <span className="flex items-center text-emerald-400 font-medium">
                          <Zap className="w-3 h-3 mr-1 text-emerald-500" /> Suministro Exonerado:
                        </span>
                        <strong className="text-slate-100 font-mono tracking-wider">{comiteVigente.tesorero.supplyCodeExonerado || 'No Asignado'}</strong>
                      </p>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="pt-4 border-t border-slate-800/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const client = clients.find(c => c.id === comiteVigente.tesorero.clientId);
                          if (client) handleResetPassword(client.dni, comiteVigente.tesorero.nombreCompleto);
                        }}
                        className="text-[11px] text-blue-450 hover:text-blue-300 font-semibold flex items-center bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded transition-all"
                      >
                        <Key className="w-3.5 h-3.5 mr-1" /> Restablecer Contraseña
                      </button>
                    </div>
                  )}
                </div>

                {/* Fiscalizador */}
                <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20 text-purple-400">
                        <RefreshCw className="w-6 h-6" />
                      </div>
                      <Badge variant="default">FISCALIZADOR</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-100 mt-4 truncate">
                      {comiteVigente.fiscalizador.nombreCompleto}
                    </h4>
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2 text-xs text-slate-400">
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Acceso del Sistema:</span>
                        <strong className="text-slate-200 font-medium">FISCALIZADOR (Solo Consulta)</strong>
                      </p>
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Usuario ERP:</span>
                        <strong className="text-blue-400 font-mono">{getAdminUsername(comiteVigente.fiscalizador.clientId)}</strong>
                      </p>
                      <p className="flex justify-between items-center bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <span className="flex items-center text-emerald-400 font-medium">
                          <Zap className="w-3 h-3 mr-1 text-emerald-500" /> Suministro Exonerado:
                        </span>
                        <strong className="text-slate-100 font-mono tracking-wider">{comiteVigente.fiscalizador.supplyCodeExonerado || 'No Asignado'}</strong>
                      </p>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && (
                    <div className="pt-4 border-t border-slate-800/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const client = clients.find(c => c.id === comiteVigente.fiscalizador.clientId);
                          if (client) handleResetPassword(client.dni, comiteVigente.fiscalizador.nombreCompleto);
                        }}
                        className="text-[11px] text-blue-450 hover:text-blue-300 font-semibold flex items-center bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded transition-all"
                      >
                        <Key className="w-3.5 h-3.5 mr-1" /> Restablecer Contraseña
                      </button>
                    </div>
                  )}
                </div>

                {/* Vocal */}
                <div className="bg-slate-800/20 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="bg-teal-500/10 p-3 rounded-xl border border-teal-500/20 text-teal-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <Badge variant="info" className="bg-teal-500/10 text-teal-400 border border-teal-500/20">VOCAL</Badge>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-100 mt-4 truncate font-semibold">
                      {comiteVigente.vocal?.nombreCompleto || 'No Asignado'}
                    </h4>
                    <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-2 text-xs text-slate-400">
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Acceso del Sistema:</span>
                        <strong className="text-slate-200 font-medium">VOCAL (Acceso Consulta)</strong>
                      </p>
                      <p className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                        <span>Usuario ERP:</span>
                        <strong className="text-blue-400 font-mono">
                          {comiteVigente.vocal?.clientId ? getAdminUsername(comiteVigente.vocal.clientId) : '---'}
                        </strong>
                      </p>
                      <p className="flex justify-between items-center bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <span className="flex items-center text-emerald-400 font-medium">
                          <Zap className="w-3 h-3 mr-1 text-emerald-500" /> Suministro Exonerado:
                        </span>
                        <strong className="text-slate-100 font-mono tracking-wider">{comiteVigente.vocal?.supplyCodeExonerado || 'No Asignado'}</strong>
                      </p>
                    </div>
                  </div>
                  {userRole === 'ADMIN' && comiteVigente.vocal?.clientId && (
                    <div className="pt-4 border-t border-slate-800/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const client = clients.find(c => c.id === comiteVigente.vocal!.clientId);
                          if (client) handleResetPassword(client.dni, comiteVigente.vocal!.nombreCompleto);
                        }}
                        className="text-[11px] text-blue-450 hover:text-blue-300 font-semibold flex items-center bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1.5 rounded transition-all"
                      >
                        <Key className="w-3.5 h-3.5 mr-1" /> Restablecer Contraseña
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-slate-800/20 border border-slate-700/50 rounded-2xl p-12 text-center max-w-lg mx-auto">
              <Award className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100">Sin Comité Directivo Activo</h3>
              <p className="text-slate-400 text-sm mt-2">
                No hay ningún comité vigente en funciones. Ingrese a la pestaña "Nueva Elección" para designar un nuevo Comité Directivo y habilitar las facultades correspondientes del sistema.
              </p>
              {userRole === 'ADMIN' && (
                <Button onClick={() => setActiveTab('registrar')} className="mt-6 font-semibold" size="sm">
                  <Plus className="w-4 h-4 mr-1.5" /> Registrar Elección
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. REGISTRAR / EDITAR ELECCION FORM */}
      {activeTab === 'registrar' && (
        <Card className="border-slate-800/60 bg-slate-950/20 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-100 flex items-center">
              <Plus className="text-blue-500 mr-2" />
              {editingId ? 'Editar Periodo del Comité Directivo' : 'Registrar Nueva Elección de Comité Directivo'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Period Fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-4 bg-slate-900/10 rounded-xl border border-slate-800/60">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Nombre de la Gestión o Periodo</label>
                  <input
                    type="text"
                    required
                    value={nombrePeriodo}
                    onChange={(e) => setNombrePeriodo(e.target.value)}
                    className="mt-1 block w-full bg-[#0B0E14] border border-slate-750 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-100 sm:text-sm"
                    placeholder="Ej. Junta Directiva General Paccha 2026-2027"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Inicio de Gestión</label>
                  <input
                    type="date"
                    required
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="mt-1 block w-full bg-[#0B0E14] border border-slate-750 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-100 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Finalización de Gestión</label>
                  <input
                    type="date"
                    required
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="mt-1 block w-full bg-[#0B0E14] border border-slate-750 rounded-lg py-2 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-100 sm:text-sm"
                  />
                </div>
                <div className="md:col-span-4 flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <div className="text-slate-400 text-xs max-w-md">
                    Al activar el comité vigente, se suspenderán los permisos especiales del comité previo y se habilitarán los nuevos.
                  </div>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="h-4.5 w-4.5 text-blue-600 focus:ring-blue-500 border-slate-650 bg-slate-900 rounded"
                    />
                    <span className="text-sm font-semibold text-slate-200">Activar y sincronizar credenciales de inmediato</span>
                  </label>
                </div>
              </div>

              {/* Roles Designation Block */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <Award className="w-4.5 h-4.5 text-blue-500 mr-2" />
                  Designación de Miembros y Asignación de Suministros
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* President */}
                  <SocioSearchSelect
                    label="Presidente (Rol ADMIN)"
                    value={presidente.clientId}
                    onChange={(clientId) => setPresidente({ clientId, supplyCodeExonerado: '' })}
                    onSupplyChange={(supplyCodeExonerado) => setPresidente(prev => ({ ...prev, supplyCodeExonerado }))}
                    supplyValue={presidente.supplyCodeExonerado}
                    socios={sociosHabilitados}
                    getClientSupplies={getClientSupplies}
                    currentRole="presidente"
                    getAssignmentError={getAssignmentError}
                    icon={Shield}
                  />

                  {/* Secretary */}
                  <SocioSearchSelect
                    label="Secretario (Rol SECRETARIO)"
                    value={secretario.clientId}
                    onChange={(clientId) => setSecretario({ clientId, supplyCodeExonerado: '' })}
                    onSupplyChange={(supplyCodeExonerado) => setSecretario(prev => ({ ...prev, supplyCodeExonerado }))}
                    supplyValue={secretario.supplyCodeExonerado}
                    socios={sociosHabilitados}
                    getClientSupplies={getClientSupplies}
                    currentRole="secretario"
                    getAssignmentError={getAssignmentError}
                    icon={FileText}
                  />

                  {/* Treasurer */}
                  <SocioSearchSelect
                    label="Tesorero (Rol TESORERO)"
                    value={tesorero.clientId}
                    onChange={(clientId) => setTesorero({ clientId, supplyCodeExonerado: '' })}
                    onSupplyChange={(supplyCodeExonerado) => setTesorero(prev => ({ ...prev, supplyCodeExonerado }))}
                    supplyValue={tesorero.supplyCodeExonerado}
                    socios={sociosHabilitados}
                    getClientSupplies={getClientSupplies}
                    currentRole="tesorero"
                    getAssignmentError={getAssignmentError}
                    icon={UserCheck}
                  />

                  {/* Auditor */}
                  <SocioSearchSelect
                    label="Fiscalizador (Rol FISCALIZADOR)"
                    value={fiscalizador.clientId}
                    onChange={(clientId) => setFiscalizador({ clientId, supplyCodeExonerado: '' })}
                    onSupplyChange={(supplyCodeExonerado) => setFiscalizador(prev => ({ ...prev, supplyCodeExonerado }))}
                    supplyValue={fiscalizador.supplyCodeExonerado}
                    socios={sociosHabilitados}
                    getClientSupplies={getClientSupplies}
                    currentRole="fiscalizador"
                    getAssignmentError={getAssignmentError}
                    icon={RefreshCw}
                  />

                  {/* Vocal */}
                  <SocioSearchSelect
                    label="Vocal (Rol VOCAL)"
                    value={vocal.clientId}
                    onChange={(clientId) => setVocal({ clientId, supplyCodeExonerado: '' })}
                    onSupplyChange={(supplyCodeExonerado) => setVocal(prev => ({ ...prev, supplyCodeExonerado }))}
                    supplyValue={vocal.supplyCodeExonerado}
                    socios={sociosHabilitados}
                    getClientSupplies={getClientSupplies}
                    currentRole="vocal"
                    getAssignmentError={getAssignmentError}
                    icon={Users}
                  />
                </div>
              </div>

              {/* Dynamic Accounts Summary Preview Panel */}
              {selectedSocioIds.length > 0 && (
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-4 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-400 flex items-center uppercase tracking-wider">
                    <UserCheck className="w-4 h-4 text-emerald-400 mr-2" />
                    Vista Previa De Accesos Al Sistema
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {['presidente', 'secretario', 'tesorero', 'fiscalizador', 'vocal'].map(role => {
                      const roleData = role === 'presidente' ? presidente : role === 'secretario' ? secretario : role === 'tesorero' ? tesorero : role === 'fiscalizador' ? fiscalizador : vocal;
                      if (!roleData.clientId) return null;
                      const client = clients.find(c => c.id === roleData.clientId);
                      if (!client) return null;
                      
                      const existingAdmin = admins.find(a => a.dni === client.dni);
                      const mappedRole = role === 'presidente' ? 'ADMIN' : role === 'secretario' ? 'SECRETARIO' : role === 'tesorero' ? 'TESORERO' : role === 'fiscalizador' ? 'FISCALIZADOR' : 'VOCAL';
                      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
                      const generatedUser = `${(client.nombres.charAt(0) + (client.apellidos.split(' ')[0] || '')).toLowerCase().replace(/[^a-z0-9]/g, '')}${client.dni.slice(-2)}`;
                      
                      return (
                        <div key={role} className="bg-[#0B0E14] p-3 rounded-xl border border-slate-800 flex flex-col justify-between space-y-2">
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">{roleLabel}</span>
                              {existingAdmin ? (
                                <Badge variant="success" className="text-[9px] px-1.5 py-0">Existente</Badge>
                              ) : (
                                <Badge variant="warning" className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-400">Crear Acceso</Badge>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-100 mt-1 truncate">{client.nombres} {client.apellidos}</p>
                          </div>
                          
                          <div className="text-[10px] pt-2 border-t border-slate-800/80 space-y-1">
                            <p className="flex justify-between text-slate-400">
                              <span>Usuario:</span>
                              <span className="font-semibold font-mono text-slate-200">
                                {existingAdmin ? `@${existingAdmin.username}` : `@${generatedUser}`}
                              </span>
                            </p>
                            <p className="flex justify-between text-slate-400">
                              <span>Rol ERP:</span>
                              <span className="font-semibold text-slate-200">{mappedRole}</span>
                            </p>
                            {!existingAdmin && (
                              <p className="flex justify-between text-slate-400">
                                <span>Clave temporal:</span>
                                <span className="font-semibold text-amber-400 bg-amber-500/10 px-1 rounded font-mono">Comite2026#</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alert policy */}
              <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg flex space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <p className="text-xs text-blue-300 leading-normal">
                  <strong>Sincronización Automática e Historial:</strong> Guardar un comité directivo creará de forma inmediata las credenciales de acceso para aquellos miembros que aún no cuenten con usuario. Si ya poseen una cuenta, el sistema los vinculará automáticamente a su rol correspondiente respetando su contraseña actual. En el caso de cuentas nuevas, se les asignará la clave temporal <strong>Comite2026#</strong> y se les obligará el cambio de clave en su primer inicio de sesión. Las exoneraciones de cobro de luz (S/ 0 de consumo mensual) se aplicarán dentro del periodo de vigencia seleccionado.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <Button type="button" variant="cancel" onClick={() => { resetForm(); setActiveTab('vigente'); }}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  {editingId ? 'Actualizar Comité' : 'Guardar Comité Directivo'}
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>
      )}

      {/* 3. HISTORIAL */}
      {activeTab === 'historial' && (
        <Card className="border-slate-800/65 bg-slate-950/20 shadow-xl">
          <CardHeader className="flex justify-between items-center sm:flex-row flex-col space-y-2 sm:space-y-0">
            <CardTitle className="text-lg font-bold">Histórico de Comités Directivos</CardTitle>
            <div className="relative w-full max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </span>
              <input
                type="text"
                placeholder="Buscar comités..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 bg-[#0B0E14] border border-slate-705 rounded-md text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </CardHeader>
          <CardContent>
            {comites && comites.length > 0 ? (
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Gestión / Período</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Vigencia</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Dirigentes Designados</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Suministros Exonerados</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/20">
                    {comites
                      .filter(com => com.nombrePeriodo.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((com) => (
                        <tr key={com.id} className="hover:bg-slate-900/40">
                          <td className="px-4 py-4 text-sm font-semibold text-slate-150">
                            {com.nombrePeriodo}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-400 whitespace-nowrap">
                            Del {com.fechaInicio}<br />al {com.fechaFin}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-300 max-w-xs">
                            <div className="space-y-1">
                              <p>👑 <span className="font-semibold text-slate-200">Pres:</span> {com.presidente.nombreCompleto}</p>
                              <p>✍️ <span className="font-semibold text-slate-200">Sec:</span> {com.secretario.nombreCompleto}</p>
                              <p>💰 <span className="font-semibold text-slate-200">Tes:</span> {com.tesorero.nombreCompleto}</p>
                              <p>🔍 <span className="font-semibold text-slate-200">Fisc:</span> {com.fiscalizador.nombreCompleto}</p>
                              {com.vocal && <p>👥 <span className="font-semibold text-slate-200">Voc:</span> {com.vocal.nombreCompleto}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-400 font-mono">
                            <div className="space-y-1">
                              <p>P: {com.presidente.supplyCodeExonerado || '---'}</p>
                              <p>S: {com.secretario.supplyCodeExonerado || '---'}</p>
                              <p>T: {com.tesorero.supplyCodeExonerado || '---'}</p>
                              <p>F: {com.fiscalizador.supplyCodeExonerado || '---'}</p>
                              {com.vocal && <p>V: {com.vocal.supplyCodeExonerado || '---'}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs whitespace-nowrap">
                            <Badge variant={com.activo ? 'success' : 'default'}>
                              {com.activo ? 'ACTIVO VIGENTE' : 'FINALIZADO'}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-right text-xs whitespace-nowrap">
                            <div className="flex justify-end space-x-2">
                              {userRole === 'ADMIN' && (
                                <>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleToggleActive(com.id, com.nombrePeriodo)} 
                                    className={`text-${com.activo ? 'orange' : 'emerald'}-400 border-${com.activo ? 'orange' : 'emerald'}-500/20 hover:bg-${com.activo ? 'orange' : 'emerald'}-500/10 bg-slate-900/40`}
                                  >
                                    {com.activo ? 'Desactivar' : 'Activar'}
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleEdit(com)} className="text-blue-400 border-blue-500/20 bg-slate-900/40">
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleDelete(com.id, com.nombrePeriodo)} className="text-red-400 border-red-500/20 hover:bg-red-500/10 bg-slate-900/40">
                                    <Trash className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500">
                Aún no existen comités históricos registrados.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. SECCION REPORTES */}
      {activeTab === 'reportes' && (
        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-950/20 shadow-xl">
            <CardHeader className="flex justify-between items-center sm:flex-row flex-col space-y-2 sm:space-y-0">
              <CardTitle>Reportes Consolidados de la Central</CardTitle>
              <Button onClick={exportPDFReport} size="sm" className="font-semibold">
                <Download className="w-4 h-4 mr-1.5" /> Descargar Reporte Completo (PDF)
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                const allExonerations = (comites || []).flatMap(c => {
                  const isVigente = c.activo;
                  const members = [
                    { role: 'Presidente', m: c.presidente },
                    { role: 'Secretario', m: c.secretario },
                    { role: 'Tesorero', m: c.tesorero },
                    { role: 'Fiscalizador', m: c.fiscalizador },
                    ...(c.vocal ? [{ role: 'Vocal', m: c.vocal }] : [])
                  ].filter(x => x?.m) as { role: string; m: any }[];
                  return members.map(({ role, m }) => ({
                    committeePeriod: c.nombrePeriodo,
                    fechaInicio: c.fechaInicio,
                    fechaFin: c.fechaFin,
                    role,
                    m,
                    isVigente,
                  }));
                }).filter(item => item.m.supplyCodeExonerado);

                return (
                  <div className="space-y-6">
                    {/* Summary Indicators */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-[#0B0E14] p-4 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Comités Registrados</span>
                        <p className="text-2xl font-bold text-slate-100 mt-1">{comites?.length || 0}</p>
                      </div>
                      <div className="bg-[#0B0E14] p-4 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Socio-Clientes Elegibles</span>
                        <p className="text-2xl font-bold text-green-400 mt-1">{sociosHabilitados.length}</p>
                      </div>
                      <div className="bg-[#0B0E14] p-4 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Suministros Exonerados Activos</span>
                        <p className="text-2xl font-bold text-emerald-400 mt-1">
                          {comiteVigente ? (comiteVigente.vocal ? 5 : 4) : 0}
                        </p>
                      </div>
                    </div>

                    {/* Active Exonerations Subtable */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-300 flex items-center">
                        <Zap className="w-4.5 h-4.5 text-emerald-400 mr-1.5" /> Padrón de Suministros con Exoneraciones Activas
                      </h3>
                      {comiteVigente ? (
                        <div className="border border-slate-800 rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-slate-800 text-xs">
                            <thead className="bg-slate-900">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-slate-300">Suministro</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Socio Directivo</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Cargo</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Periodo Vigencia</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Exención Cobertura</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-950/20">
                              {[
                                { role: 'Presidente', m: comiteVigente.presidente },
                                { role: 'Secretario', m: comiteVigente.secretario },
                                { role: 'Tesorero', m: comiteVigente.tesorero },
                                { role: 'Fiscalizador', m: comiteVigente.fiscalizador },
                                ...(comiteVigente.vocal ? [{ role: 'Vocal', m: comiteVigente.vocal }] : [])
                              ].map(({ role, m }) => (
                                <tr key={role} className="hover:bg-slate-900/30">
                                  <td className="px-4 py-3 font-mono text-emerald-400 font-bold">{m.supplyCodeExonerado || '---'}</td>
                                  <td className="px-4 py-3 text-slate-100 font-semibold">{m.nombreCompleto}</td>
                                  <td className="px-4 py-3 text-slate-300">{role}</td>
                                  <td className="px-4 py-3 text-slate-400">{comiteVigente.fechaInicio} a {comiteVigente.fechaFin}</td>
                                  <td className="px-4 py-3 text-emerald-500 font-medium whitespace-nowrap">
                                    ✓ 100% Consumo Eléctrico
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 bg-slate-900/20 p-4 border border-slate-800 rounded">
                          No hay suministros exonerados actualmente porque no existe un comité directivo en vigencia.
                        </p>
                      )}
                    </div>

                    {/* Historical Exonerations Subtable */}
                    <div className="space-y-3 pt-4 border-t border-slate-800/60">
                      <h3 className="text-sm font-bold text-slate-300 flex items-center">
                        <History className="w-4.5 h-4.5 text-slate-400 mr-1.5" /> Historial de Exoneraciones Otorgadas (Gestiones Anteriores)
                      </h3>
                      {allExonerations.filter(e => !e.isVigente).length > 0 ? (
                        <div className="border border-slate-800 rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-slate-800 text-xs">
                            <thead className="bg-slate-900">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-slate-300">Suministro</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Socio Directivo</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Cargo</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Gestión Periodo</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Fechas Elegibles</th>
                                <th className="px-4 py-2.5 text-left text-slate-300">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-950/20">
                              {allExonerations.filter(e => !e.isVigente).map((e, index) => (
                                <tr key={index} className="hover:bg-slate-900/30">
                                  <td className="px-4 py-3 font-mono text-slate-400 font-bold">{e.m.supplyCodeExonerado}</td>
                                  <td className="px-4 py-3 text-slate-300 font-semibold">{e.m.nombreCompleto}</td>
                                  <td className="px-4 py-3 text-slate-400">{e.role}</td>
                                  <td className="px-4 py-3 text-slate-400 font-medium">{e.committeePeriod}</td>
                                  <td className="px-4 py-3 text-slate-400">{e.fechaInicio} a {e.fechaFin}</td>
                                  <td className="px-4 py-3 text-slate-500 font-medium whitespace-nowrap">
                                    Histórico Inactivo
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 bg-slate-900/20 p-4 border border-slate-800 rounded">
                          No existen registros históricos de exoneraciones de gestiones anteriores.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
