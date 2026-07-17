import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, User, Filter, Upload, Download, FileWarning, AlertCircle, FileText, X } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Button, Card, CardContent, Badge, Pagination } from '../components/ui';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { Client, ClientType } from '../store/types';
import { normalizeSearchText, normalizeSupplyCode, genericCompare, scoreClientSuppliesMatch } from '../lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { generateGeneralPaymentReceiptPDF } from '../lib/receipts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export default function Clientes() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { clients, addClient, updateClient, transferSupply, markSupplyAsSocio, suppliesInfo, settings, consumptions, fines, addTransaction, userRole, meetings } = useAppContext();
  const [searchSupplyCode, setSearchSupplyCode] = useState('');
  const [searchDniRuc, setSearchDniRuc] = useState('');
  const [searchName, setSearchName] = useState('');
  const [personTypeFilter, setPersonTypeFilter] = useState<'TODOS' | 'PERSONA' | 'EMPRESA'>('TODOS');
  const [socioTypeFilter, setSocioTypeFilter] = useState<'TODOS' | 'SOCIO' | 'USUARIO'>('TODOS');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'TODOS' | 'MONOFASICO' | 'TRIFASICO'>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO' | 'CORTADO'>('TODOS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferState, setTransferState] = useState<{ 
    client: Client | null; 
    supplyCode: string; 
    toClientId: string;
    mode: 'EXISTING' | 'NEW';
    newClientData: Omit<Client, 'id' | 'fechaRegistro'>;
    monto: number;
    observacion: string;
  }>({ 
    client: null, 
    supplyCode: '', 
    toClientId: '', 
    mode: 'EXISTING',
    newClientData: { 
      nombres: '', apellidos: '', tipoPersona: 'PERSONA', dni: '', direccion: '', 
      numeroDireccion: '', referenciaDireccion: '', telefono: '', correo: '', 
      codigoSuministro: '', suministros: [], tipo: 'USUARIO', estado: 'ACTIVO' 
    },
    monto: 0,
    observacion: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [suministrosStr, setSuministrosStr] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const initialFormState: Omit<Client, 'id' | 'fechaRegistro'> = {
    nombres: '',
    apellidos: '',
    tipoPersona: 'PERSONA',
    dni: '',
    direccion: '',
    numeroDireccion: '',
    referenciaDireccion: '',
    telefono: '',
    correo: '',
    codigoSuministro: '',
    suministros: [],
    numeroMedidor: '',
    tipo: 'USUARIO',
    estado: 'ACTIVO',
    tipoVia: '',
    nombreVia: '',
    sector: ''
  };
  const [formData, setFormData] = useState<Omit<Client, 'id' | 'fechaRegistro'>>(initialFormState);

  const openEditModal = (client: Client) => {
    setEditingId(client.id);
    const aps = client.apellidos || client.nombre?.split(' ').slice(1).join(' ') || '';
    const parts = aps.split(' ');
    setApellidoPaterno(parts[0] || '');
    setApellidoMaterno(parts.slice(1).join(' ') || '');
    
    setFormData({
      nombres: client.nombres || client.nombre?.split(' ')[0] || '',
      apellidos: aps,
      tipoPersona: client.tipoPersona || 'PERSONA',
      dni: client.dni || '',
      direccion: client.direccion || '',
      numeroDireccion: client.numeroDireccion || '',
      referenciaDireccion: client.referenciaDireccion || '',
      telefono: client.telefono || '',
      correo: client.correo || '',
      codigoSuministro: client.codigoSuministro || '',
      suministros: client.suministros || [],
      numeroMedidor: client.numeroMedidor || '',
      tipo: client.tipo || 'USUARIO',
      estado: client.estado || 'ACTIVO',
      tipoVia: client.tipoVia || '',
      nombreVia: client.nombreVia || (client.tipoVia ? '' : client.direccion) || '',
      sector: client.sector || ''
    });
    setSuministrosStr((client.suministros || [client.codigoSuministro]).join(', '));
    setIsModalOpen(true);
  };

  const handleAutoGenerateSuministro = () => {
    let maxNum = 0;
    clients.forEach(c => {
      const codes = [c.codigoSuministro, ...(c.suministros || [])].filter(Boolean) as string[];
      codes.forEach(code => {
        let numStr = code;
        if (code.toUpperCase().startsWith('SUM-')) {
          numStr = code.substring(4);
        }
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });
    });
    const nextCodeStr = String(maxNum + 1).padStart(4, '0');
    setSuministrosStr(nextCodeStr);
    toast.success(`Código de suministro generado: SUM-${nextCodeStr}`);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setApellidoPaterno('');
    setApellidoMaterno('');
    setFormData(initialFormState);
    
    // Auto-generate the next correlative supply code taking reference from the last registered one
    let maxNum = 0;
    clients.forEach(c => {
      const codes = [c.codigoSuministro, ...(c.suministros || [])].filter(Boolean) as string[];
      codes.forEach(code => {
        let numStr = code;
        if (code.toUpperCase().startsWith('SUM-')) {
          numStr = code.substring(4);
        }
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });
    });
    const nextNumStr = String(maxNum + 1).padStart(4, '0');
    setSuministrosStr(nextNumStr);
    setIsModalOpen(true);
  };

  const [sortField, setSortField] = useState<string>('nombre');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      // 1. Search Supply Code
      if (searchSupplyCode) {
        const score = scoreClientSuppliesMatch(c.codigoSuministro, c.suministros, searchSupplyCode);
        if (score === 0) return false;
      }

      // 2. Search DNI/RUC
      if (searchDniRuc) {
        const normSearch = normalizeSearchText(searchDniRuc);
        const dni = normalizeSearchText(c.dni || '');
        if (!dni.includes(normSearch)) return false;
      }

      // 3. Search Name
      if (searchName) {
        const normSearch = normalizeSearchText(searchName);
        const rawFullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;
        const fullName = normalizeSearchText(rawFullName);
        if (!fullName.includes(normSearch)) return false;
      }

      // 4. Tipo de Cliente (Persona/Empresa)
      if (personTypeFilter !== 'TODOS') {
        const computedPersonType = c.tipoPersona || 'PERSONA';
        if (computedPersonType !== personTypeFilter) return false;
      }

      // 5. Tipo de Socio
      if (socioTypeFilter !== 'TODOS') {
        const isClientSocio = (c.suministros?.length ? c.suministros : [c.codigoSuministro]).some(sup => {
           return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (c.tipo === 'SOCIO');
        }) || c.tipo === 'SOCIO';
        const computedSocioType = isClientSocio ? 'SOCIO' : 'USUARIO';
        if (computedSocioType !== socioTypeFilter) return false;
      }

      // 6. Tipo de Servicio (Monofásico/Trifásico)
      if (serviceTypeFilter !== 'TODOS') {
        const computedServiceType = c.faseSuministro || 'MONOFASICO';
        if (computedServiceType !== serviceTypeFilter) return false;
      }

      // 7. Estado del Servicio
      if (statusFilter !== 'TODOS') {
        const computedStatus = c.estado || 'ACTIVO';
        if (computedStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [clients, suppliesInfo, searchSupplyCode, searchDniRuc, searchName, personTypeFilter, socioTypeFilter, serviceTypeFilter, statusFilter]);

  const sortedClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => {
      if (searchSupplyCode) {
        const scoreA = scoreClientSuppliesMatch(a.codigoSuministro, a.suministros, searchSupplyCode);
        const scoreB = scoreClientSuppliesMatch(b.codigoSuministro, b.suministros, searchSupplyCode);
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
      }

      if (sortField === 'nombre') {
        const nameA = a.nombre ? a.nombre : `${a.nombres || ''} ${a.apellidos || ''}`.trim();
        const nameB = b.nombre ? b.nombre : `${b.nombres || ''} ${b.apellidos || ''}`.trim();
        return genericCompare({ ...a, fullName: nameA }, { ...b, fullName: nameB }, 'fullName', sortDirection);
      }
      if (sortField === 'asisPercent') {
        const isSocioA = (a.suministros?.length ? a.suministros : [a.codigoSuministro]).some(sup => {
          return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (a.tipo === 'SOCIO');
        }) || a.tipo === 'SOCIO';
        const isSocioB = (b.suministros?.length ? b.suministros : [b.codigoSuministro]).some(sup => {
          return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (b.tipo === 'SOCIO');
        }) || b.tipo === 'SOCIO';
        const asisPercentA = isSocioA ? (() => {
          const asambleas = meetings.filter(m => m.tipo === 'ASAMBLEA' && m.estado === 'FINALIZADA');
          const asambleasAsistidas = asambleas.filter(m => m.asistencia[a.id] === 'ASISTIO' || m.asistencia[a.id] === 'JUSTIFICO');
          return asambleas.length > 0 ? (asambleasAsistidas.length / asambleas.length) * 100 : 100;
        })() : 0;
        const asisPercentB = isSocioB ? (() => {
          const asambleas = meetings.filter(m => m.tipo === 'ASAMBLEA' && m.estado === 'FINALIZADA');
          const asambleasAsistidas = asambleas.filter(m => m.asistencia[b.id] === 'ASISTIO' || m.asistencia[b.id] === 'JUSTIFICO');
          return asambleas.length > 0 ? (asambleasAsistidas.length / asambleas.length) * 100 : 100;
        })() : 0;
        return genericCompare({ ...a, asisPercent: asisPercentA }, { ...b, asisPercent: asisPercentB }, 'asisPercent', sortDirection);
      }
      return genericCompare(a, b, sortField, sortDirection);
    });
  }, [filteredClients, sortField, sortDirection, suppliesInfo, meetings, searchSupplyCode]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const totalPages = Math.ceil(sortedClients.length / itemsPerPage);
  
  const currentClients = sortedClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const isAnyFilterActive = searchSupplyCode || searchDniRuc || searchName || personTypeFilter !== 'TODOS' || socioTypeFilter !== 'TODOS' || serviceTypeFilter !== 'TODOS' || statusFilter !== 'TODOS';

  const clearClientFilters = () => {
    setSearchSupplyCode('');
    setSearchDniRuc('');
    setSearchName('');
    setPersonTypeFilter('TODOS');
    setSocioTypeFilter('TODOS');
    setServiceTypeFilter('TODOS');
    setStatusFilter('TODOS');
    setCurrentPage(1);
    setSortDirection('asc');
  };

  // Reset sorting to ascending and first page if search/filter changes
  useEffect(() => {
    setCurrentPage(1);
    setSortDirection('asc');
  }, [searchSupplyCode, searchDniRuc, searchName, personTypeFilter, socioTypeFilter, serviceTypeFilter, statusFilter]);

  const handleExportClientsPDF = () => {
    const toastId = toast.loading('Generando PDF de clientes...');
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('Reporte de Clientes - Filtros Avanzados', 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      doc.text(`Generado el: ${nowStr}`, 14, 26);
      
      const filtersApplied = [
        `Suministro: ${searchSupplyCode || 'Todos'}`,
        `DNI/RUC: ${searchDniRuc || 'Todos'}`,
        `Nombre: ${searchName || 'Todos'}`,
        `Socio: ${socioTypeFilter}`,
        `Persona: ${personTypeFilter}`,
        `Servicio: ${serviceTypeFilter}`,
        `Estado: ${statusFilter}`
      ].join(' | ');
      doc.text(`Filtros aplicados: ${filtersApplied}`, 14, 31);
      
      const tableHeaders = [
        ['Código Suministro', 'Nombre del Cliente', 'DNI/RUC', 'Dirección', 'Tipo Cliente', 'Tipo Socio', 'Servicio', 'Estado', 'Fecha Reg.']
      ];
      
      const tableRows = filteredClients.map(c => {
        const rawFullName = c.nombre ? c.nombre : `${c.apellidos || ''}, ${c.nombres || ''}`;
        const cleanSuministros = [c.codigoSuministro, ...(c.suministros || [])].filter(Boolean).join(', ');
        
        const isClientSocio = (c.suministros?.length ? c.suministros : [c.codigoSuministro]).some(sup => {
           return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (c.tipo === 'SOCIO');
        }) || c.tipo === 'SOCIO';
        
        const regDate = c.fechaRegistro ? format(new Date(c.fechaRegistro), 'dd/MM/yyyy') : 'N/A';
        
        return [
          cleanSuministros || 'N/A',
          rawFullName,
          c.dni || 'N/A',
          `${c.direccion || ''} ${c.numeroDireccion || ''}`.trim() || 'N/A',
          c.tipoPersona === 'EMPRESA' ? 'Empresa' : 'Persona Natural',
          isClientSocio ? 'Socio' : 'Usuario',
          c.faseSuministro || 'MONOFASICO',
          c.estado || 'ACTIVO',
          regDate
        ];
      });
      
      autoTable(doc, {
        startY: 36,
        head: tableHeaders,
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { top: 35, left: 14, right: 14 }
      });
      
      doc.save(`Reporte_Clientes_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
      toast.success('Reporte de clientes en PDF descargado.', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar PDF de clientes.', { id: toastId });
    }
  };

  const handleExportClientsExcel = () => {
    try {
      const excelRows = filteredClients.map(c => {
        const rawFullName = c.nombre ? c.nombre : `${c.apellidos || ''}, ${c.nombres || ''}`;
        const cleanSuministros = [c.codigoSuministro, ...(c.suministros || [])].filter(Boolean).join(', ');
        
        const isClientSocio = (c.suministros?.length ? c.suministros : [c.codigoSuministro]).some(sup => {
           return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (c.tipo === 'SOCIO');
        }) || c.tipo === 'SOCIO';
        
        const regDate = c.fechaRegistro ? format(new Date(c.fechaRegistro), 'dd/MM/yyyy') : 'N/A';
        
        return {
          'Cod. Suministro': cleanSuministros || 'N/A',
          'Nombre / Razón Social': rawFullName,
          'DNI / RUC': c.dni || 'N/A',
          'Dirección': `${c.direccion || ''} ${c.numeroDireccion || ''}`.trim() || 'N/A',
          'Referencia Dirección': c.referenciaDireccion || '',
          'Teléfono': c.telefono || '',
          'Correo': c.correo || '',
          'Tipo Cliente': c.tipoPersona === 'EMPRESA' ? 'Empresa' : 'Persona Natural',
          'Tipo Socio': isClientSocio ? 'Socio' : 'Usuario',
          'Tipo de Servicio': c.faseSuministro || 'MONOFASICO',
          'Estado': c.estado || 'ACTIVO',
          'Fecha Registro': regDate
        };
      });
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelRows);
      
      const maxLens = Object.keys(excelRows[0] || {}).reduce((acc, key) => {
        acc[key] = key.length;
        return acc;
      }, {} as Record<string, number>);
      
      excelRows.forEach(row => {
        Object.keys(row).forEach(key => {
          const val = String((row as any)[key] || '');
          if (val.length > maxLens[key]) {
            maxLens[key] = val.length;
          }
        });
      });
      
      ws['!cols'] = Object.keys(maxLens).map(key => ({
        wch: Math.min(Math.max(maxLens[key] + 3, 10), 40)
      }));
      
      XLSX.utils.book_append_sheet(wb, ws, "Clientes Filtrados");
      XLSX.writeFile(wb, `Reporte_Clientes_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
      toast.success('Reporte de clientes en Excel descargado.');
    } catch (error) {
      console.error('Error generating Excel:', error);
      toast.error('Error al generar Excel de clientes.');
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saveConfirmed = await confirm({
      title: 'Guardar Cliente',
      message: '¿Está seguro de guardar este registro?',
      type: 'confirm',
      confirmLabel: 'Guardar'
    });
    if (!saveConfirmed) return;

    if (editingId && formData.estado === 'ACTIVO') {
      const client = clients.find(c => c.id === editingId);
      if (client && client.estado === 'CORTADO') {
        const pendingDebtsCount = consumptions.filter(c => c.clientId === editingId && c.estadoPago === 'PENDIENTE').length;
        const pendingFinesCount = (fines || []).filter(f => f.clientId === editingId && f.estadoPago === 'PENDIENTE').length;
        
        if (pendingDebtsCount > 0 || pendingFinesCount > 0) {
          toast.error('El cliente no puede ser reactivado porque tiene recibos de consumo o multas pendientes.');
          return;
        }

        if (settings?.costoReconexion > 0) {
          const confirmReconexion = await confirm({
            title: 'Reactivación de Servicio',
            message: `Para reactivar el servicio se requiere el pago de reconexión (S/ ${settings.costoReconexion.toFixed(2)}).\n\n¿El cliente ya realizó este pago?\nAl confirmar, se registrará el ingreso automáticamente y el estado cambiará a ACTIVO.`,
            type: 'info',
            confirmLabel: 'Sí, registrar pago',
            cancelLabel: 'No'
          });
          if (!confirmReconexion) {
            return;
          }

          await addTransaction({
            tipo: 'INGRESO',
            categoria: 'RECONEXION',
            monto: settings.costoReconexion,
            descripcion: 'Cobro y pago por reconexión de servicio',
            clientId: editingId,
            codigoSuministro: client?.codigoSuministro || (client?.suministros && client.suministros.length > 0 ? client.suministros[0] : undefined)
          });
        }
      }
    }

    const suministrosArray = suministrosStr.split(',').map(s => normalizeSupplyCode(s)).filter(s => s);
    
    const viaCombined = `${formData.tipoVia || ''} ${formData.nombreVia || ''}`.trim();
    const constructedDireccion = `${viaCombined}${formData.numeroDireccion ? ` N° ${formData.numeroDireccion}` : ''}${formData.sector ? ` - ${formData.sector}` : ''}`;

    const clientData = {
      ...formData,
      direccion: constructedDireccion,
      apellidos: `${apellidoPaterno} ${apellidoMaterno}`.trim(),
      suministros: suministrosArray,
      codigoSuministro: suministrosArray[0] || normalizeSupplyCode(formData.codigoSuministro)
    };

    try {
      if (editingId) {
        await updateClient(editingId, clientData);
      } else {
        await addClient(clientData);
      }
      closeModal();
      toast.success(editingId ? 'Cliente actualizado con éxito.' : 'Cliente registrado con éxito.');
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el cliente.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setSuministrosStr('');
    setApellidoPaterno('');
    setApellidoMaterno('');
    setFormData(initialFormState);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        
        // Process records
        let processed = 0;
        let errors = 0;
        
        const processRows = async () => {
          for (const row of data) {
            // Identify fields loosely based on possible naming
            const nombres = row.Nombres || row.nombres || row.Nombre || row.nombre || '';
            
            let apellidos = '';
            if (row['Apellido Paterno'] || row['Apellido Materno']) {
              apellidos = `${row['Apellido Paterno'] || ''} ${row['Apellido Materno'] || ''}`.trim();
            } else {
              apellidos = row.Apellidos || row.apellidos || row.Apellido || row.apellido || '';
            }
            
            const dni = (row['DNI/RUC'] || row.DNI || row.dni || row.RUC || row.ruc || row.Documento || '').toString();
            const tipoPersonaRaw = (row['Tipo Persona'] || row.tipoPersona || row.TipoPersona || '').toString().toUpperCase();
            const tipoPersona = tipoPersonaRaw === 'EMPRESA' ? 'EMPRESA' : 'PERSONA';
            const tipo = (row.Tipo || row.tipo || 'USUARIO').toString().toUpperCase() === 'SOCIO' ? 'SOCIO' as const : 'USUARIO' as const;
            const suministroStr = (row.Suministro || row.suministro || row.Suministros || '').toString();
            const numeroMedidor = (row.Medidor || row.medidor || row['Numero de Medidor'] || row['Número de Medidor'] || row.numeroMedidor || '').toString();
            
            if (nombres || apellidos || dni) {
              const suministrosArray = suministroStr.split(',').map((s: string) => normalizeSupplyCode(s)).filter((s: string) => s);
              try {
                await addClient({
                  nombres,
                  apellidos,
                  tipoPersona,
                  dni,
                  tipo,
                  estado: 'ACTIVO',
                  direccion: row.Direccion || row.direccion || '',
                  numeroDireccion: (row.Numero || row.numero || '').toString(),
                  referenciaDireccion: row.Referencia || row.referencia || '',
                  telefono: (row.Telefono || row.telefono || '').toString(),
                  correo: row.Correo || row.correo || row.Email || row.email || '',
                  codigoSuministro: suministrosArray[0] || '',
                  suministros: suministrosArray,
                  numeroMedidor: numeroMedidor || undefined
                });
                processed++;
              } catch (err: any) {
                console.error('Error importing row:', err);
                toast.error(`Error en fila (${dni || nombres}): ${err.message}`);
                errors++;
              }
            }
          }
          
          if (processed > 0) {
            toast.success(`Se importaron ${processed} registros correctamente.` + (errors > 0 ? ` Hubo ${errors} errores.` : ''));
            setTimeout(() => window.location.reload(), 2000); // Wait for toast to display briefly
          } else if (errors > 0) {
            toast.error(`No se importaron registros. Hubo ${errors} errores.`);
          }
        };
        
        processRows();
      } catch (err) {
        console.error(err);
        toast.error('Hubo un error importando el archivo.');
      }
    };
    reader.readAsBinaryString(file);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      'Tipo Persona': 'PERSONA o EMPRESA',
      Nombres: 'Juan (o Razón Social)',
      'Apellido Paterno': 'Perez (vacío si es empresa)',
      'Apellido Materno': 'Gomez (vacío si es empresa)',
      'DNI/RUC': '12345678',
      Tipo: 'SOCIO o USUARIO',
      Suministro: '001, 002',
      Medidor: 'MED-123',
      Direccion: 'Av. Principal',
      Numero: '123',
      Referencia: 'Frente al parque',
      Telefono: '987654321',
      Correo: 'juan@example.com'
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Clientes.xlsx');
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Gestión de Clientes
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Directorio de socios y usuarios de la central.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <Button variant="outline" className="hidden sm:inline-flex" onClick={handleDownloadTemplate}>
            <Download className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Descargar Plantilla
          </Button>
          {userRole !== 'FISCALIZADOR' && (
            <>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                Importar Excel
              </Button>
              <Button onClick={openCreateModal}>
                <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                Nuevo Registro
              </Button>
            </>
          )}
        </div>
      </div>

      {React.useMemo(() => {
        const supplySet: Record<string, string[]> = {};
        const meterSet: Record<string, string[]> = {};
        clients.forEach(c => {
           const sups = c.suministros?.length ? c.suministros : [c.codigoSuministro].filter(Boolean);
           sups.forEach(s => {
             if (!s) return;
             const normalizedSup = normalizeSupplyCode(s as string);
             if (!supplySet[normalizedSup]) supplySet[normalizedSup] = [];
             supplySet[normalizedSup].push(c.id);
           });
           if (c.numeroMedidor) {
             if (!meterSet[c.numeroMedidor]) meterSet[c.numeroMedidor] = [];
             meterSet[c.numeroMedidor].push(c.id);
           }
        });
        const duplicatesS = Object.entries(supplySet).filter(([_, ids]) => ids.length > 1);
        const duplicatesM = Object.entries(meterSet).filter(([_, ids]) => ids.length > 1);
        if (duplicatesS.length === 0 && duplicatesM.length === 0) return null;
        
        return (
          <div className="bg-amber-900/40 border border-amber-600/50 p-4 rounded-md">
             <h3 className="text-amber-400 font-semibold text-sm mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Advertencia: Se encontraron registros duplicados en el sistema
             </h3>
             <ul className="text-sm text-amber-200 list-disc pl-5 mt-2 space-y-1">
                {duplicatesS.map(([sup, ids]) => (
                   <li key={`sup-${sup}`}>El suministro <strong>{sup}</strong> está asignado a {ids.length} clientes. Verifique y corrija los registros.</li>
                ))}
                {duplicatesM.map(([med, ids]) => (
                   <li key={`med-${med}`}>El medidor <strong>{med}</strong> está asignado a {ids.length} clientes. Verifique y corrija los registros.</li>
                ))}
             </ul>
          </div>
        );
      }, [clients])}

      <Card className="bg-slate-900/30 border-slate-800">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-2 text-slate-100">
              <Filter className="h-5 w-5 text-blue-500" />
              <h3 className="text-lg font-semibold">Búsqueda Avanzada y Filtros</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportClientsPDF}
                className="border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center gap-2"
              >
                <FileText className="h-4 w-4 text-rose-500" />
                Exportar PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportClientsExcel}
                className="border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center gap-2"
              >
                <Download className="h-4 w-4 text-emerald-500" />
                Exportar Excel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search Supply Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Código de Suministro</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ej: SUM-0001"
                  value={searchSupplyCode}
                  onChange={(e) => setSearchSupplyCode(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Search DNI/RUC */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">DNI o RUC</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ej: 10456..."
                  value={searchDniRuc}
                  onChange={(e) => setSearchDniRuc(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Search Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-400">Nombres y Apellidos / Razón Social</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar por cliente..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filter Tipo Persona */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Tipo de Cliente</label>
              <select
                value={personTypeFilter}
                onChange={(e) => setPersonTypeFilter(e.target.value as any)}
                className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900"
              >
                <option value="TODOS">Todos los Tipos</option>
                <option value="PERSONA">Persona Natural</option>
                <option value="EMPRESA">Empresa / Razón Social</option>
              </select>
            </div>

            {/* Filter Tipo Socio */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Tipo de Socio</label>
              <select
                value={socioTypeFilter}
                onChange={(e) => setSocioTypeFilter(e.target.value as any)}
                className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900"
              >
                <option value="TODOS">Todos</option>
                <option value="SOCIO">Socio</option>
                <option value="USUARIO">Usuario</option>
              </select>
            </div>

            {/* Filter Tipo Servicio */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Tipo de Servicio</label>
              <select
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value as any)}
                className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900"
              >
                <option value="TODOS">Todos los Servicios</option>
                <option value="MONOFASICO">Monofásico</option>
                <option value="TRIFASICO">Trifásico</option>
              </select>
            </div>

            {/* Filter Estado Servicio */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Estado del Servicio</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full bg-[#0B0E14] border border-slate-700 rounded-md py-1.5 px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
                <option value="CORTADO">En Corte</option>
              </select>
            </div>
          </div>

          {isAnyFilterActive && (
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearClientFilters}
                className="border-dashed border-red-500/40 text-red-400 hover:bg-red-500/10 flex items-center gap-1.5"
              >
                <X className="h-4 w-4" />
                Limpiar Filtros Avanzados
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={sortedClients.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            disableTopBorder={true}
          />

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-800/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="mr-2">Cliente / Suministro:</span>
                      <button type="button" onClick={() => handleSort('nombre')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sortField === 'nombre' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                        NOMBRE {renderSortIndicator('nombre')}
                      </button>
                      <button type="button" onClick={() => handleSort('codigoSuministro')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sortField === 'codigoSuministro' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                        SUMINISTRO {renderSortIndicator('codigoSuministro')}
                      </button>
                      <button type="button" onClick={() => handleSort('dni')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sortField === 'dni' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                        DNI {renderSortIndicator('dni')}
                      </button>
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleSort('direccion')} className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Contacto {renderSortIndicator('direccion')}
                  </th>
                  <th scope="col" onClick={() => handleSort('tipo')} className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Tipo {renderSortIndicator('tipo')}
                  </th>
                  <th scope="col" onClick={() => handleSort('estado')} className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Estado {renderSortIndicator('estado')}
                  </th>
                  <th scope="col" onClick={() => handleSort('asisPercent')} className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Asistencia {renderSortIndicator('asisPercent')}
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                {currentClients.length > 0 ? currentClients.map((client) => {
                  const pendingDebtsCount = consumptions.filter(c => c.clientId === client.id && c.estadoPago === 'PENDIENTE').length;
                  const aptForCut = pendingDebtsCount >= 3 && client.estado !== 'CORTADO';
                  
                  const isClientSocio = (client.suministros?.length ? client.suministros : [client.codigoSuministro]).some(sup => {
                     return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (client.tipo === 'SOCIO');
                  }) || client.tipo === 'SOCIO';

                  // Calculate attendance percentage
                  let asisPercent = 0;
                  if (isClientSocio) {
                    const asambleas = meetings.filter(m => m.tipo === 'ASAMBLEA' && m.estado === 'FINALIZADA');
                    const asambleasAsistidas = asambleas.filter(m => m.asistencia[client.id] === 'ASISTIO' || m.asistencia[client.id] === 'JUSTIFICO');
                    asisPercent = asambleas.length > 0 ? Math.round((asambleasAsistidas.length / asambleas.length) * 100) : 100;
                  }

                  return (
                  <tr key={client.id} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 whitespace-normal min-w-[250px]">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-slate-500" />
                        </div>
                        <div className="ml-4 break-words">
                          <div className="text-sm text-slate-100 flex flex-wrap gap-2 items-center">
                             {client.nombre ? client.nombre : `${client.nombres} ${client.apellidos}`.trim()}
                             {aptForCut && (
                                <span title="Apto para corte: 3 o más deudas pendientes" className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-400 border border-red-500/20 whitespace-nowrap">
                                  APTO PARA CORTE ({pendingDebtsCount} deudas)
                                </span>
                             )}
                          </div>
                          <div className="text-xs text-slate-400 mt-1 mb-1">
                             {client.tipoPersona === 'EMPRESA' ? 'RUC' : 'DNI'}: {client.dni} 
                             {client.numeroMedidor && (
                                <span className="ml-2">| Medidor: {client.numeroMedidor}</span>
                             )}
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                             {(client.suministros?.length ? client.suministros : [client.codigoSuministro]).filter(Boolean).map(sup => {
                                const isSocio = suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (client.tipo === 'SOCIO');
                                return (
                                  <div key={sup} className="flex items-center gap-2">
                                     <span className="font-mono text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700">SUM: {sup!}</span>
                                     <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${isSocio ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                       {isSocio ? 'SOCIO' : 'USUARIO'}
                                     </span>
                                     {!isSocio && userRole !== 'FISCALIZADOR' && (
                                       <button
                                         onClick={async () => {
                                            const confirmSocio = await confirm({
                                              title: 'Convertir a Socio',
                                              message: `¿Convertir el suministro ${sup} a SOCIO permanentemente?`,
                                              type: 'confirm',
                                              confirmLabel: 'Sí, convertir'
                                            });
                                            if (confirmSocio) {
                                              markSupplyAsSocio(sup!);
                                              toast.success(`Suministro ${sup} ahora es SOCIO`);
                                            }
                                         }}
                                         className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                                       >
                                         Hacer Socio
                                       </button>
                                     )}
                                  </div>
                                );
                             })}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-normal min-w-[200px] max-w-[300px] break-words">
                      <div className="text-sm text-slate-100">{client.telefono}</div>
                      <div className="text-sm text-slate-400">{client.direccion} {client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''} {client.referenciaDireccion ? `(${client.referenciaDireccion})` : ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={isClientSocio ? 'success' : 'info'}>
                          {isClientSocio ? 'SOCIO' : 'USUARIO'}
                        </Badge>
                        {client.faseSuministro && (
                          <Badge variant="info" className="text-slate-400 border-slate-700">
                            {client.faseSuministro}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={client.estado === 'ACTIVO' ? 'success' : client.estado === 'CORTADO' ? 'danger' : 'warning'}>
                        {client.estado}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isClientSocio ? (
                        <div className="flex items-center">
                          <div className="w-16 bg-slate-700 rounded-full h-2 mr-2">
                            <div className={`h-2 rounded-full ${asisPercent >= 80 ? 'bg-emerald-500' : asisPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${asisPercent}%` }}></div>
                          </div>
                          <span className="text-xs text-slate-300">{asisPercent}%</span>
                        </div>
                      ) : (
                         <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                       {userRole !== 'FISCALIZADOR' && aptForCut && (
                          <button 
                            onClick={async () => {
                              const confirmCut = await confirm({
                                title: 'Corte de Servicio',
                                message: '¿Desea marcar el servicio como EN CORTE?',
                                type: 'danger',
                                confirmLabel: 'Sí, cortar',
                                cancelLabel: 'Cancelar'
                              });
                              if(confirmCut) {
                                updateClient(client.id, { estado: 'CORTADO' });
                              }
                            }}
                            className="text-red-500 hover:text-red-700 underline underline-offset-2 mr-3 font-semibold"
                          >
                            En corte
                          </button>
                       )}
                       {userRole !== 'FISCALIZADOR' && client.estado === 'CORTADO' && (
                         <button 
                           onClick={async () => {
                             if(pendingDebtsCount > 0) {
                               toast.error('El cliente no puede ser reactivado porque tiene deudas pendientes.');
                             } else {
                               const confirmReact = await confirm({
                                 title: 'Reactivar Servicio',
                                 message: '¿Desea REACTIVAR el servicio del cliente?',
                                 type: 'info',
                                 confirmLabel: 'Reactivar',
                                 cancelLabel: 'Cancelar'
                               });
                               if(confirmReact) {
                                 updateClient(client.id, { estado: 'ACTIVO' });
                               }
                             }
                           }}
                           className={`${pendingDebtsCount > 0 ? "text-slate-500 cursor-not-allowed" : "text-emerald-500 hover:text-emerald-400"} mr-3 font-semibold`}
                         >
                           Reactivar
                         </button>
                       )}
                      <button 
                        onClick={() => navigate(`/consumo?tab=recibos&clientId=${client.id}`)}
                        className="text-amber-500 hover:text-amber-400 mr-3 font-semibold"
                        title="Ver Historial de Recibos"
                      >
                        Recibos
                      </button>
                      {userRole !== 'FISCALIZADOR' && (
                        <button 
                          onClick={() => openEditModal(client)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Editar
                        </button>
                      )}
                      {userRole !== 'FISCALIZADOR' && client.suministros && client.suministros.length > 0 && (
                         <button 
                         onClick={() => {
                           setTransferState({ 
                             client, supplyCode: client.suministros![0], toClientId: '', mode: 'EXISTING', monto: 0, observacion: `CAMBIO DE TITULARIDAD - SUMINISTRO: ${normalizeSupplyCode(client.suministros![0])}`,
                             newClientData: { 
                                nombres: '', apellidos: '', tipoPersona: 'PERSONA', dni: '', direccion: '', 
                                numeroDireccion: '', referenciaDireccion: '', telefono: '', correo: '', 
                                codigoSuministro: '', suministros: [], tipo: 'USUARIO', estado: 'ACTIVO' 
                             }
                           });
                           setIsTransferModalOpen(true);
                         }}
                         className="text-purple-500 hover:text-purple-700 font-semibold"
                        >
                          Transferir
                        </button>
                      )}
                    </td>
                  </tr>
                )}) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                      No se encontraron registros que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedClients.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modal for Add Client */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setIsModalOpen(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-[#0B0E14] px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-slate-100" id="modal-title">
                        {editingId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
                      </h3>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Tipo de Persona</label>
                          <div className="flex gap-4">
                            <label className="flex items-center text-slate-300">
                              <input type="radio" value="PERSONA" checked={formData.tipoPersona === 'PERSONA'} onChange={e => setFormData({...formData, tipoPersona: 'PERSONA'})} className="mr-2 text-blue-500 focus:ring-blue-500 bg-[#0B0E14] border-slate-700" />
                              Persona Natural
                            </label>
                            <label className="flex items-center text-slate-300">
                              <input type="radio" value="EMPRESA" checked={formData.tipoPersona === 'EMPRESA'} onChange={e => setFormData({...formData, tipoPersona: 'EMPRESA'})} className="mr-2 text-blue-500 focus:ring-blue-500 bg-[#0B0E14] border-slate-700" />
                              Empresa
                            </label>
                          </div>
                        </div>
                        
                        {formData.tipoPersona === 'PERSONA' ? (
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300">Nombres</label>
                              <input type="text" required value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300">Apellido Paterno</label>
                              <input type="text" required value={apellidoPaterno} onChange={e => setApellidoPaterno(e.target.value)} className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300">Apellido Materno</label>
                              <input type="text" value={apellidoMaterno} onChange={e => setApellidoMaterno(e.target.value)} className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium text-slate-300">Razón Social</label>
                            <input type="text" required value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-300">
                              {formData.tipoPersona === 'PERSONA' ? 'DNI' : 'RUC'}
                            </label>
                            <input 
                              type="text" 
                              required 
                              value={formData.dni} 
                              onChange={e => {
                                const val = e.target.value.replace(/\D/g, '');
                                setFormData({...formData, dni: val});
                              }} 
                              maxLength={formData.tipoPersona === 'PERSONA' ? 8 : 11}
                              minLength={formData.tipoPersona === 'PERSONA' ? 8 : 11}
                              pattern={formData.tipoPersona === 'PERSONA' ? "\\d{8}" : "\\d{11}"}
                              title={formData.tipoPersona === 'PERSONA' ? "Debe contener 8 dígitos" : "Debe contener 11 dígitos"}
                              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300">Cod. Suministro(s)</label>
                            <div className="flex mt-1">
                              <div className="flex flex-1 rounded-l-md border border-slate-700 overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                                <span className="inline-flex items-center px-3 border-r border-slate-700 bg-slate-800 text-slate-400 text-sm">
                                  SUM-
                                </span>
                                <input 
                                  type="text" 
                                  required 
                                  value={suministrosStr.split(',').map(s => s.trim().replace(/^SUM-/i, '')).join(', ')} 
                                  onChange={e => setSuministrosStr(e.target.value)} 
                                  placeholder="Ej: 001, 002" 
                                  className="flex-1 block w-full py-2 px-3 focus:outline-none sm:text-sm bg-[#0B0E14] text-slate-100" 
                                />
                              </div>
                              <button 
                                type="button" 
                                onClick={handleAutoGenerateSuministro} 
                                className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-r-md text-slate-200 text-sm whitespace-nowrap border border-l-0 border-slate-700 transition"
                              >
                                Generar
                              </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Separe múltiples códigos por comas (el prefijo SUM- se añade automáticamente).</p>
                          </div>
                        </div>
                        {/* Formulario de Dirección Estructurado */}
                        <div className="space-y-4 bg-slate-900/20 p-4 rounded-lg border border-slate-800/80">
                          <h4 className="text-xs font-bold uppercase text-blue-400 tracking-wider">Dirección Estructurada</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300">Tipo de Vía *</label>
                              <select 
                                required 
                                value={formData.tipoVia || ''} 
                                onChange={e => setFormData({...formData, tipoVia: e.target.value})} 
                                className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100"
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
                            <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-slate-300">Nombre de la Vía *</label>
                              <input 
                                type="text" 
                                required 
                                value={formData.nombreVia || ''} 
                                onChange={e => setFormData({...formData, nombreVia: e.target.value})} 
                                placeholder="Ej: Larco, Bolognesi, etc."
                                className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300">N.º de Dirección *</label>
                              <input 
                                type="text" 
                                required 
                                value={formData.numeroDireccion || ''} 
                                onChange={e => setFormData({...formData, numeroDireccion: e.target.value})} 
                                placeholder="Ej: 123, S/N, Mz A Lt 5"
                                className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300">Sector / Barrio / Urbanización *</label>
                              <input 
                                type="text" 
                                required 
                                value={formData.sector || ''} 
                                onChange={e => setFormData({...formData, sector: e.target.value})} 
                                placeholder="Ej: Sector Alto, Barrio San José"
                                className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-300">Referencia (Opcional)</label>
                            <input 
                              type="text" 
                              value={formData.referenciaDireccion || ''} 
                              onChange={e => setFormData({...formData, referenciaDireccion: e.target.value})} 
                              placeholder="Ej: Costado del parque, portón azul"
                              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-300">Teléfono</label>
                            <input type="text" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300" title="Número del medidor asociado">N° Medidor (Opcional)</label>
                            <input type="text" value={formData.numeroMedidor || ''} onChange={e => setFormData({...formData, numeroMedidor: e.target.value})} placeholder="Ej: MED-123" className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" />
                          </div>
                          <div title={editingId ? "El tipo de cliente general no se puede cambiar aquí. Utilice 'Hacer Socio' en los suministros específicos." : ""}>
                            <label className="block text-sm font-medium text-slate-300">Tipo de Cliente General</label>
                            <select disabled={!!editingId} value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value as any})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50">
                              <option value="USUARIO">USUARIO (S/ {settings?.costoUsuario?.toFixed(2) || '0.30'}/kWh)</option>
                              <option value="SOCIO">SOCIO (S/ {settings?.costoSocio?.toFixed(2) || '0.20'}/kWh)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300">Tipo de Servicio</label>
                            <select value={formData.faseSuministro || 'MONOFASICO'} onChange={e => setFormData({...formData, faseSuministro: e.target.value as any})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100">
                              <option value="MONOFASICO">Monofásico</option>
                              <option value="TRIFASICO">Trifásico</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-300">Estado</label>
                            <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value as any})} className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100">
                              <option value="ACTIVO">ACTIVO</option>
                              <option value="INACTIVO">INACTIVO</option>
                              <option value="CORTADO">CORTADO</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <Button type="submit" className="w-full sm:ml-3 sm:w-auto">
                    {editingId ? 'Actualizar' : 'Guardar Registro'}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeModal} className="mt-3 w-full sm:mt-0 sm:w-auto">
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Transfer Supply */}
      {isTransferModalOpen && transferState.client && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setIsTransferModalOpen(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!transferState.supplyCode) {
                  return toast.error("Debe seleccionar un suministro.");
                }
                
                let finalToClientId = transferState.toClientId;
                
                if (transferState.mode === 'NEW') {
                   if (!transferState.newClientData.nombres && transferState.newClientData.tipoPersona === 'PERSONA') {
                      return toast.error("Debe ingresar nombres.");
                   }
                   if (!transferState.newClientData.dni) {
                      return toast.error("Debe ingresar DNI/RUC.");
                   }
                   const dniExists = clients.some(c => c.dni === transferState.newClientData.dni);
                   if (dniExists) {
                      return toast.error("El DNI/RUC ya se encuentra registrado.");
                   }
                } else {
                  if (!transferState.toClientId) {
                    return toast.error("Debe seleccionar un cliente de destino.");
                  }
                  if (transferState.client?.id === transferState.toClientId) {
                    return toast.error("El cliente de destino no puede ser el mismo que el actual.");
                  }
                }

                const confirmTransfer = await confirm({
                  title: 'Transferir Suministro',
                  message: '¿Está seguro de querer transferir la titularidad de este suministro? Todo el historial pasará al nuevo titular.',
                  type: 'warning',
                  confirmLabel: 'Transferir'
                });
                if (!confirmTransfer) {
                  return;
                }
                
                try {
                  if (transferState.mode === 'NEW') {
                     const createdClient = await addClient({
                       ...transferState.newClientData,
                       apellidos: transferState.newClientData.apellidos?.trim() || '',
                       codigoSuministro: '',
                       suministros: [],
                     });
                     finalToClientId = createdClient.id;
                  }
                  // Transfer after potentially creating the new client
                  await transferSupply(transferState.client!.id, finalToClientId, transferState.supplyCode);

                  // Standardize transaction tracking & receipts integration
                  const selectedClientRaw = clients.find(c => c.id === finalToClientId);
                  const destClientInfo = selectedClientRaw || {
                    id: finalToClientId,
                    nombres: transferState.newClientData.nombres,
                    apellidos: transferState.newClientData.apellidos?.trim() || '',
                    dni: transferState.newClientData.dni,
                    tipo: transferState.newClientData.tipo,
                    direccion: transferState.newClientData.direccion,
                    suministros: [transferState.supplyCode]
                  };

                  const actualTx = await addTransaction({
                    tipo: 'INGRESO',
                    categoria: 'TRANSFERENCIA',
                    monto: Number(transferState.monto || 0),
                    descripcion: transferState.observacion || `Cambio de Titularidad - Suministro ${normalizeSupplyCode(transferState.supplyCode)}`,
                    clientId: finalToClientId,
                    codigoSuministro: normalizeSupplyCode(transferState.supplyCode),
                    comprobante: '',
                    referencia: `Transferencia Suministro: ${normalizeSupplyCode(transferState.supplyCode)}`,
                    metodoPago: 'EFECTIVO'
                  });

                  generateGeneralPaymentReceiptPDF(actualTx, destClientInfo as any);
                  toast.success('Suministro transferido con éxito.');
                  setIsTransferModalOpen(false);
                } catch(error: any) {
                  toast.error(error.message || "Ocurrió un error en la transferencia.");
                }
              }}>
                <div className="bg-[#0B0E14] px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
                  <h3 className="text-lg leading-6 font-medium text-slate-100 mb-4 text-purple-400">
                    Cambio de Titularidad
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Cliente Original</label>
                      <input type="text" readOnly disabled className="mt-1 block w-full py-2 px-3 border border-slate-700 bg-slate-800 rounded-md text-slate-300 sm:text-sm" value={transferState.client.nombre || `${transferState.client.nombres} ${transferState.client.apellidos}`} />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Suministro a transferir</label>
                      <select 
                        className="mt-1 block w-full py-2 px-3 border border-slate-700 bg-[#0B0E14] rounded-md text-slate-100 sm:text-sm focus:ring-purple-500 focus:border-purple-500"
                        value={transferState.supplyCode}
                        onChange={(e) => setTransferState({ ...transferState, supplyCode: e.target.value, observacion: `CAMBIO DE TITULARIDAD - SUMINISTRO: ${normalizeSupplyCode(e.target.value)}` })}
                        required
                      >
                        {transferState.client.suministros?.map(s => (
                           <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex space-x-4 border-b border-slate-800 pb-2">
                       <label className="inline-flex items-center">
                         <input type="radio" className="form-radio text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-600" 
                           checked={transferState.mode === 'EXISTING'} 
                           onChange={() => setTransferState({ ...transferState, mode: 'EXISTING', toClientId: '' })} 
                         />
                         <span className="ml-2 text-sm text-slate-300">Cliente Existente</span>
                       </label>
                       <label className="inline-flex items-center">
                         <input type="radio" className="form-radio text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-600" 
                           checked={transferState.mode === 'NEW'} 
                           onChange={() => setTransferState({ ...transferState, mode: 'NEW' })} 
                         />
                         <span className="ml-2 text-sm text-slate-300">Registrar Nuevo Titular</span>
                       </label>
                    </div>

                    {transferState.mode === 'EXISTING' ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Buscar y Seleccionar Nuevo Titular</label>
                        <select 
                          className="mt-1 block w-full py-2 px-3 border border-slate-700 bg-[#0B0E14] rounded-md text-slate-100 sm:text-sm focus:ring-purple-500 focus:border-purple-500 max-w-full overflow-hidden text-ellipsis"
                          value={transferState.toClientId}
                          onChange={(e) => setTransferState({ ...transferState, toClientId: e.target.value })}
                          required={transferState.mode === 'EXISTING'}
                        >
                          <option value="">-- Seleccione el cliente destinatario --</option>
                          {clients.filter(c => c.id !== transferState.client?.id && c.estado !== 'INACTIVO').sort((a,b) => ((a.nombre || a.apellidos || '') < (b.nombre || b.apellidos || '') ? -1 : 1)).map(c => {
                             const totalSups = c.suministros?.length || (c.codigoSuministro ? 1 : 0);
                             return (
                               <option key={c.id} value={c.id}>
                                 {c.nombre || `${c.apellidos}, ${c.nombres}`} ({c.dni}) {totalSups > 0 ? ` - Tiene ${totalSups} suministro(s)` : ''}
                               </option>
                             );
                          })}
                        </select>
                        {transferState.toClientId && (
                          <div className="mt-2 text-xs text-slate-400 bg-slate-800/50 p-2 rounded border border-slate-700">
                             { (() => {
                                 const dest = clients.find(c => c.id === transferState.toClientId);
                                 if(!dest) return null;
                                 const sums = dest.suministros?.length ? dest.suministros.join(', ') : dest.codigoSuministro;
                                 return dest.suministros?.length || dest.codigoSuministro 
                                   ? `ℹ️ Atención: Cliente seleccionado tiene suministros registrados: ${sums}` 
                                   : '✅ Cliente seleccionado no tiene suministros registrados actualmente.';
                             })() }
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 bg-slate-800/20 border border-slate-700 rounded-md">
                         <h4 className="text-sm font-medium text-purple-400 mb-2">Datos del Nuevo Titular</h4>
                         <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="block text-xs font-medium text-slate-400">Tipo de Persona</label>
                             <select 
                               className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:ring-purple-500 focus:border-purple-500 outline-none"
                               value={transferState.newClientData.tipoPersona}
                               onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, tipoPersona: e.target.value as any }})}
                             >
                               <option value="PERSONA">Persona Natural</option>
                               <option value="EMPRESA">Empresa</option>
                             </select>
                           </div>
                           <div>
                             <label className="block text-xs font-medium text-slate-400">{transferState.newClientData.tipoPersona === 'EMPRESA' ? 'RUC' : 'DNI'}</label>
                             <input 
                               type="text" required 
                               maxLength={transferState.newClientData.tipoPersona === 'EMPRESA' ? 11 : 8}
                               className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:ring-purple-500 focus:border-purple-500 outline-none"
                               value={transferState.newClientData.dni}
                               onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, dni: e.target.value }})}
                             />
                           </div>
                         </div>
                         {transferState.newClientData.tipoPersona === 'EMPRESA' ? (
                           <div>
                             <label className="block text-xs font-medium text-slate-400">Razón Social</label>
                             <input type="text" required className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm outline-none focus:ring-purple-500 focus:border-purple-500"
                                    value={transferState.newClientData.nombres}
                                    onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, nombres: e.target.value }})}
                             />
                           </div>
                         ) : (
                           <div className="grid grid-cols-2 gap-3">
                             <div>
                               <label className="block text-xs font-medium text-slate-400">Nombres</label>
                               <input type="text" required className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm outline-none focus:ring-purple-500 focus:border-purple-500"
                                      value={transferState.newClientData.nombres}
                                      onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, nombres: e.target.value }})}
                               />
                             </div>
                             <div>
                               <label className="block text-xs font-medium text-slate-400">Apellidos</label>
                               <input type="text" required className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm outline-none focus:ring-purple-500 focus:border-purple-500"
                                      value={transferState.newClientData.apellidos}
                                      onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, apellidos: e.target.value }})}
                               />
                             </div>
                           </div>
                         )}
                         <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-400">Teléfono</label>
                              <input type="tel" className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm outline-none focus:ring-purple-500 focus:border-purple-500"
                                     value={transferState.newClientData.telefono}
                                     onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, telefono: e.target.value }})}
                              />
                            </div>
                            <div>
                               <label className="block text-xs font-medium text-slate-400">Tipo Usuario</label>
                               <select 
                                 className="mt-1 w-full py-1.5 px-2 bg-slate-900 border border-slate-700 rounded text-slate-200 text-sm focus:ring-purple-500 focus:border-purple-500 outline-none"
                                 value={transferState.newClientData.tipo}
                                 onChange={(e) => setTransferState({ ...transferState, newClientData: { ...transferState.newClientData, tipo: e.target.value as any }})}
                               >
                                 <option value="USUARIO">USUARIO</option>
                                 <option value="SOCIO">SOCIO (Comunero)</option>
                               </select>
                            </div>
                         </div>
                      </div>
                    )}
                    
                     {/* Detalles de Cobro por Transferencia */}
                     <div className="bg-slate-800/30 p-3 rounded-md border border-slate-800/50 space-y-3 mt-3">
                       <div className="text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1">Cobro por Trámite de Transferencia</div>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                         <div>
                           <label className="block text-xs font-medium text-slate-400">Monto del Trámite (S/)</label>
                           <input 
                             type="number" 
                             step="0.10" 
                             min="0" 
                             className="mt-1 w-full py-1.5 px-2 bg-[#0B0E14] border border-slate-700 rounded text-emerald-400 font-bold text-sm outline-none focus:ring-purple-500 focus:border-purple-500"
                             value={transferState.monto || 0}
                             onChange={(e) => setTransferState({ ...transferState, monto: Number(e.target.value) })}
                           />
                         </div>
                         <div>
                           <label className="block text-xs font-medium text-slate-400">Detalle / Concepto</label>
                           <input 
                             type="text" 
                             required
                             className="mt-1 w-full py-1.5 px-2 bg-[#0B0E14] border border-slate-700 rounded text-slate-200 text-xs outline-none focus:ring-purple-500 focus:border-purple-500"
                             value={transferState.observacion || ''}
                             onChange={(e) => setTransferState({ ...transferState, observacion: e.target.value })}
                           />
                         </div>
                       </div>
                     </div>

                     <p className="mt-2 text-xs text-amber-500 bg-amber-500/10 p-2 rounded">⚠️ Se transferirá todo el historial de lecturas, consumos y facturación asociada al suministro elegido.</p>
                  </div>
                </div>
                <div className="bg-slate-900/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-800">
                  <Button type="submit" className="w-full sm:ml-3 sm:w-auto bg-purple-600 hover:bg-purple-700 text-white">
                    Confirmar Cambio
                  </Button>
                  <Button type="button" onClick={() => setIsTransferModalOpen(false)} variant="outline" className="mt-3 w-full sm:mt-0 sm:w-auto text-slate-300 border-slate-600 hover:bg-slate-800">
                    Cancelar
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
