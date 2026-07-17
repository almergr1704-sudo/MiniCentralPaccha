import React, { useState, useMemo } from 'react';
import { PlusCircle, Search, UserCheck, UserPlus, CreditCard, CheckCircle, Receipt, Download } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Button, Card, CardContent } from '../components/ui';
import { normalizeSupplyCode, normalizeSearchText, scoreClientSuppliesMatch } from '../lib/utils';
import { Client, Transaction } from '../store/types';
import { toast } from 'react-hot-toast';
import { generateGeneralPaymentReceiptPDF } from '../lib/receipts';

export default function VentaServicios() {
  const { clients, settings, addClient, updateClient, addTransaction, generateId, transactions, setSupplySocioStatus, suppliesInfo } = useAppContext();
  const [modalOpen, setModalOpen] = useState(false);
  
  // Sale Type: new client vs existing client
  const [saleType, setSaleType] = useState<'NEW_CLIENT' | 'EXISTING_CLIENT'>('NEW_CLIENT');
  
  // Existing client selection
  const [selectedClientId, setSelectedClientId] = useState('');
  const [useExistingAddress, setUseExistingAddress] = useState(true);
  // Search query for existing client selector
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    nombres: '',
    apellidos: '',
    dni: '',
    direccion: '',
    sector: '',
    referenciaDireccion: '',
    telefono: '',
    codigoSuministro: '',
    numeroMedidor: '',
    tipo: 'USUARIO' as 'USUARIO' | 'SOCIO',
    categoria: 'MONOFASICO' as 'MONOFASICO' | 'TRIFASICO',
    montoPagado: settings?.ventaNuevoServicio || 0,
    observacionPago: 'Venta de Nuevo Servicio de Energía',
    tipoVia: '',
    nombreVia: '',
    numeroDireccion: '',
  });

  // Calculate Next Suministro ID automatically
  const handleAutoGenerateSuministro = () => {
    let maxNum = 0;
    clients.forEach(c => {
      const sups = c.suministros?.length ? c.suministros : [c.codigoSuministro].filter(Boolean);
      sups.forEach(s => {
        if (!s) return;
        const norm = normalizeSupplyCode(s as string);
        const match = norm.match(/SUM-(\d+)/);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
    });
    const nextCode = `SUM-${String(maxNum + 1).padStart(4, '0')}`;
    setFormData(prev => ({ ...prev, codigoSuministro: nextCode }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.codigoSuministro) {
      toast.error('Debe ingresar o generar un código de suministro');
      return;
    }
    
    try {
      let finalClientId = '';
      
      if (saleType === 'NEW_CLIENT') {
        if (!formData.nombres || !formData.apellidos) {
          toast.error('Los nombres y apellidos son obligatorios para un nuevo cliente');
          return;
        }
        
        const viaCombined = `${formData.tipoVia || ''} ${formData.nombreVia || ''}`.trim();
        const constructedDireccion = `${viaCombined}${formData.numeroDireccion ? ` N° ${formData.numeroDireccion}` : ''}${formData.sector ? ` - ${formData.sector}` : ''}`;

        const newClient = await addClient({
          nombres: formData.nombres,
          apellidos: formData.apellidos,
          tipoPersona: 'PERSONA',
          dni: formData.dni,
          direccion: constructedDireccion,
          numeroDireccion: formData.numeroDireccion,
          referenciaDireccion: formData.referenciaDireccion,
          telefono: formData.telefono,
          correo: '',
          codigoSuministro: formData.codigoSuministro,
          suministros: [formData.codigoSuministro],
          numeroMedidor: formData.numeroMedidor || undefined,
          tipo: formData.tipo,
          faseSuministro: formData.categoria,
          estado: 'ACTIVO',
          tipoVia: formData.tipoVia,
          nombreVia: formData.nombreVia,
          sector: formData.sector
        });
        finalClientId = newClient.id;

        await setSupplySocioStatus(formData.codigoSuministro, formData.tipo === 'SOCIO', {
          direccion: constructedDireccion,
          sector: formData.sector,
          referenciaDireccion: formData.referenciaDireccion,
          tipoVia: formData.tipoVia,
          nombreVia: formData.nombreVia,
          numeroDireccion: formData.numeroDireccion
        });
      } else {
        if (!selectedClientId) {
          toast.error('Debe seleccionar un cliente existente');
          return;
        }
        const clientObj = clients.find(c => c.id === selectedClientId);
        
        let targetDireccion = '';
        let targetSector = '';
        let targetReferencia = '';
        let targetTipoVia = '';
        let targetNombreVia = '';
        let targetNumeroDireccion = '';

        if (useExistingAddress) {
          targetDireccion = clientObj?.direccion || '';
          targetSector = clientObj?.sector || '';
          targetReferencia = clientObj?.referenciaDireccion || '';
          targetTipoVia = clientObj?.tipoVia || '';
          targetNombreVia = clientObj?.nombreVia || '';
          targetNumeroDireccion = clientObj?.numeroDireccion || '';
        } else {
          const viaCombined = `${formData.tipoVia || ''} ${formData.nombreVia || ''}`.trim();
          targetDireccion = `${viaCombined}${formData.numeroDireccion ? ` N° ${formData.numeroDireccion}` : ''}${formData.sector ? ` - ${formData.sector}` : ''}`;
          targetSector = formData.sector;
          targetReferencia = formData.referenciaDireccion;
          targetTipoVia = formData.tipoVia;
          targetNombreVia = formData.nombreVia;
          targetNumeroDireccion = formData.numeroDireccion;
        }

        await updateClient(selectedClientId, {
          suministros: [...(clientObj?.suministros || []), formData.codigoSuministro] as string[],
          numeroMedidor: formData.numeroMedidor || undefined
        });

        await setSupplySocioStatus(formData.codigoSuministro, formData.tipo === 'SOCIO', {
          direccion: targetDireccion,
          sector: targetSector,
          referenciaDireccion: targetReferencia,
          tipoVia: targetTipoVia,
          nombreVia: targetNombreVia,
          numeroDireccion: targetNumeroDireccion
        });
        finalClientId = selectedClientId;
      }

      // Add a transaction for the sale
      if (formData.montoPagado > 0) {
        await addTransaction({
          tipo: 'INGRESO',
          categoria: 'VENTA_SERVICIO',
          monto: Number(formData.montoPagado),
          descripcion: formData.observacionPago,
          fecha: new Date().toISOString(),
          clientId: finalClientId,
          codigoSuministro: normalizeSupplyCode(formData.codigoSuministro),
          referencia: `Venta Suministro: ${normalizeSupplyCode(formData.codigoSuministro)}`,
          comprobante: '',
          metodoPago: 'EFECTIVO'
        });
      }

      toast.success('Venta de nuevo servicio registrada con éxito');
      setModalOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar la venta');
    }
  };

  const resetForm = () => {
    setFormData({
      nombres: '',
      apellidos: '',
      dni: '',
      direccion: '',
      sector: '',
      referenciaDireccion: '',
      telefono: '',
      codigoSuministro: '',
      numeroMedidor: '',
      tipo: 'USUARIO',
      categoria: 'MONOFASICO',
      montoPagado: settings?.ventaNuevoServicio || 0,
      observacionPago: 'Venta de Nuevo Servicio de Energía',
      tipoVia: '',
      nombreVia: '',
      numeroDireccion: '',
    });
    setSaleType('NEW_CLIENT');
    setSelectedClientId('');
    setClientSearchQuery('');
    setUseExistingAddress(true);
  };

  // Get sales history (transactions related to new supply sales)
  const salesHistory = useMemo(() => {
    return transactions
      .filter(t => t.referencia?.startsWith('Venta Suministro:'))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [transactions]);

  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    const query = normalizeSearchText(clientSearchQuery);
    const filtered = clients.filter(c => {
      const fullname = `${c.nombres} ${c.apellidos}`;
      const legacyName = c.nombre || '';
      const supScore = scoreClientSuppliesMatch(c.codigoSuministro, c.suministros, clientSearchQuery);
      return (
        supScore > 0 ||
        normalizeSearchText(c.dni || '').includes(query) ||
        normalizeSearchText(c.nombres || '').includes(query) ||
        normalizeSearchText(c.apellidos || '').includes(query) ||
        normalizeSearchText(fullname).includes(query) ||
        normalizeSearchText(legacyName).includes(query)
      );
    });

    // Sort: prioritize highest supply code match score, then sort alphabetically by name
    return [...filtered].sort((a, b) => {
      const scoreA = scoreClientSuppliesMatch(a.codigoSuministro, a.suministros, clientSearchQuery);
      const scoreB = scoreClientSuppliesMatch(b.codigoSuministro, b.suministros, clientSearchQuery);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      const nameA = (a.nombre || `${a.nombres || ''} ${a.apellidos || ''}`).trim();
      const nameB = (b.nombre || `${b.nombres || ''} ${b.apellidos || ''}`).trim();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
  }, [clients, clientSearchQuery]);

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId);
  }, [clients, selectedClientId]);

  const handlePrintReceipt = (sale: Transaction, client: Client | undefined) => {
    const supplyAddr = suppliesInfo?.find(s => s.codigo === sale.codigoSuministro)?.direccion;
    const success = generateGeneralPaymentReceiptPDF(sale, client, supplyAddr);
    if (success) {
      toast.success('Comprobante generado con éxito');
    } else {
      toast.error('Error al generar el comprobante');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#0B0E14] p-4 rounded-lg border border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <PlusCircle className="text-blue-500" /> Venta de Nuevos Servicios
          </h1>
          <p className="text-slate-400 text-sm mt-1">Gestione las solicitudes, cobros y activaciones de nuevos suministros.</p>
        </div>
        <Button onClick={() => { resetForm(); setModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 w-full sm:w-auto">
          <PlusCircle className="w-4 h-4 mr-2" />
          Nueva Venta
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-500" /> Historial de Ventas
          </h2>
          {salesHistory.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <PlusCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No se han registrado ventas de servicios aún.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Suministro</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Costo S/</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {salesHistory.map(sale => {
                    const client = clients.find(c => c.id === sale.clientId);
                    return (
                      <tr key={sale.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                          {new Date(sale.fecha).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-white font-medium">
                          {client ? `${client.nombres} ${client.apellidos}` : 'Cliente Eliminado'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                          <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono border border-slate-700">
                            {sale.referencia?.replace('Venta Suministro: ', '')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-emerald-400 text-right">
                          S/ {sale.monto.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400 flex items-center justify-between">
                          <span>{sale.comprobante}</span>
                          <button
                            type="button"
                            onClick={() => handlePrintReceipt(sale, client)}
                            className="ml-2 text-slate-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-blue-500/10"
                            title="Imprimir Comprobante"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/80 backdrop-blur-sm" onClick={() => setModalOpen(false)}></div>
            <div className="relative z-10 inline-block w-full max-w-2xl text-left align-middle transition-all transform bg-[#0B0E14] border border-slate-800 rounded-lg shadow-xl sm:my-8 text-slate-200">
              <form onSubmit={handleSubmit}>
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-blue-500" />
                    Registrar Venta de Suministro
                  </h3>
                </div>
                
                <div className="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
                  {/* TIPO DE CLIENTE */}
                  <div className="flex border border-slate-700 rounded-md overflow-hidden">
                    <button 
                      type="button" 
                      onClick={() => setSaleType('NEW_CLIENT')}
                      className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${saleType === 'NEW_CLIENT' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      <UserPlus className="w-4 h-4" /> Cliente Nuevo
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSaleType('EXISTING_CLIENT')}
                      className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${saleType === 'EXISTING_CLIENT' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      <UserCheck className="w-4 h-4" /> Cliente Existente
                    </button>
                  </div>

                  {saleType === 'EXISTING_CLIENT' ? (
                     <div className="space-y-3">
                       {selectedClientId && selectedClient ? (
                         <div className="bg-slate-800/40 p-4 rounded-md border border-slate-700/80 space-y-3 relative">
                           <div className="flex justify-between items-start">
                             <div>
                               <h4 className="text-xs font-semibold uppercase text-blue-400 tracking-wider">Cliente Seleccionado</h4>
                               <p className="text-base font-bold text-white mt-1">
                                 {selectedClient.nombres} {selectedClient.apellidos}
                               </p>
                             </div>
                             <Button 
                               type="button" 
                               variant="outline" 
                               size="sm" 
                               className="text-xs text-rose-400 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer" 
                               onClick={() => {
                                 setSelectedClientId('');
                                 setClientSearchQuery('');
                               }}
                             >
                               Cambiar Cliente
                             </Button>
                           </div>

                           <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 border-t border-slate-800/60 pt-2">
                             <div>
                               <span className="text-slate-500 block">DNI / RUC</span>
                               <span className="font-semibold text-slate-200">{selectedClient.dni || 'No Registrado'}</span>
                             </div>
                             <div>
                               <span className="text-slate-500 block">Teléfono</span>
                               <span className="font-semibold text-slate-200">{selectedClient.telefono || 'No Registrado'}</span>
                             </div>
                             <div>
                               <span className="text-slate-500 block">Condición</span>
                               <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${selectedClient.tipo === 'SOCIO' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>
                                 {selectedClient.tipo === 'SOCIO' ? 'Socio' : 'Usuario'}
                               </span>
                             </div>
                             <div>
                               <span className="text-slate-500 block text-ellipsis overflow-hidden">Estado Cli.</span>
                               <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${selectedClient.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                 {selectedClient.estado}
                               </span>
                             </div>
                             <div className="col-span-2">
                               <span className="text-slate-500 block">Dirección</span>
                               <span className="font-semibold text-slate-200">{selectedClient.direccion || 'Sin Dirección'}</span>
                             </div>
                           </div>

                           {/* Existing supplies summary list to avoid duplicate assignments */}
                           <div className="mt-3 bg-slate-900/40 p-3 rounded-md border border-slate-800">
                             <h5 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
                               <span>⚠️ Suministros Existentes ({selectedClient.suministros?.length || 0})</span>
                             </h5>
                             {selectedClient.suministros && selectedClient.suministros.length > 0 ? (
                               <div className="flex flex-wrap gap-1.5">
                                 {selectedClient.suministros.map(sup => (
                                   <span key={sup} className="px-2.5 py-1 bg-slate-800 text-slate-200 font-mono text-xs rounded border border-slate-700 shadow-sm">
                                     {normalizeSupplyCode(sup)}
                                   </span>
                                 ))}
                               </div>
                             ) : (
                               <p className="text-xs text-slate-400 italic">Este cliente no tiene suministros activos registrados todavía.</p>
                             )}
                             <p className="text-[10px] text-slate-400 mt-2 italic">
                               Al procesar la venta, se generará y anexará un suministro adicional a este cliente.
                              </p>
                            </div>

                            {/* Address selection for new supply of existing client */}
                            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
                              <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider">Dirección de Suministro</label>
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  type="button"
                                  onClick={() => setUseExistingAddress(true)}
                                  className={`py-2 px-3 text-xs font-medium rounded border transition ${
                                    useExistingAddress 
                                      ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                                  }`}
                                >
                                  Usar Dirección Anterior
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setUseExistingAddress(false)}
                                  className={`py-2 px-3 text-xs font-medium rounded border transition ${
                                    !useExistingAddress 
                                      ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                                  }`}
                                >
                                  Registrar Nueva Dirección
                                </button>
                              </div>

                              {!useExistingAddress && (
                                <div className="space-y-3 bg-slate-900/30 p-3 rounded-md border border-slate-800/60 mt-3">
                                  <div className="text-xs font-bold uppercase text-blue-400 tracking-wider">Nueva Dirección Estructurada</div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-400">Tipo de Vía *</label>
                                      <select 
                                        required 
                                        value={formData.tipoVia} 
                                        onChange={e => setFormData({...formData, tipoVia: e.target.value})} 
                                        className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-blue-500 text-slate-200"
                                      >
                                        <option value="">-- Seleccionar --</option>
                                        <option value="Avenida">Avenida</option>
                                        <option value="Calle">Calle</option>
                                        <option value="Jirón">Jirón</option>
                                        <option value="Pasaje">Pasaje</option>
                                        <option value="Carretera">Carretera</option>
                                        <option value="Prolongación">Prolongación</option>
                                        <option value="Otros">Otros</option>
                                      </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="block text-xs font-medium text-slate-400">Nombre de la Vía *</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={formData.nombreVia} 
                                        onChange={e => setFormData({...formData, nombreVia: e.target.value})} 
                                        placeholder="Ej: Larco, Bolognesi, etc."
                                        className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-blue-500 text-slate-200" 
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-400">N.º de Dirección *</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={formData.numeroDireccion} 
                                        onChange={e => setFormData({...formData, numeroDireccion: e.target.value})} 
                                        placeholder="Ej: 123, S/N, Mz A Lt 5"
                                        className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-blue-500 text-slate-200" 
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-400">Sector / Barrio / Urbanización *</label>
                                      <input 
                                        type="text" 
                                        required 
                                        value={formData.sector} 
                                        onChange={e => setFormData({...formData, sector: e.target.value})} 
                                        placeholder="Ej: Sector Alto, Barrio San José"
                                        className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-blue-500 text-slate-200" 
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-slate-400">Referencia (Opcional)</label>
                                    <input 
                                      type="text" 
                                      value={formData.referenciaDireccion} 
                                      onChange={e => setFormData({...formData, referenciaDireccion: e.target.value})} 
                                      placeholder="Ej: Costado del parque, portón azul"
                                      className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-xs focus:outline-none focus:ring-blue-500 text-slate-200" 
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                       ) : (
                         <div className="space-y-2">
                           <label className="block text-sm font-medium text-slate-300">Buscar por Suministro, DNI o Nombres</label>
                           <div className="relative">
                             <input 
                               type="text" 
                               placeholder="Escriba DNI, Nombres, Apellidos del cliente..." 
                               value={clientSearchQuery} 
                               onChange={(e) => setClientSearchQuery(e.target.value)} 
                               className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-slate-500"
                             />
                             <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                           </div>

                           {/* Dynamic Results dropdown list */}
                           {clientSearchQuery.trim() && (
                             <div className="bg-slate-900 border border-slate-800 rounded-md max-h-56 overflow-y-auto divide-y divide-slate-800/80 mt-1 shadow-lg z-20">
                               {filteredClients.length === 0 ? (
                                 <div className="p-4 text-center text-sm text-slate-500">
                                   No se encontraron coincidencias. Puede registrarlo como <span className="text-blue-400 font-semibold cursor-pointer underline hover:text-blue-300" onClick={() => { setSaleType('NEW_CLIENT'); setClientSearchQuery(''); }}>Cliente Nuevo</span>.
                                 </div>
                               ) : (
                                 filteredClients.map(c => {
                                   const numSuministros = c.suministros?.length || 0;
                                   return (
                                     <div 
                                       key={c.id} 
                                       onClick={() => {
                                         setSelectedClientId(c.id);
                                         setClientSearchQuery('');
                                       }} 
                                       className="p-3 hover:bg-slate-800/60 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                     >
                                       <div>
                                         <div className="font-semibold text-sm text-white">
                                           {c.nombres} {c.apellidos}
                                         </div>
                                         <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                                           <span>DNI: <strong className="text-slate-300">{c.dni || 'N/A'}</strong></span>
                                           <span>•</span>
                                           <span className="truncate max-w-[200px]" title={c.direccion}>Dir: {c.direccion || 'Sin dirección'}</span>
                                         </div>
                                       </div>
                                       <div className="flex items-center gap-2 self-start sm:self-center">
                                         <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono text-slate-300">
                                           {numSuministros} sum.
                                         </span>
                                         <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                           c.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400' :
                                           c.estado === 'CORTADO' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-400'
                                         }`}>
                                           {c.estado}
                                         </span>
                                       </div>
                                     </div>
                                   );
                                 })
                               )}
                             </div>
                           )}
                         </div>
                       )}
                     </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-800/30 p-4 rounded-md border border-slate-800/50">
                      <div className="sm:col-span-2 text-sm font-semibold text-blue-400 border-b border-slate-800 pb-2 mb-2">Datos del Nuevo Cliente</div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Nombres *</label>
                        <input type="text" required value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Apellidos *</label>
                        <input type="text" required value={formData.apellidos} onChange={e => setFormData({...formData, apellidos: e.target.value})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">DNI</label>
                        <input type="text" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400">Teléfono</label>
                        <input type="text" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500" />
                      </div>
                      <div className="sm:col-span-2 border-t border-slate-800/80 pt-3 mt-1 space-y-3">
                        <div className="text-xs font-bold uppercase text-blue-400 tracking-wider">Dirección Estructurada</div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-400">Tipo de Vía *</label>
                            <select 
                              required 
                              value={formData.tipoVia} 
                              onChange={e => setFormData({...formData, tipoVia: e.target.value})} 
                              className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 text-slate-200"
                            >
                              <option value="">-- Seleccionar --</option>
                              <option value="Avenida">Avenida</option>
                              <option value="Calle">Calle</option>
                              <option value="Jirón">Jirón</option>
                              <option value="Pasaje">Pasaje</option>
                              <option value="Carretera">Carretera</option>
                              <option value="Prolongación">Prolongación</option>
                              <option value="Otros">Otros</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400">Nombre de la Vía *</label>
                            <input 
                              type="text" 
                              required 
                              value={formData.nombreVia} 
                              onChange={e => setFormData({...formData, nombreVia: e.target.value})} 
                              placeholder="Ej: Larco, Bolognesi, etc."
                              className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 text-slate-200" 
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-400">N.º de Dirección *</label>
                            <input 
                              type="text" 
                              required 
                              value={formData.numeroDireccion} 
                              onChange={e => setFormData({...formData, numeroDireccion: e.target.value})} 
                              placeholder="Ej: 123, S/N, Mz A Lt 5"
                              className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 text-slate-200" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-400">Sector / Barrio / Urbanización *</label>
                            <input 
                              type="text" 
                              required 
                              value={formData.sector} 
                              onChange={e => setFormData({...formData, sector: e.target.value})} 
                              placeholder="Ej: Sector Alto, Barrio San José"
                              className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 text-slate-200" 
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400">Referencia (Opcional)</label>
                          <input 
                            type="text" 
                            value={formData.referenciaDireccion} 
                            onChange={e => setFormData({...formData, referenciaDireccion: e.target.value})} 
                            placeholder="Ej: Costado del parque, portón azul"
                            className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-blue-500 text-slate-200" 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Suministro y Medidor */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-emerald-900/10 p-4 rounded-md border border-emerald-900/30">
                    <div className="sm:col-span-2 text-sm font-semibold text-emerald-400 border-b border-slate-800 pb-2 mb-2">Datos Técnicos del Servicio</div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Código Suministro *</label>
                      <div className="flex mt-1">
                        <input 
                          type="text" 
                          required 
                          value={formData.codigoSuministro} 
                          onChange={e => setFormData({...formData, codigoSuministro: e.target.value})} 
                          className="block w-full bg-[#0B0E14] border border-slate-700 rounded-l-md py-2 px-3 focus:outline-none focus:ring-blue-500 placeholder:text-slate-600" 
                          placeholder="Ej: SUM-0001"
                        />
                        <button type="button" onClick={handleAutoGenerateSuministro} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-r-md text-slate-200 text-sm whitespace-nowrap border border-l-0 border-slate-700 transition">
                          Generar
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Número de Medidor</label>
                      <input type="text" value={formData.numeroMedidor} onChange={e => setFormData({...formData, numeroMedidor: e.target.value})} placeholder="Opcional" className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-blue-500 placeholder:text-slate-600" />
                    </div>
                       <div className="pt-2">
                         <label className="block text-sm font-medium text-slate-300 mb-2">Condición del Servicio</label>
                         <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value as any})} className="block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-blue-500">
                           <option value="USUARIO">Solo Usuario (Regular)</option>
                           <option value="SOCIO">Socio (Con Derechos)</option>
                         </select>
                       </div>
                       <div className="pt-2">
                         <label className="block text-sm font-medium text-slate-300 mb-2">Categoría (Fase)</label>
                         <select value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value as any})} className="block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2 px-3 focus:outline-none focus:ring-blue-500">
                           <option value="MONOFASICO">Monofásico (Doméstico)</option>
                           <option value="TRIFASICO">Trifásico (Comercial/Industrial)</option>
                         </select>
                       </div>
                  </div>

                  {/* Cobro */}
                  <div className="bg-slate-800/30 p-4 rounded-md border border-slate-800/50">
                     <div className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-2 mb-3">Detalles de Cobro (Instalación / Trámite)</div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400">Monto Cobrado (S/)</label>
                          <input type="number" step="0.10" min="0" value={formData.montoPagado} onChange={e => setFormData({...formData, montoPagado: Number(e.target.value)})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2 px-3 text-lg font-bold text-emerald-400 focus:outline-none focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400">Concepto Referencial</label>
                          <input type="text" value={formData.observacionPago} onChange={e => setFormData({...formData, observacionPago: e.target.value})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-blue-500" />
                        </div>
                     </div>
                  </div>

                </div>
                
                <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50 rounded-b-lg">
                  <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 shadow-sm">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Registrar Venta
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
