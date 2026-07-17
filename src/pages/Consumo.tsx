import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Check, FileText, Download, Upload, AlertCircle, Zap, Receipt, Camera, Edit2, X, Eye, Filter, Search, RefreshCw, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Button, Card, CardContent, Badge, Pagination } from '../components/ui';
import { formatCurrency, normalizeSearchText, getExonerationClassification, genericCompare } from '../lib/utils';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Consumption } from '../store/types';
import { toast } from 'react-hot-toast';
import Recibos from './Recibos';

export default function Consumo() {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useConfirm();
  const { clients, consumptions, addConsumption, updateConsumption, deleteConsumption, settings, userRole, suppliesInfo, user, comites } = useAppContext();
  const [historyClientSuministro, setHistoryClientSuministro] = useState<{ clientId: string, codigoSuministro: string, clientName: string } | null>(null);
  const [editingConsumption, setEditingConsumption] = useState<Consumption | null>(null);
  const [evidenciaFileBase64, setEvidenciaFileBase64] = useState<string>('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedEvidenceUrl, setSelectedEvidenceUrl] = useState<string | null>(null);

  const [mainView, setMainView] = useState<'FACTURACION' | 'BUSCAR_RECIBO'>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') === 'recibos' || params.has('clientId') || params.has('supplyCode') ? 'BUSCAR_RECIBO' : 'FACTURACION';
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'recibos' || params.has('clientId') || params.has('supplyCode')) {
      setMainView('BUSCAR_RECIBO');
    } else {
      setMainView('FACTURACION');
    }
  }, [location.search]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMes, setSelectedMes] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  
  const handleAnularRecibo = (cons: Consumption) => {
    if (cons.estadoPago !== 'PENDIENTE') {
      toast.error('Solo se pueden anular recibos en estado PENDIENTE.');
      return;
    }
    const motivo = window.prompt("Ingrese el motivo de la anulación (Mecanismo de Auditoría):");
    if (motivo) {
      if (motivo.length < 5) {
        toast.error('El motivo debe ser más detallado y descriptivo.');
        return;
      }
      deleteConsumption(cons.id, motivo).then(() => {
        toast.success('Facturación anulada y lectura eliminada.');
      });
    }
  };

  const handleEditClick = (cons: Consumption) => {
    const hasNewer = consumptions.some(
      c => c.codigoSuministro === cons.codigoSuministro && c.mes > cons.mes
    );
    if (hasNewer) {
      toast.error(
        "No es posible editar esta lectura porque existen períodos posteriores registrados para este suministro. Para modificar esta lectura, primero deben corregirse o eliminarse los períodos posteriores según las políticas establecidas.",
        { duration: 7000 }
      );
      return;
    }

    setEditingConsumption(cons);
    const client = clients.find(c => c.id === cons.clientId);
    const clientLabel = client ? (client.nombre ? client.nombre : `${client.nombres || ''} ${client.apellidos || ''}`) : 'Cliente';
    const supplyLabel = `${cons.codigoSuministro} - ${clientLabel}`;
    setClientSearch(supplyLabel);
    setFormData({
      clientAndSuministro: `${cons.clientId}|${cons.codigoSuministro}`,
      lecturaAnterior: (cons.lecturaAnterior ?? 0).toString(),
      lecturaActual: (cons.lecturaActual ?? 0).toString()
    });
    setSelectedMes(cons.mes);
    setEvidenciaFileBase64(cons.evidenciaFoto || '');
    setJustificacion(cons.observacion || '');
    setIsModalOpen(true);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, seleccione un archivo de imagen (JPG, PNG, GIF, etc.).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setEvidenciaFileBase64(e.target.result as string);
        toast.success(`Foto cargada con éxito.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const [clientSearch, setClientSearch] = useState('');
  const [showSuministroDropdown, setShowSuministroDropdown] = useState(false);

  // Advanced search filters
  const [searchSupplyCode, setSearchSupplyCode] = useState('');
  const [searchDniRuc, setSearchDniRuc] = useState('');
  const [searchName, setSearchName] = useState('');

  const clearFilters = () => {
    setSearchSupplyCode('');
    setSearchDniRuc('');
    setSearchName('');
    setClientSearch('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConsumption(null);
    setEvidenciaFileBase64('');
    setClientSearch('');
    setFormData({ clientAndSuministro: '', lecturaAnterior: '', lecturaActual: '' });
    setJustificacion('');
    clearFilters();
  };

  const [formData, setFormData] = useState({
    clientAndSuministro: '',
    lecturaAnterior: '',
    lecturaActual: ''
  });
  const [justificacion, setJustificacion] = useState('');

  const selectedClient = formData.clientAndSuministro ? clients.find(c => c.id === formData.clientAndSuministro.split('|')[0]) : undefined;
  const selectedClientConsumptions = selectedClient 
    ? consumptions.filter(c => c.clientId === selectedClient.id && c.codigoSuministro === formData.clientAndSuministro.split('|')[1]).sort((a,b) => a.mes.localeCompare(b.mes))
    : [];
  
  const targetMonth = editingConsumption ? editingConsumption.mes : selectedMes;
  const priorConsumptions = selectedClientConsumptions
    .filter(c => c.mes < targetMonth)
    .sort((a,b) => a.mes.localeCompare(b.mes));

  const immediatelyAnteriorReading = priorConsumptions.length > 0
    ? priorConsumptions[priorConsumptions.length - 1]
    : undefined;

  const isFirstReading = !immediatelyAnteriorReading;

  const currentLecturaAnterior = immediatelyAnteriorReading 
    ? (immediatelyAnteriorReading.lecturaActual ?? 0).toString()
    : (editingConsumption ? (editingConsumption.lecturaAnterior ?? 0).toString() : formData.lecturaAnterior);

  const currentKwh = Math.max(0, Number(formData.lecturaActual) - Number(currentLecturaAnterior));

  let averageKwh = 0;
  if (priorConsumptions.length > 0) {
    const pastKwhs = priorConsumptions.map(c => c.kwh).filter(kwh => kwh != null) as number[];
    if (pastKwhs.length > 0) {
      averageKwh = pastKwhs.reduce((a, b) => a + b, 0) / pastKwhs.length;
    }
  }

  const getLecturaAtypicalReasons = (): string[] => {
    const reasons: string[] = [];
    if (!formData.lecturaActual) return reasons;
    
    const actual = Number(formData.lecturaActual);
    const anterior = Number(currentLecturaAnterior);
    
    if (actual < anterior) {
      reasons.push('Lectura actual es menor que la anterior registrada (un retroceso de medidor o error de digitación).');
    }
    
    if (priorConsumptions.length > 0 && averageKwh > 0 && formData.lecturaActual !== '') {
      const variationThreshold = settings?.porcentajeVariacion || 50; // por defecto 50%
      const upperLimit = averageKwh * (1 + variationThreshold / 100);
      const lowerLimit = averageKwh * (1 - variationThreshold / 100);
      
      if (currentKwh > upperLimit) {
        reasons.push(`Consumo calculado excesivamente alto (${currentKwh} kWh) respecto a su promedio histórico de ${averageKwh.toFixed(1)} kWh (Variación > ${variationThreshold}%).`);
      } else if (currentKwh < lowerLimit) {
        reasons.push(`Consumo calculado excesivamente bajo (${currentKwh} kWh) respecto a su promedio histórico de ${averageKwh.toFixed(1)} kWh (Variación > ${variationThreshold}%).`);
      }
    }
    
    return reasons;
  };

  const atypicalReasons = getLecturaAtypicalReasons();
  const isAtypical = atypicalReasons.length > 0;

  const ultimaLectura = selectedClientConsumptions.length > 0 ? selectedClientConsumptions[selectedClientConsumptions.length - 1] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientAndSuministro || !formData.lecturaActual || (isFirstReading && !formData.lecturaAnterior)) return;

    const actualNum = Number(formData.lecturaActual);
    const anteriorNum = Number(currentLecturaAnterior);
    if (actualNum < anteriorNum) {
      toast.error(`La secuencia cronológica de lecturas no permite que la lectura actual (${actualNum}) sea menor que la anterior (${anteriorNum}).`);
      return;
    }

    const reasons = getLecturaAtypicalReasons();
    const isAtypicalReading = reasons.length > 0;

    if (editingConsumption) {
      if (!justificacion.trim()) {
        toast.error('Debe ingresar un motivo/justificación en la observación para modificar esta lectura.');
        return;
      }
    } else {
      if (isAtypicalReading) {
        if (!evidenciaFileBase64) {
          toast.error('La captura de fotografía del medidor es obligatoria al detectarse una lectura atípica.');
          return;
        }
        if (!justificacion.trim()) {
          toast.error('Debe ingresar una observación o justificación para registrar esta lectura atípica.');
          return;
        }
      }
    }

    const finalObservacion = justificacion.trim() || (isAtypicalReading ? reasons.join(' | ') : undefined);
    const [clientId, codigoSuministro] = formData.clientAndSuministro.split('|');

    // MODO EDICIÓN
    if (editingConsumption) {
      const saveConfirmed = await confirm({
        title: 'Modificar Lectura',
        message: `¿Está seguro de modificar la lectura para el periodo ${selectedMes}?\nConsumo calculado: ${currentKwh} kWh`,
        type: 'confirm',
        confirmLabel: 'Modificar'
      });
      if (!saveConfirmed) return;

      try {
        await updateConsumption(editingConsumption.id, {
          kwh: currentKwh,
          lecturaAnterior: Number(currentLecturaAnterior),
          lecturaActual: Number(formData.lecturaActual),
          evidenciaFoto: evidenciaFileBase64 || undefined,
          observacion: finalObservacion || null,
          fechaEdicion: new Date().toISOString(),
          editedBy: user?.email || 'Sistema'
        });
        
        toast.success('Lectura modificada con éxito.');
        setIsModalOpen(false);
        setEditingConsumption(null);
        setFormData({ clientAndSuministro: '', lecturaAnterior: '', lecturaActual: '' });
        setClientSearch('');
        setEvidenciaFileBase64('');
        setJustificacion('');
      } catch (err: any) {
        toast.error(err.message || 'Ocurrió un error al modificar la lectura.');
      }
      return;
    }

    // MODO REGISTRO NUEVO
    if (selectedMes >= new Date().toISOString().slice(0, 7)) {
      toast.error('El periodo de lectura debe ser un mes anterior al actual.');
      return;
    }

    const hasLaterReading = consumptions.some(c => c.codigoSuministro === codigoSuministro && c.mes > selectedMes);
    if (hasLaterReading) {
      toast.error(`No puede registrar una lectura para ${selectedMes} porque ya existe una lectura registrada en un mes posterior para el suministro ${codigoSuministro}.`);
      return;
    }

    const exists = consumptions.some(c => c.codigoSuministro === codigoSuministro && c.mes === selectedMes);
    if (exists) {
      toast.error(`Ya existe una lectura para el suministro ${codigoSuministro} en el mes ${selectedMes}.`);
      return;
    }

    const saveConfirmed = await confirm({
      title: isAtypicalReading ? '⚠ Registrar Lectura Atípica' : 'Guardar Lectura',
      message: isAtypicalReading 
        ? `Se ha clasificado como Lectura Atípica por: \n${reasons.map(r => `• ${r}`).join('\n')}\n\n¿Desea registrarla con la foto y la justificación ingresadas?`
        : `¿Está seguro de guardar la lectura para el periodo ${selectedMes}?\nConsumo calculado: ${currentKwh} kWh`,
      type: isAtypicalReading ? 'warning' : 'confirm',
      confirmLabel: 'Guardar'
    });
    if (!saveConfirmed) return;

    try {
      await addConsumption({
        clientId,
        codigoSuministro,
        kwh: currentKwh,
        lecturaAnterior: Number(currentLecturaAnterior),
        lecturaActual: Number(formData.lecturaActual),
        fechaLectura: new Date().toISOString(),
        mes: selectedMes,
        evidenciaFoto: evidenciaFileBase64 || undefined,
        observacion: finalObservacion,
        createdBy: user?.email || 'Sistema'
      });
      
      toast.success('Lectura registrada con éxito.');
      setFormData({ clientAndSuministro: '', lecturaAnterior: '', lecturaActual: '' });
      setClientSearch('');
      setEvidenciaFileBase64('');
      setJustificacion('');
      setShowSuministroDropdown(false);
      setIsModalOpen(false);
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 100);
    } catch(err: any) {
      console.error('Error during consumption registration:', err);
      const errMessage = err instanceof Error ? err.message : String(err);
      toast.error(`Error al registrar la lectura: ${errMessage || 'Error desconocido'}`);
    }
  };

    const getDebtInfo = (clientId: string, codigoSuministro: string, currentMes: string, hasPendingCurrent: boolean = false) => {
    const previousUnpaid = consumptions
      .filter(c => 
        c.clientId === clientId && 
        c.codigoSuministro === codigoSuministro && 
        c.estadoPago === 'PENDIENTE' &&
        c.mes < currentMes
      )
      .sort((a, b) => a.mes.localeCompare(b.mes));
    const totalDeuda = previousUnpaid.reduce((acc, c) => acc + c.montoCalculado, 0);
    const monthsOwned = previousUnpaid.length + (hasPendingCurrent ? 1 : 0);
    const settingsCostoReconexion = settings?.costoReconexion || 0;
    return {
      totalDeuda,
      monthsOwned,
      previousUnpaid,
      warning: monthsOwned >= 3 
        ? `AVISO DE CORTE: EL SERVICIO SE ENCUENTRA APTO PARA CORTE POR DEUDA DE 3 MESES O MÁS.${settingsCostoReconexion > 0 ? `\nCosto por reconexión: S/ ${settingsCostoReconexion.toFixed(2)}` : ''}` 
        : ''
    };
  };

  const handleExportConsumosExcel = (consumptionsList: Consumption[]) => {
    if (consumptionsList.length === 0) return;
    const exportData = consumptionsList.map(cons => {
      const client = clients.find(c => c.id === cons.clientId);
      const clientName = client?.nombre ? client.nombre : `${client?.nombres || ''} ${client?.apellidos || ''}`;
      const [yearPart, monthPart] = cons.mes.split('-');
      const displayReciboNo = cons.reciboNo || `REC-${yearPart}-${monthPart}-${cons.id.slice(-4).toUpperCase()}`;
      return {
        'Nro Recibo': displayReciboNo,
        Periodo: cons.mes,
        Cliente: clientName,
        DNI: client?.dni,
        'Tipo Cliente': client?.tipo,
        Suministro: cons.codigoSuministro,
        'Consumo (kWh)': cons.kwh,
        'Monto a Pagar (S/)': cons.montoCalculado,
        Estado: cons.estadoPago
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consumos");
    XLSX.writeFile(wb, `Reporte_Consumos_${selectedMes}.xlsx`);
  };

  const handleExportConsumosPDF = (consumptionsList: Consumption[]) => {
    if (consumptionsList.length === 0) {
      toast.error('No existen datos disponibles para generar el PDF.');
      return;
    }
    const toastId = toast.loading('Generando PDF...');
    try {
      const doc = new jsPDF();
    doc.text(`Reporte de Consumos - ${selectedMes}`, 14, 20);
    
    const tableData = consumptionsList.map(cons => {
      const client = clients.find(c => c.id === cons.clientId);
      const clientName = client?.nombre ? client.nombre : `${client?.nombres || ''} ${client?.apellidos || ''}`;
      const [yearPart, monthPart] = cons.mes.split('-');
      const displayReciboNo = cons.reciboNo || `REC-${yearPart}-${monthPart}-${cons.id.slice(-4).toUpperCase()}`;
      return [
        displayReciboNo,
        clientName,
        cons.codigoSuministro || '',
        cons.kwh?.toString() || '0',
        cons.montoCalculado.toFixed(2),
        cons.estadoPago
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['Nro Recibo', 'Cliente', 'Suministro', 'kWh', 'Monto', 'Estado']],
      body: tableData,
    });

      doc.save(`Reporte_Consumos_${selectedMes}.pdf`);
      toast.success('PDF generado y descargado con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF.', { id: toastId });
    }
  };

  const handleGenerateMassReceipts = () => {
    const toastId = toast.loading('Generando PDF masivo...');
    try {
      const suppliesToInvoice: any[] = [];
    
    clients.forEach(client => {
      if (client.estado !== 'ACTIVO' && client.estado !== 'CORTADO') return;
      
      const supplies = client.suministros?.length ? client.suministros : [client.codigoSuministro].filter(Boolean);
      
      supplies.forEach((sup) => {
        if (!sup) return;
        const currentReading = consumptions.find(c => c.clientId === client.id && c.codigoSuministro === sup && c.mes === selectedMes);
        const hasPendingCurrent = currentReading ? currentReading.estadoPago === 'PENDIENTE' : false;
        const debtInfo = getDebtInfo(client.id, sup, selectedMes, hasPendingCurrent);
        
        if (hasPendingCurrent || debtInfo.previousUnpaid.length > 0) {
          suppliesToInvoice.push({
            client,
            codigoSuministro: sup,
            currentReading,
            debtInfo
          });
        }
      });
    });

    if (suppliesToInvoice.length === 0) {
      toast.error('No existen datos disponibles para generar el PDF.');
      return;
    }

    // Sort by codigoSuministro
    suppliesToInvoice.sort((a, b) => a.codigoSuministro.localeCompare(b.codigoSuministro));

    const doc = new jsPDF({ format: 'a4' });
    let yOffset = 10;
    const maxH = 297;

    const formatCurrencyStr = (val: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);

    suppliesToInvoice.forEach((item, index) => {
      const { client, codigoSuministro, currentReading, debtInfo } = item;
      
      // -- CALCULATE DYNAMIC HEIGHT --
      const testDoc = new jsPDF({ format: 'a4' });
      const testTableBody: any[][] = [];
      if (currentReading && currentReading.estadoPago === 'PENDIENTE') {
        const isSocio = suppliesInfo?.find(s => s.codigo === codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
        const tarifaAplicada = client.faseSuministro === 'TRIFASICO' && (settings?.costoTrifasico || 0) > 0 
          ? (settings?.costoTrifasico || 0) 
          : isSocio ? (settings?.costoSocio || 0.2) : (settings?.costoUsuario || 0.3);
        const kwh = currentReading.kwh || 0;
        const minimoAplica = settings?.consumoMinimo !== undefined ? settings.consumoMinimo : 6;
        const esMinimo = kwh * tarifaAplicada < minimoAplica;
        testTableBody.push([
          'Consumo Eléctrico' + (esMinimo ? ` (Mín. S/ ${minimoAplica.toFixed(2)})` : ''),
          kwh.toString(), tarifaAplicada.toFixed(2), formatCurrencyStr(currentReading.montoCalculado)
        ]);
      }
      if (debtInfo.previousUnpaid && debtInfo.previousUnpaid.length > 0) {
        const numMeses = debtInfo.previousUnpaid.length;
        const textoDeuda = `Deuda Anterior (${numMeses} mes${numMeses === 1 ? '' : 'es'})`;
        testTableBody.push([
          { content: textoDeuda, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
          '-',
          '-', 
          { content: formatCurrencyStr(debtInfo.previousUnpaid.reduce((acc: any, unpaid: any) => acc + unpaid.montoCalculado, 0)), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }
        ]);
      }
      
      autoTable(testDoc, {
        startY: 39,
        head: [['Descripción', 'Cantidad (kWh)', 'Precio (S/)', 'Subtotal']],
        body: testTableBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1 },
        margin: { left: 14, right: 14 }
      });
      const estimatedHeight = ((testDoc as any).lastAutoTable?.finalY || 43) + 14; 
      // --------------------------------

      if (yOffset + estimatedHeight > maxH - 5) {
        doc.addPage();
        yOffset = 10;
      }

      const clientName = client.nombre ? client.nombre : `${client.nombres} ${client.apellidos}`;

      // Header
      doc.setFontSize(16);
      doc.text('Mini Central Hidroeléctrica Paccha', 14, yOffset + 6);

      if (debtInfo.warning) {
        doc.setFontSize(9);
        doc.setTextColor(220, 38, 38); // Red
        const extReconexion = (settings?.costoReconexion || 0).toFixed(2);
        doc.text('SERVICIO PARA CORTE', 196, yOffset + 6, { align: 'right' });
        doc.text(`Reconexión S/ ${extReconexion}`, 196, yOffset + 10, { align: 'right' });
        doc.setTextColor(0, 0, 0); // Reset
      }

      const [yearPart, monthPart] = selectedMes.split('-');
      const displayReciboNo = currentReading?.reciboNo || `REC-${yearPart}-${monthPart}-${currentReading?.id ? currentReading.id.slice(-4).toUpperCase() : '0000'}`;

      doc.setFontSize(10);
      doc.text(`Recibo: ${displayReciboNo} | Suministro: ${codigoSuministro} | Tipo: ${client.tipo}`, 14, yOffset + 12);
      
      const docState = currentReading ? currentReading.estadoPago : 'PENDIENTE';
      doc.setFontSize(9);
      doc.text(`Fecha Emisión: ${format(new Date(), 'dd MMM yyyy')} | Periodo: ${selectedMes} | Estado: ${docState}`, 14, yOffset + 18);

      // Client Info
      doc.setFontSize(10);
      const clientDniText = client.tipoPersona === 'EMPRESA' ? ` (RUC: ${client.dni})` : '';
      doc.text(`Cliente: ${clientName}${clientDniText}`, 14, yOffset + 23);
      doc.text(`Dirección: ${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}`, 14, yOffset + 28);
      
      // Consumos
      const allCons = consumptions
        .filter(c => c.clientId === client.id && c.codigoSuministro === codigoSuministro)
        .sort((a,b) => a.mes.localeCompare(b.mes));
      
      let calcLecturaAnterior = 0;
      let calcLecturaActual = 0;
      const currentKwh = currentReading ? currentReading.kwh || 0 : 0;
      
      if (currentReading) {
        if (currentReading.lecturaAnterior !== undefined && currentReading.lecturaActual !== undefined) {
           calcLecturaAnterior = currentReading.lecturaAnterior;
           calcLecturaActual = currentReading.lecturaActual;
        } else {
           const pastCons = allCons.filter(c => c.mes < selectedMes);
           const initialL = allCons.length > 0 && allCons[0].lecturaAnterior !== undefined ? allCons[0].lecturaAnterior : 0;
           calcLecturaAnterior = initialL + pastCons.reduce((acc, c) => acc + (c.kwh || 0), 0);
           calcLecturaActual = calcLecturaAnterior + currentKwh;
        }
      }

      doc.text(`Lectura actual: ${calcLecturaActual} kWh | Lectura anterior: ${calcLecturaAnterior} kWh`, 14, yOffset + 34);
      doc.text(`Consumo del mes: ${currentKwh} kWh`, 14, yOffset + 39);

      // Draw Chart
      const historyCons = consumptions
        .filter(c => c.clientId === client.id && c.codigoSuministro === codigoSuministro && c.mes <= selectedMes)
        .sort((a,b) => b.mes.localeCompare(a.mes))
        .slice(0, 6)
        .reverse();
      
      const chartX = 135;
      const chartY = yOffset + 18;
      const chartW = 60;
      const chartH = 18;
      
      doc.setFontSize(8);
      doc.text('Historial de Pagos (S/)', chartX, chartY - 2);
      doc.setDrawColor(200);
      doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH); // x-axis
      
      if (historyCons.length > 0) {
        const maxK = Math.max(...historyCons.map(c => c.montoCalculado || 0), 10);
        const barW = 6;
        const spacing = (chartW - (historyCons.length * barW)) / (historyCons.length + 1);
        
        const colors = [
          [59,130,246], [16,185,129], [245,158,11], [239,68,68],
          [139,92,246], [236,72,153], [6,182,212], [249,115,22],
          [168,85,247], [20,184,166], [234,179,8], [244,63,94]
        ];
        
        historyCons.forEach((hc, i) => {
          const x = chartX + spacing + i * (barW + spacing);
          const barH = ((hc.montoCalculado || 0) / maxK) * chartH;
          const y = chartY + chartH - barH;
          
          let mIndex = 0;
          if (hc.mes) {
            const parts = hc.mes.split('-');
            if (parts.length > 1) {
              mIndex = parseInt(parts[1], 10) - 1;
            }
          }
          const color = colors[mIndex] || [15, 23, 42];
          
          doc.setFillColor(color[0], color[1], color[2]);
          doc.rect(x, y, barW, barH, 'F');
          
          doc.setFontSize(6);
          doc.text((hc.montoCalculado || 0).toFixed(0).toString(), x + barW/2, y - 1, { align: 'center' });
          const mShort = hc.mes ? new Date(`${hc.mes}-02`).toLocaleDateString('es', {month:'short'}).substring(0,3) : '';
          doc.text(mShort, x + barW/2, chartY + chartH + 3, { align: 'center' });
        });
      }

      // Table
      const tableBody: any[][] = [];
      let totalMontoCalculado = 0;

      if (currentReading && currentReading.estadoPago === 'PENDIENTE') {
        const isSocio = suppliesInfo?.find(s => s.codigo === codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
        const tarifaAplicada = client.faseSuministro === 'TRIFASICO' && (settings?.costoTrifasico || 0) > 0 
          ? (settings?.costoTrifasico || 0) 
          : isSocio ? (settings?.costoSocio || 0.2) : (settings?.costoUsuario || 0.3);
        const kwh = currentReading.kwh || 0;
        const minimoAplica = settings?.consumoMinimo !== undefined ? settings.consumoMinimo : 6;
        const esMinimo = kwh * tarifaAplicada < minimoAplica;
        tableBody.push([
          'Consumo Eléctrico' + (esMinimo ? ` (Mín. S/ ${minimoAplica.toFixed(2)})` : ''),
          kwh.toString(),
          tarifaAplicada.toFixed(2),
          formatCurrencyStr(currentReading.montoCalculado)
        ]);
        totalMontoCalculado += currentReading.montoCalculado;
      }

      if (debtInfo.previousUnpaid && debtInfo.previousUnpaid.length > 0) {
        const totalDeudaAnterior = debtInfo.previousUnpaid.reduce((acc: any, unpaid: any) => acc + unpaid.montoCalculado, 0);
        const numMeses = debtInfo.previousUnpaid.length;
        const textoDeuda = `Deuda Anterior (${numMeses} mes${numMeses === 1 ? '' : 'es'})`;
        tableBody.push([
          { content: textoDeuda, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
          '-',
          '-',
          { content: formatCurrencyStr(totalDeudaAnterior), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }
        ]);
      }

      const totalAPagar = totalMontoCalculado + debtInfo.totalDeuda;

      autoTable(doc, {
        startY: yOffset + 44,
        head: [['Descripción', 'Cantidad (kWh)', 'Precio (S/)', 'Subtotal']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8, cellPadding: 1 },
        margin: { left: 14, right: 14 }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || yOffset + 43;
      doc.setFontSize(16);
      doc.text(`Total a Pagar: ${formatCurrencyStr(totalAPagar)}`, 196, finalY + 6, { align: 'right' });
      
      const [yearStr, monthStr] = selectedMes.split('-');
      const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      const monthName = new Date(`${selectedMes}-02`).toLocaleDateString('es', { month: 'long' });
      const fechaVencimiento = `${lastDay} de ${monthName} del ${yearStr}`;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Fecha de Vencimiento: ${fechaVencimiento}`, 14, finalY + 5);
      doc.setFont('helvetica', 'normal');

      const currentReceiptBottom = finalY + 10;

      // Draw a cut line
      doc.setLineDashPattern([2, 2], 0);
      doc.line(10, currentReceiptBottom, 200, currentReceiptBottom);
      doc.setLineDashPattern([], 0); // reset

      yOffset = currentReceiptBottom + 4;
    });

      doc.save(`Recibos_Masivos_${selectedMes}.pdf`);
      toast.success('Recibos generados y descargados con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating mass receipts PDF:', error);
      toast.error('Error al generar los recibos.', { id: toastId });
    }
  };

  const handleGenerateReceipt = (cons: Consumption) => {
    const toastId = toast.loading('Generando recibo...');
    try {
      const client = clients.find(c => c.id === cons.clientId);
    if (!client) return;

    const clientName = client.nombre ? client.nombre : `${client.nombres} ${client.apellidos}`;

    const codSuministro = cons.codigoSuministro || client.codigoSuministro;
    const debtInfo = getDebtInfo(client.id, codSuministro || '', cons.mes, cons.estadoPago === 'PENDIENTE');

    // --- CALCULATE DYNAMIC HEIGHT ---
    const testDoc = new jsPDF({ format: 'a4' });
    const testTableBody: any[][] = [];
    const isSocio = suppliesInfo?.find(s => s.codigo === cons.codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
    const testTarifaAplicada = client.faseSuministro === 'TRIFASICO' && (settings?.costoTrifasico || 0) > 0 
      ? (settings?.costoTrifasico || 0) 
      : isSocio ? (settings?.costoSocio || 0.2) : (settings?.costoUsuario || 0.3);
    const testKwh = cons.kwh || 0;
    const testMinimoAplica = settings?.consumoMinimo !== undefined ? settings.consumoMinimo : 6;
    const testEsMinimo = testKwh * testTarifaAplicada < testMinimoAplica;
    const calcFormatCurrencyStr = (val: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val);
    testTableBody.push([
      'Consumo Eléctrico' + (testEsMinimo ? ` (Mín. S/ ${testMinimoAplica.toFixed(2)})` : ''),
      testKwh.toString(), testTarifaAplicada.toFixed(2), calcFormatCurrencyStr(cons.montoCalculado)
    ]);
    if (debtInfo.previousUnpaid && debtInfo.previousUnpaid.length > 0) {
      const numMeses = debtInfo.previousUnpaid.length;
      const textoDeuda = `Deuda Anterior (${numMeses} mes${numMeses === 1 ? '' : 'es'})`;
      testTableBody.push([
        { content: textoDeuda, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
        '-',
        '-', 
        { content: calcFormatCurrencyStr(debtInfo.previousUnpaid.reduce((acc: any, unpaid: any) => acc + unpaid.montoCalculado, 0)), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }
      ]);
    }
    autoTable(testDoc, {
      startY: 39,
      head: [['Descripción', 'Cantidad (kWh)', 'Precio (S/)', 'Subtotal']],
      body: testTableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1 },
      margin: { left: 14, right: 14 }
    });
    const estimatedHeight = ((testDoc as any).lastAutoTable?.finalY || 43) + 14; 
    // --------------------------------

    const doc = new jsPDF({ format: 'a4' });
    const maxH = 297;
    let yOffset = 10;
    
    // Auto page break just in case
    if (yOffset + estimatedHeight > maxH - 5) {
      doc.addPage();
      yOffset = 10;
    }

    // Header
    doc.setFontSize(16);
    doc.text('Mini Central Hidroeléctrica Paccha', 14, yOffset + 6);

    if (debtInfo.warning) {
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38); // Red
      const extReconexion = (settings?.costoReconexion || 0).toFixed(2);
      doc.text('SERVICIO PARA CORTE', 196, yOffset + 6, { align: 'right' });
      doc.text(`Reconexión S/ ${extReconexion}`, 196, yOffset + 10, { align: 'right' });
      doc.setTextColor(0, 0, 0); // Reset
    }

    const [yearPart, monthPart] = cons.mes.split('-');
    const displayReciboNo = cons.reciboNo || `REC-${yearPart}-${monthPart}-${cons.id.slice(-4).toUpperCase()}`;

    doc.setFontSize(10);
    doc.text(`Recibo: ${displayReciboNo} | Suministro: ${codSuministro} | Tipo: ${client.tipo}`, 14, yOffset + 12);
    
    doc.setFontSize(9);
    doc.text(`Fecha Emisión: ${format(new Date(), 'dd MMM yyyy')} | Periodo: ${cons.mes} | Estado: ${cons.estadoPago}`, 14, yOffset + 18);

    // Client Info
    doc.setFontSize(10);
    const clientDniText = client.tipoPersona === 'EMPRESA' ? ` (RUC: ${client.dni})` : '';
    doc.text(`Cliente: ${clientName}${clientDniText}`, 14, yOffset + 23);
    doc.text(`Dirección: ${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}`, 14, yOffset + 28);

    // Consumos
    const allCons = consumptions
      .filter(c => c.clientId === client.id && c.codigoSuministro === codSuministro)
      .sort((a,b) => a.mes.localeCompare(b.mes));
    
    let calcLecturaAnterior = 0;
    let calcLecturaActual = 0;
    const currentKwh = cons.kwh || 0;
    
    if (cons.lecturaAnterior !== undefined && cons.lecturaActual !== undefined) {
      calcLecturaAnterior = cons.lecturaAnterior;
      calcLecturaActual = cons.lecturaActual;
    } else {
      const pastCons = allCons.filter(c => c.mes < cons.mes);
      const initialL = allCons.length > 0 && allCons[0].lecturaAnterior !== undefined ? allCons[0].lecturaAnterior : 0;
      calcLecturaAnterior = initialL + pastCons.reduce((acc, c) => acc + (c.kwh || 0), 0);
      calcLecturaActual = calcLecturaAnterior + currentKwh;
    }

    doc.text(`Lectura actual: ${calcLecturaActual} kWh | Lectura anterior: ${calcLecturaAnterior} kWh`, 14, yOffset + 34);
    doc.text(`Consumo del mes: ${currentKwh} kWh`, 14, yOffset + 39);

    // Draw Chart
    const historyCons = consumptions
      .filter(c => c.clientId === client.id && c.codigoSuministro === codSuministro && c.mes <= cons.mes)
      .sort((a,b) => b.mes.localeCompare(a.mes))
      .slice(0, 6)
      .reverse();
    
    const chartX = 135;
    const chartY = yOffset + 18;
    const chartW = 60;
    const chartH = 18;
    
    doc.setFontSize(8);
    doc.text('Historial de Pagos (S/)', chartX, chartY - 2);
    doc.setDrawColor(200);
    doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH); // x-axis
    
    if (historyCons.length > 0) {
      const maxK = Math.max(...historyCons.map(c => c.montoCalculado || 0), 10);
      const barW = 6;
      const spacing = (chartW - (historyCons.length * barW)) / (historyCons.length + 1);
      
        const colors = [
          [59,130,246], [16,185,129], [245,158,11], [239,68,68],
          [139,92,246], [236,72,153], [6,182,212], [249,115,22],
          [168,85,247], [20,184,166], [234,179,8], [244,63,94]
        ];
        
        historyCons.forEach((hc, i) => {
          const x = chartX + spacing + i * (barW + spacing);
          const barH = ((hc.montoCalculado || 0) / maxK) * chartH;
          const y = chartY + chartH - barH;
          
          let mIndex = 0;
          if (hc.mes) {
            const parts = hc.mes.split('-');
            if (parts.length > 1) {
              mIndex = parseInt(parts[1], 10) - 1;
            }
          }
          const color = colors[mIndex] || [15, 23, 42];
          
          doc.setFillColor(color[0], color[1], color[2]);
          doc.rect(x, y, barW, barH, 'F');
        
        doc.setFontSize(6);
        doc.text((hc.montoCalculado || 0).toFixed(0).toString(), x + barW/2, y - 1, { align: 'center' });
        const mShort = hc.mes ? new Date(`${hc.mes}-02`).toLocaleDateString('es', {month:'short'}).substring(0,3) : '';
        doc.text(mShort, x + barW/2, chartY + chartH + 3, { align: 'center' });
      });
    }

    // Table
    const tableBody: any[][] = [];
    let totalMontoCalculado = 0;

    const singleClassification = getExonerationClassification(comites, codSuministro, cons.mes);
    if (cons && (cons.estadoPago === 'PENDIENTE' || cons.estadoPago === 'PAGADO')) {
      let desc = 'Consumo Eléctrico' + (testEsMinimo ? ` (Mín. S/ ${testMinimoAplica.toFixed(2)})` : '');
      if (singleClassification === 'EXONERATED') {
        desc = 'Consumo Eléctrico - Exonerado de pago por cargo en Comité Directivo';
      }
      tableBody.push([
        desc,
        currentKwh.toString(), testTarifaAplicada.toFixed(2), calcFormatCurrencyStr(cons.montoCalculado)
      ]);
      totalMontoCalculado += cons.montoCalculado;
    }

    if (debtInfo.previousUnpaid && debtInfo.previousUnpaid.length > 0) {
      const totalDeudaAnterior = debtInfo.previousUnpaid.reduce((acc, unpaid) => acc + unpaid.montoCalculado, 0);
      const numMeses = debtInfo.previousUnpaid.length;
      const textoDeuda = `Deuda Anterior (${numMeses} mes${numMeses === 1 ? '' : 'es'})`;
      tableBody.push([
        { content: textoDeuda, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
        '-',
        '-',
        { content: calcFormatCurrencyStr(totalDeudaAnterior), styles: { fontStyle: 'bold', textColor: [220, 38, 38] } }
      ]);
    }

    const totalAPagar = totalMontoCalculado + debtInfo.totalDeuda;

    autoTable(doc, {
      startY: yOffset + 44,
      head: [['Descripción', 'Cantidad (kWh)', 'Precio (S/)', 'Subtotal']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8, cellPadding: 1 },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || yOffset + 43;
    doc.setFontSize(16);
    doc.text(`Total a Pagar: ${calcFormatCurrencyStr(totalAPagar)}`, 196, finalY + 6, { align: 'right' });
    
    const [yearStr, monthStr] = cons.mes.split('-');
    const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const monthName = new Date(`${cons.mes}-02`).toLocaleDateString('es', { month: 'long' });
    const fechaVencimiento = `${lastDay} de ${monthName} del ${yearStr}`;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha de Vencimiento: ${fechaVencimiento}`, 14, finalY + 5);
    doc.setFont('helvetica', 'normal');

      doc.save(`Recibo_${clientName.replace(/\s+/g, '_')}_${cons.mes}.pdf`);
      toast.success('Recibo generado y descargado con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating receipt PDF:', error);
      toast.error('Error al generar el recibo.', { id: toastId });
    }
  };

  const [activeTab, setActiveTab] = useState<'LECTURAS' | 'DEUDAS'>('LECTURAS');

  const [consumoSortField, setConsumoSortField] = useState<string>('cliente');
  const [consumoSortDirection, setConsumoSortDirection] = useState<'asc' | 'desc'>('asc');

  const [supplySortField, setSupplySortField] = useState<string>('suministro');
  const [supplySortDirection, setSupplySortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSupplySort = (field: string) => {
    if (supplySortField === field) {
      setSupplySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSupplySortField(field);
      setSupplySortDirection('asc');
    }
  };

  const renderSupplySortIndicator = (field: string) => {
    if (supplySortField !== field) return null;
    return supplySortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  // Reset supply sorting state on filter changes
  useEffect(() => {
    setSupplySortDirection('asc');
  }, [searchSupplyCode, searchDniRuc, searchName, clientSearch, selectedMes]);


  // Helper to dynamically sort consumption results based on the search criteria
  const sortConsumptionsBySearch = (list: typeof consumptions, query: string) => {
    return [...list].sort((a, b) => {
      const clientA = clients.find(cl => cl.id === a.clientId);
      const clientB = clients.find(cl => cl.id === b.clientId);

      if (consumoSortField === 'cliente') {
        const nameA = clientA ? (clientA.nombre ? clientA.nombre : `${clientA.nombres || ''} ${clientA.apellidos || ''}`) : '';
        const nameB = clientB ? (clientB.nombre ? clientB.nombre : `${clientB.nombres || ''} ${clientB.apellidos || ''}`) : '';
        return genericCompare({ ...a, fullName: nameA }, { ...b, fullName: nameB }, 'fullName', consumoSortDirection);
      }
      if (consumoSortField === 'suministro') {
        const supA = a.codigoSuministro || clientA?.codigoSuministro || '';
        const supB = b.codigoSuministro || clientB?.codigoSuministro || '';
        return genericCompare({ ...a, sup: supA }, { ...b, sup: supB }, 'sup', consumoSortDirection);
      }
      if (consumoSortField === 'dni') {
        const dniA = clientA?.dni || '';
        const dniB = clientB?.dni || '';
        return genericCompare({ ...a, dni: dniA }, { ...b, dni: dniB }, 'dni', consumoSortDirection);
      }
      if (consumoSortField === 'consumo') {
        return genericCompare(a, b, 'kwh', consumoSortDirection);
      }
      if (consumoSortField === 'monto') {
        return genericCompare(a, b, 'montoTotal', consumoSortDirection);
      }
      if (consumoSortField === 'estado') {
        return genericCompare(a, b, 'estadoPago', consumoSortDirection);
      }
      if (consumoSortField === 'fecha') {
        return genericCompare(a, b, 'fechaLectura', consumoSortDirection);
      }
      
      if (!query) {
        return new Date(b.fechaLectura).getTime() - new Date(a.fechaLectura).getTime();
      }
      
      const trimmed = query.trim().toLowerCase();
      const isDniRuc = /^\d+$/.test(trimmed) || (trimmed.replace(/\D/g, '').length > trimmed.length / 2 && trimmed.length >= 6);
      const isSupply = trimmed.startsWith('sum') || (!trimmed.includes(' ') && /[a-z]/.test(trimmed) && /[0-9]/.test(trimmed));
      
      if (isDniRuc) {
        const dniA = clientA?.dni || '';
        const dniB = clientB?.dni || '';
        return dniA.localeCompare(dniB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (isSupply) {
        const supA = a.codigoSuministro || clientA?.codigoSuministro || '';
        const supB = b.codigoSuministro || clientB?.codigoSuministro || '';
        return supA.localeCompare(supB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        const nameA = clientA ? (clientA.nombre ? clientA.nombre : `${clientA.nombres || ''} ${clientA.apellidos || ''}`) : '';
        const nameB = clientB ? (clientB.nombre ? clientB.nombre : `${clientB.nombres || ''} ${clientB.apellidos || ''}`) : '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      }
    });
  };

  const handleConsumoSort = (field: string) => {
    if (consumoSortField === field) {
      setConsumoSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setConsumoSortField(field);
      setConsumoSortDirection('asc');
    }
  };

  const renderConsumoSortIndicator = (field: string) => {
    if (consumoSortField !== field) return null;
    return consumoSortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  // Filter consumptions by selected month
  const [tableSearch, setTableSearch] = useState('');

  // Reset sorting state to ascending on new search/tab changes
  useEffect(() => {
    setConsumoSortDirection('asc');
  }, [tableSearch, selectedMes, activeTab]);

  const filteredConsumptions = React.useMemo(() => {
    const rawList = consumptions.filter(c => {
      if (userRole === 'OPERATOR' && c.createdBy !== user?.email) return false;
      if (c.mes !== selectedMes) return false;
      if (!tableSearch) return true;
      const client = clients.find(cl => cl.id === c.clientId);
      if (!client) return false;
      const searchNormalized = normalizeSearchText(tableSearch);
      const rawFullName = client.nombre ? client.nombre : `${client.nombres || ''} ${client.apellidos || ''}`;
      const fullName = normalizeSearchText(rawFullName);
      const dni = normalizeSearchText(client.dni || '');
      const suministro = normalizeSearchText(c.codigoSuministro || '');

      return suministro.includes(searchNormalized) ||
             dni.includes(searchNormalized) ||
             fullName.includes(searchNormalized);
    });
    return sortConsumptionsBySearch(rawList, tableSearch);
  }, [consumptions, tableSearch, selectedMes, clients, userRole, user]);
  
  // All pending debts
  const pendingDebts = React.useMemo(() => {
    const rawList = consumptions.filter(c => {
      if (c.estadoPago !== 'PENDIENTE') return false;
      if (!tableSearch) return true;
      const client = clients.find(cl => cl.id === c.clientId);
      if (!client) return false;
      const searchNormalized = normalizeSearchText(tableSearch);
      const rawFullName = client.nombre ? client.nombre : `${client.nombres || ''} ${client.apellidos || ''}`;
      const fullName = normalizeSearchText(rawFullName);
      const dni = normalizeSearchText(client.dni || '');
      const suministro = normalizeSearchText(c.codigoSuministro || '');
      
      return suministro.includes(searchNormalized) ||
             dni.includes(searchNormalized) ||
             fullName.includes(searchNormalized);
    });
    return sortConsumptionsBySearch(rawList, tableSearch);
  }, [consumptions, tableSearch, clients]);

  const availableSupplies = React.useMemo(() => {
    let supplies: {
      id: string;
      sup: string;
      label: string;
      desc: string;
      client: any;
      lecturaAnterior: number;
      fechaUltimaLectura: string | null;
      readingStatus: 'PENDIENTE' | 'REGISTRADA' | 'VALIDADA';
      hasPeriodReading: boolean;
      periodReadingId: string | null;
    }[] = [];

    const filteredClients = clients.filter(c => c.estado === 'ACTIVO' || c.estado === 'CORTADO');

    filteredClients.forEach(c => {
      const clientSupplies = c.suministros?.length ? c.suministros : [c.codigoSuministro];
      clientSupplies.forEach(sup => {
        if (!sup) return;

        const rawFullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;
        const fullName = rawFullName;

        // Apply filters
        if (searchSupplyCode) {
          const normalizedSup = normalizeSearchText(sup);
          const normalizedQuery = normalizeSearchText(searchSupplyCode);
          if (!normalizedSup.includes(normalizedQuery)) return;
        }

        if (searchDniRuc) {
          const normalizedDni = normalizeSearchText(c.dni || '');
          const normalizedQuery = normalizeSearchText(searchDniRuc);
          if (!normalizedDni.includes(normalizedQuery)) return;
        }

        if (searchName) {
          const normalizedName = normalizeSearchText(fullName);
          const normalizedQuery = normalizeSearchText(searchName);
          if (!normalizedName.includes(normalizedQuery)) return;
        }

        const supplyInfo = (suppliesInfo || []).find(si => si.codigo === sup);
        const currentDireccion = supplyInfo?.direccion || c.direccion || '';

        if (clientSearch && !formData.clientAndSuministro) {
          const normalizedGeneral = normalizeSearchText(clientSearch);
          const normalizedSup = normalizeSearchText(sup);
          const normalizedDni = normalizeSearchText(c.dni || '');
          const normalizedName = normalizeSearchText(fullName);
          const normalizedDir = normalizeSearchText(currentDireccion);

          const match = normalizedSup.includes(normalizedGeneral) ||
                        normalizedDni.includes(normalizedGeneral) ||
                        normalizedName.includes(normalizedGeneral) ||
                        normalizedDir.includes(normalizedGeneral);
          if (!match) return;
        }

        // Get consumption history for stats
        const sConsumptions = consumptions.filter(cons => cons.clientId === c.id && cons.codigoSuministro === sup);
        const priorSConsumptions = sConsumptions
          .filter(cons => cons.mes < selectedMes)
          .sort((a, b) => a.mes.localeCompare(b.mes));
        const lastPriorReading = priorSConsumptions.length > 0 ? priorSConsumptions[priorSConsumptions.length - 1] : undefined;

        const lecturaAnteriorVal = lastPriorReading ? (lastPriorReading.lecturaActual ?? 0) : 0;
        const fechaUltimaLectura = lastPriorReading ? lastPriorReading.fechaLectura : null;

        // Current period status
        const periodReading = sConsumptions.find(cons => cons.mes === selectedMes);
        let readingStatus: 'PENDIENTE' | 'REGISTRADA' | 'VALIDADA' = 'PENDIENTE';
        if (periodReading) {
          readingStatus = periodReading.estadoPago === 'PAGADO' ? 'VALIDADA' : 'REGISTRADA';
        }

        supplies.push({
          id: c.id,
          sup: sup,
          label: `${sup} - ${fullName}`,
          desc: `DNI/RUC: ${c.dni} | Direcc: ${currentDireccion || '-'} | Tipo: ${c.tipo} | Est: ${c.estado}`,
          client: {
            ...c,
            direccion: currentDireccion
          },
          lecturaAnterior: lecturaAnteriorVal,
          fechaUltimaLectura: fechaUltimaLectura,
          readingStatus: readingStatus,
          hasPeriodReading: !!periodReading,
          periodReadingId: periodReading?.id || null
        });
      });
    });

    // Sort results based on the search query used
    let activeSortType: 'SUPPLY' | 'DNI' | 'NAME' = 'SUPPLY'; // default is correlative by supply code

    if (searchSupplyCode) {
      activeSortType = 'SUPPLY';
    } else if (searchDniRuc) {
      activeSortType = 'DNI';
    } else if (searchName) {
      activeSortType = 'NAME';
    } else if (clientSearch) {
      const trimmed = clientSearch.trim().toLowerCase();
      const isDni = /^\d+$/.test(trimmed) || (trimmed.replace(/\D/g, '').length > trimmed.length / 2 && trimmed.length >= 6);
      const isSup = trimmed.startsWith('sum') || (!trimmed.includes(' ') && /[a-z]/.test(trimmed) && /[0-9]/.test(trimmed));
      if (isDni) {
        activeSortType = 'DNI';
      } else if (isSup) {
        activeSortType = 'SUPPLY';
      } else {
        activeSortType = 'NAME';
      }
    }

    supplies.sort((a, b) => {
      if (supplySortField === 'suministro') {
        return genericCompare(a, b, 'sup', supplySortDirection);
      }
      if (supplySortField === 'dni') {
        const dniA = a.client.dni || '';
        const dniB = b.client.dni || '';
        return genericCompare({ ...a, dni: dniA }, { ...b, dni: dniB }, 'dni', supplySortDirection);
      }
      if (supplySortField === 'name') {
        const nameA = a.client.nombre ? a.client.nombre : `${a.client.nombres || ''} ${a.client.apellidos || ''}`;
        const nameB = b.client.nombre ? b.client.nombre : `${b.client.nombres || ''} ${b.client.apellidos || ''}`;
        return genericCompare({ ...a, fullName: nameA }, { ...b, fullName: nameB }, 'fullName', supplySortDirection);
      }
      if (supplySortField === 'direccion') {
        const dirA = a.client.direccion || '';
        const dirB = b.client.direccion || '';
        return genericCompare({ ...a, dir: dirA }, { ...b, dir: dirB }, 'dir', supplySortDirection);
      }
      if (supplySortField === 'tipo') {
        return genericCompare(a, b, (item) => item.client.tipo, supplySortDirection);
      }
      if (supplySortField === 'estado') {
        return genericCompare(a, b, (item) => item.client.estado, supplySortDirection);
      }
      if (supplySortField === 'lecturaAnterior') {
        return genericCompare(a, b, 'lecturaAnterior', supplySortDirection);
      }
      if (supplySortField === 'readingStatus') {
        return genericCompare(a, b, 'readingStatus', supplySortDirection);
      }

      // Default fallback
      if (activeSortType === 'DNI') {
        const dniA = a.client.dni || '';
        const dniB = b.client.dni || '';
        return dniA.localeCompare(dniB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (activeSortType === 'NAME') {
        const nameA = a.client.nombre ? a.client.nombre : `${a.client.nombres || ''} ${a.client.apellidos || ''}`;
        const nameB = b.client.nombre ? b.client.nombre : `${b.client.nombres || ''} ${b.client.apellidos || ''}`;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      } else {
        return a.sup.localeCompare(b.sup, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    return supplies;
  }, [clients, consumptions, searchSupplyCode, searchDniRuc, searchName, clientSearch, selectedMes, formData.clientAndSuministro, supplySortField, supplySortDirection]);

  useEffect(() => {
    if (clientSearch && availableSupplies.length === 1 && availableSupplies[0].sup === clientSearch.trim()) {
       setFormData(prev => ({ ...prev, clientAndSuministro: `${availableSupplies[0].id}|${availableSupplies[0].sup}`, lecturaAnterior: availableSupplies[0].lecturaAnterior.toString() }));
       setShowSuministroDropdown(false);
    }
  }, [clientSearch, availableSupplies]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const currentList = activeTab === 'LECTURAS' ? filteredConsumptions : pendingDebts;
  const totalPages = Math.ceil(currentList.length / itemsPerPage);
  
  const currentItems = currentList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedMes, tableSearch, activeTab]);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Consumo & Facturación
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {mainView === 'BUSCAR_RECIBO' 
              ? 'Consulta, visualización e impresión de recibos generados.' 
              : 'Registro de lecturas de medidor y control de pagos.'}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-2">
          {mainView === 'FACTURACION' ? (
            <>
              {userRole !== 'OPERATOR' && (
                <Button 
                  onClick={() => {
                    setMainView('BUSCAR_RECIBO');
                    navigate('/consumo?tab=recibos', { replace: true });
                  }}
                >
                  <Receipt className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Buscar Recibo
                </Button>
              )}
              {userRole !== 'FISCALIZADOR' && (
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                  Registrar Lectura
                </Button>
              )}
            </>
          ) : (
            <Button 
              variant="outline"
              className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
              onClick={() => {
                setMainView('FACTURACION');
                navigate('/consumo', { replace: true });
              }}
            >
              <Zap className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Lecturas y Facturación
            </Button>
          )}
        </div>
      </div>

      {mainView === 'BUSCAR_RECIBO' ? (
        <Recibos />
      ) : (
        <Card>
        <CardContent className="p-0">
          <div className="border-b border-slate-800">
            {userRole !== 'OPERATOR' ? (
              <nav className="flex -mb-px" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('LECTURAS')}
                  className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                    activeTab === 'LECTURAS'
                      ? 'border-blue-500 text-blue-500'
                      : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  Lecturas del Mes
                </button>
                <button
                  onClick={() => setActiveTab('DEUDAS')}
                  className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                    activeTab === 'DEUDAS'
                      ? 'border-red-500 text-red-500'
                      : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  Todas las Deudas Pendientes
                </button>
              </nav>
            ) : (
              <div className="py-4 px-6 bg-slate-900/10">
                <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Registro de Lecturas de Consumo (Mis Lecturas)
                </h3>
              </div>
            )}
          </div>

          <div className="p-4 border-b border-slate-800 bg-[#0B0E14]">
            <input 
              type="text" 
              placeholder="Buscar recibos por cliente, DNI o suministro..." 
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              className="block w-full max-w-md border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 placeholder-slate-500"
            />
          </div>

          {activeTab === 'LECTURAS' && (
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                 <label className="text-sm font-medium text-slate-300">Periodo de Facturación:</label>
                 <input 
                   type="month" 
                   value={selectedMes}
                   onChange={(e) => setSelectedMes(e.target.value)}
                   className="block border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm border bg-[#0B0E14] text-slate-100"
                 />
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => handleExportConsumosExcel(filteredConsumptions)}
                  disabled={filteredConsumptions.length === 0}
                  className="hidden sm:inline-flex"
                >
                  Excel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleExportConsumosPDF(filteredConsumptions)}
                  disabled={filteredConsumptions.length === 0}
                  className="hidden sm:inline-flex"
                >
                  PDF
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleGenerateMassReceipts()}
                  className="flex items-center"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Imprimir Recibos Masivos
                </Button>
              </div>
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={currentList.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            disableTopBorder={true}
          />

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative rounded-lg border border-slate-800 bg-[#0B0E14] scrollbar-thin">
            <table className="w-full table-fixed min-w-[900px] md:min-w-full divide-y divide-slate-800">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800">
                  <th scope="col" className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[24%] min-w-[180px]">
                    <div className="flex flex-col gap-1">
                      <span>Cliente / Suministro</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <button type="button" onClick={() => handleConsumoSort('cliente')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${consumoSortField === 'cliente' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                          NOM{renderConsumoSortIndicator('cliente')}
                        </button>
                        <button type="button" onClick={() => handleConsumoSort('suministro')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${consumoSortField === 'suministro' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                          SUM{renderConsumoSortIndicator('suministro')}
                        </button>
                        <button type="button" onClick={() => handleConsumoSort('dni')} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${consumoSortField === 'dni' ? 'bg-blue-600 text-white border border-blue-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                          DNI{renderConsumoSortIndicator('dni')}
                        </button>
                      </div>
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleConsumoSort('consumo')} className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[15%] min-w-[120px] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Consumo {renderConsumoSortIndicator('consumo')}
                  </th>
                  <th scope="col" onClick={() => handleConsumoSort('monto')} className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[13%] min-w-[110px] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Monto {renderConsumoSortIndicator('monto')}
                  </th>
                  <th scope="col" onClick={() => handleConsumoSort('fecha')} className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[14%] min-w-[110px] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Lectura/Fecha {renderConsumoSortIndicator('fecha')}
                  </th>
                  <th scope="col" onClick={() => handleConsumoSort('estado')} className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[10%] min-w-[80px] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">
                    Estado {renderConsumoSortIndicator('estado')}
                  </th>
                  <th scope="col" className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-[24%] min-w-[180px]">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                {currentItems.length > 0 ? currentItems.map((cons) => {
                  const client = clients.find(c => c.id === cons.clientId);
                  const clientName = client?.nombre ? client.nombre : `${client?.nombres || ''} ${client?.apellidos || ''}`;
                  return (
                    <tr key={cons.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 whitespace-normal break-words align-middle">
                        <div className="text-sm font-semibold text-slate-100">{clientName}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{cons.codigoSuministro || client?.codigoSuministro} • {client?.tipo}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-normal break-words align-middle">
                        <div className="text-sm text-slate-100 font-semibold">{cons.kwh} kWh</div>
                        <div className="text-xs text-amber-400 font-mono font-semibold mt-0.5">
                          {cons.reciboNo || `REC-${cons.mes.split('-')[0]}-${cons.mes.split('-')[1]}-${cons.id.slice(-4).toUpperCase()}`}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {cons.mes} • {format(parseISO(cons.fechaLectura), 'dd MMM yyyy', { locale: es })}
                        </div>
                        {cons.evidenciaFoto && (
                          <button
                            type="button"
                            onClick={() => setSelectedEvidenceUrl(cons.evidenciaFoto!)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 mt-1.5 active:scale-95 transition-transform"
                          >
                            <Camera className="h-3.5 w-3.5" /> Ver Evidencia Foto
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-normal break-words align-middle">
                        <div className="text-sm font-bold text-slate-100">{formatCurrency(cons.montoCalculado)}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Tarifa: S/ {
                            (() => {
                               const isSocio = suppliesInfo?.find(s => s.codigo === cons.codigoSuministro)?.isSocio ?? (client?.tipo === 'SOCIO');
                               return client?.faseSuministro === 'TRIFASICO' && settings.costoTrifasico > 0 ? settings.costoTrifasico.toFixed(2) : 
                               isSocio ? settings.costoSocio.toFixed(2) : settings.costoUsuario.toFixed(2);
                            })()
                          }/kWh</div>
                      </td>
                      <td className="px-4 py-3 whitespace-normal break-words align-middle">
                        <div className="text-xs text-slate-400" title={cons.observacion || ''}>{cons.observacion || '-'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        <Badge variant={cons.estadoPago === 'PAGADO' ? 'success' : 'warning'}>
                          {cons.estadoPago}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-normal align-middle">
                        <div className="flex flex-wrap gap-1 justify-end items-center">
                          {userRole !== 'OPERATOR' && cons.estadoPago === 'PENDIENTE' && (
                            <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-500/10 hover:text-red-400 px-2 py-1 h-auto text-xs" onClick={() => handleAnularRecibo(cons)}>
                              Anular
                            </Button>
                          )}
                          {cons.estadoPago === 'PENDIENTE' && (
                            <Button size="sm" variant="ghost" className="text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400 px-2 py-1 h-auto text-xs" onClick={() => handleEditClick(cons)}>
                              <Edit2 className="h-3 w-3 mr-1" /> Editar
                            </Button>
                          )}
                          {userRole !== 'OPERATOR' && (
                            <>
                              <Button size="sm" variant="ghost" className="hover:text-amber-400 text-amber-500/95 px-2 py-1 h-auto text-xs" onClick={() => navigate(`/consumo?tab=recibos&supplyCode=${cons.codigoSuministro || client?.codigoSuministro}`)}>
                                Buscador
                              </Button>
                              <Button size="sm" variant="ghost" className="text-blue-600 px-2 py-1 h-auto text-xs" onClick={() => handleGenerateReceipt(cons)}>
                                <Download className="h-3 w-3 mr-1" /> Imprimir Recibo
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 px-2 py-1 h-auto text-xs" 
                            onClick={() => setHistoryClientSuministro({ clientId: cons.clientId, codigoSuministro: cons.codigoSuministro || (client?.codigoSuministro || ''), clientName })}>
                            Ver Historial
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      {activeTab === 'LECTURAS' ? `No hay lecturas registradas para el periodo ${selectedMes}.` : 'No hay deudas pendientes registradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={currentList.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>
      )}

      {/* Modal Add Consumption */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={handleCloseModal}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            
            <div className={`relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle border border-slate-800 ${
              (!formData.clientAndSuministro && !editingConsumption) ? 'sm:max-w-5xl md:max-w-6xl w-full' : 'sm:max-w-2xl w-full'
            }`}>
              
              {(!formData.clientAndSuministro && !editingConsumption) ? (
                /* SCREEN 1: ADVANCED SEARCH & FILTER PANEL WITH DYNAMIC RESULTS */
                <div className="flex flex-col h-full max-h-[90vh]">
                  {/* Header */}
                  <div className="bg-[#0B0E14] px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <Search className="w-5 h-5 text-blue-500" /> Búsqueda y Selección de Suministro
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Filtre y seleccione el suministro para registrar su lectura del periodo correspondiente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-800"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                    {/* Filters Grid */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <SlidersHorizontal className="w-3.5 h-3.5" /> Panel de Filtrado
                        </span>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors hover:bg-slate-850 px-2 py-1 rounded border border-slate-800 bg-slate-900/60"
                        >
                          <RefreshCw className="w-3 h-3" /> Limpiar Filtros
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Periodo de Lectura</label>
                          <input
                            type="month"
                            required
                            value={selectedMes}
                            onChange={e => setSelectedMes(e.target.value)}
                            className="block w-full border border-slate-700 rounded-md shadow-sm py-1.5 px-2.5 text-xs bg-[#090C11] text-slate-100 focus:ring-blue-500 focus:border-blue-500 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Suministro o Código</label>
                          <input
                            type="text"
                            placeholder="Ej: SUM-001..."
                            value={searchSupplyCode}
                            onChange={e => setSearchSupplyCode(e.target.value)}
                            className="block w-full border border-slate-700 rounded-md shadow-sm py-1.5 px-2.5 text-xs bg-[#090C11] text-slate-100 placeholder-slate-600 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">DNI / RUC Titular</label>
                          <input
                            type="text"
                            placeholder="Buscar por documento..."
                            value={searchDniRuc}
                            onChange={e => setSearchDniRuc(e.target.value)}
                            className="block w-full border border-slate-700 rounded-md shadow-sm py-1.5 px-2.5 text-xs bg-[#090C11] text-slate-100 placeholder-slate-600 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Nombre o Razón Social</label>
                          <input
                            type="text"
                            placeholder="Buscar por titular..."
                            value={searchName}
                            onChange={e => setSearchName(e.target.value)}
                            className="block w-full border border-slate-700 rounded-md shadow-sm py-1.5 px-2.5 text-xs bg-[#090C11] text-slate-100 placeholder-slate-600 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick Search general input */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-500" />
                      </div>
                      <input
                        type="text"
                        placeholder="Búsqueda rápida combinada (Suministro, DNI, Titular o Dirección)..."
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2 border border-slate-700 rounded-lg text-xs bg-[#090C11] text-slate-100 placeholder-slate-500 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Results Table Container */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-blue-500" /> Resultados de Búsqueda ({availableSupplies.length})
                      </h4>
                      <div className="overflow-x-auto max-h-[50vh] overflow-y-auto relative rounded-lg border border-slate-800 bg-[#090C11]/35 scrollbar-thin">
                        <table className="w-full table-fixed divide-y divide-slate-800 text-left text-xs text-slate-300">
                          <thead className="bg-[#0B0F19] text-slate-400 uppercase font-bold text-[9px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                            <tr>
                              <th scope="col" onClick={() => handleSupplySort('suministro')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[9%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Suministro {renderSupplySortIndicator('suministro')}</th>
                              <th scope="col" onClick={() => handleSupplySort('dni')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[9%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">DNI/RUC {renderSupplySortIndicator('dni')}</th>
                              <th scope="col" onClick={() => handleSupplySort('name')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[23%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Titular / Razón Social {renderSupplySortIndicator('name')}</th>
                              <th scope="col" onClick={() => handleSupplySort('direccion')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[18%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Dirección {renderSupplySortIndicator('direccion')}</th>
                              <th scope="col" onClick={() => handleSupplySort('tipo')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[6%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Tipo {renderSupplySortIndicator('tipo')}</th>
                              <th scope="col" onClick={() => handleSupplySort('estado')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[7%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Estado {renderSupplySortIndicator('estado')}</th>
                              <th scope="col" onClick={() => handleSupplySort('lecturaAnterior')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-right text-xs font-bold text-slate-300 uppercase tracking-wider w-[8%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors font-mono">Lect. Anterior {renderSupplySortIndicator('lecturaAnterior')}</th>
                              <th scope="col" className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-left text-xs font-bold text-slate-300 uppercase tracking-wider w-[8%]">Última Lectura</th>
                              <th scope="col" onClick={() => handleSupplySort('readingStatus')} className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider w-[11%] cursor-pointer hover:bg-slate-800 hover:text-white select-none transition-colors">Estado {selectedMes} {renderSupplySortIndicator('readingStatus')}</th>
                              <th scope="col" className="sticky top-0 z-10 bg-[#0B0F19] px-4 py-3 text-center text-xs font-bold text-slate-300 uppercase tracking-wider w-[11%]">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50 bg-[#0B0E14]">
                            {availableSupplies.length > 0 ? (
                              availableSupplies.map(s => {
                                const clientName = s.client.nombre ? s.client.nombre : `${s.client.nombres || ''} ${s.client.apellidos || ''}`;
                                return (
                                  <tr 
                                    key={`${s.id}|${s.sup}`}
                                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                    onClick={() => {
                                      setFormData({
                                        clientAndSuministro: `${s.id}|${s.sup}`,
                                        lecturaAnterior: s.lecturaAnterior.toString(),
                                        lecturaActual: ''
                                      });
                                      setClientSearch(s.label);
                                    }}
                                  >
                                    <td className="px-4 py-3 font-bold text-blue-400 whitespace-normal break-words group-hover:text-blue-300 align-middle">
                                      {s.sup}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-slate-300 whitespace-normal break-all align-middle">
                                      {s.client.dni || '-'}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-slate-200 whitespace-normal break-words align-middle" title={clientName}>
                                      {clientName}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 whitespace-normal break-words align-middle" title={`${s.client.direccion || ''} ${s.client.numeroDireccion || ''}`}>
                                      {s.client.direccion || '-'} {s.client.numeroDireccion || ''}
                                    </td>
                                    <td className="px-4 py-3 whitespace-normal align-middle">
                                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                        s.client.tipo === 'SOCIO' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/30' : 'bg-blue-950/50 text-blue-400 border border-blue-800/30'
                                      }`}>
                                        {s.client.tipo}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-normal align-middle">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                        s.client.state === 'ACTIVO' || s.client.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${s.client.state === 'ACTIVO' || s.client.estado === 'ACTIVO' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                                        {s.client.estado}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-300 whitespace-normal align-middle">
                                      {s.lecturaAnterior} kWh
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 whitespace-normal text-[11px] align-middle">
                                      {s.fechaUltimaLectura 
                                        ? format(parseISO(s.fechaUltimaLectura), 'dd/MM/yyyy HH:mm', { locale: es }) 
                                        : 'Sin registro'}
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-normal align-middle">
                                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        s.readingStatus === 'VALIDADA' 
                                          ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40' 
                                          : s.readingStatus === 'REGISTRADA' 
                                            ? 'bg-blue-950/50 text-blue-400 border-blue-800/40' 
                                            : 'bg-amber-950/50 text-amber-500 border-amber-800/40'
                                      }`}>
                                        {s.readingStatus}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-normal align-middle" onClick={(e) => e.stopPropagation()}>
                                      <Button 
                                        type="button" 
                                        size="sm" 
                                        onClick={() => {
                                          setFormData({
                                            clientAndSuministro: `${s.id}|${s.sup}`,
                                            lecturaAnterior: s.lecturaAnterior.toString(),
                                            lecturaActual: ''
                                          });
                                          setClientSearch(s.label);
                                        }}
                                        className="h-7 py-1 px-2.5 text-[11px] font-bold flex items-center gap-1 shadow hover:shadow-blue-500/20"
                                      >
                                        Registrar <ChevronRight className="w-3.5 h-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={10} className="p-12 text-center text-slate-400 text-sm">
                                  No se encontraron suministros que coincidan con los filtros de búsqueda. Intente con otros términos o limpie los filtros.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-slate-900/50 px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-xs text-slate-400 text-center sm:text-left">
                      Total de suministros filtrados: <span className="text-slate-200 font-semibold">{availableSupplies.length}</span> activos o cortados disponibles para lectura en el periodo <span className="text-blue-400 font-semibold">{selectedMes}</span>.
                    </div>
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto">
                      Cerrar Panel
                    </Button>
                  </div>
                </div>
              ) : (
                /* SCREEN 2: REGISTRATION FORM FOR THE SELECTED SUPPLY */
                <form onSubmit={handleSubmit}>
                  <div className="bg-[#0B0E14] px-6 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800/80">
                    <h3 className="text-lg leading-6 font-bold text-slate-100 flex items-center gap-2" id="modal-title">
                      <Zap className="w-5 h-5 text-amber-500" />
                      {editingConsumption ? 'Editar Lectura Mensual' : 'Registrar Lectura Mensual'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Periodo actual seleccionado: <span className="text-blue-400 font-semibold">{selectedMes}</span>
                    </p>
                  </div>

                  <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                    {/* Selected supply card block */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900/40 border border-slate-800 rounded-xl p-4 gap-3">
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SUMINISTRO SELECCIONADO</div>
                        <div className="text-sm font-black text-blue-400 font-mono flex items-center gap-1.5">
                          {formData.clientAndSuministro.split('|')[1]}
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            selectedClient?.tipo === 'SOCIO' ? 'bg-emerald-950/50 text-emerald-400' : 'bg-blue-950/50 text-blue-400'
                          }`}>
                            {selectedClient?.tipo}
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 font-bold">
                          {selectedClient?.nombre ? selectedClient.nombre : `${selectedClient?.nombres || ''} ${selectedClient?.apellidos || ''}`}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">
                          DNI/RUC: <span className="font-mono text-slate-300 font-semibold">{selectedClient?.dni || '-'}</span> <br />
                          Dirección: <span className="text-slate-300 font-semibold">{selectedClient?.direccion} {selectedClient?.numeroDireccion || ''}</span>
                        </div>
                      </div>
                      {!editingConsumption && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setFormData({ ...formData, clientAndSuministro: '' });
                            setClientSearch('');
                          }}
                          className="self-start sm:self-center text-xs border-slate-800 text-slate-300 hover:bg-slate-850 px-3 h-8 flex items-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Cambiar
                        </Button>
                      )}
                    </div>

                    {/* Historical Readings (Recent Consumptions) inside Form screen */}
                    {selectedClientConsumptions.length > 0 && (
                      <div className="p-4 bg-slate-950/50 border border-slate-850 rounded-xl space-y-2">
                        <h4 className="text-xs font-bold text-slate-400 tracking-wide uppercase flex items-center gap-1.5 border-b border-slate-800 pb-2">
                          <FileText className="w-4 h-4 text-blue-400" /> Historial Reciente de Consumo
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1">
                          {selectedClientConsumptions.slice(-4).reverse().map(c => (
                            <div key={c.id} className="flex justify-between items-center text-[11px] p-2 rounded bg-slate-900/60 border border-slate-800/80">
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-400">{c.mes}</span>
                                <div className="text-[10px] text-slate-500">Lectura: {c.lecturaActual}</div>
                              </div>
                              <div className="text-right space-y-0.5">
                                <span className="font-bold text-blue-400">{c.kwh} kWh</span>
                                <div className="text-[10px] text-emerald-400 font-semibold">S/ {c.montoCalculado.toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Readings Grid inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Lectura Anterior (kWh)</label>
                        <input 
                          type="number" 
                          min="0" 
                          step="1"
                          readOnly={!isFirstReading && !editingConsumption}
                          required 
                          value={isFirstReading ? formData.lecturaAnterior : currentLecturaAnterior} 
                          onChange={e => setFormData({...formData, lecturaAnterior: e.target.value})} 
                          className="block w-full border border-slate-800 rounded-lg py-2 px-3 text-xs bg-slate-900 text-slate-400 border-slate-800 font-mono font-bold focus:outline-none focus:ring-0 focus:border-slate-800" 
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Sincronizado automáticamente del periodo anterior.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Lectura Actual (kWh) <span className="text-red-500">*</span></label>
                        <input 
                          type="number" 
                          min="0" 
                          step="1"
                          required 
                          placeholder="Ingrese lectura actual del medidor..."
                          value={formData.lecturaActual} 
                          onChange={e => setFormData({...formData, lecturaActual: e.target.value})} 
                          className="block w-full border border-slate-700 rounded-lg py-2 px-3 text-xs bg-[#090C11] text-slate-100 placeholder-slate-600 focus:ring-blue-500 focus:border-blue-500 font-mono font-bold"
                        />
                        {isAtypical && (
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 text-left space-y-1 block animate-pulse">
                            <div className="flex items-center gap-1.5 font-bold text-amber-300 border-b border-amber-500/10 pb-1 mb-1">
                              <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                              Lectura Atípica Detectada
                            </div>
                            <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-amber-200">
                              {atypicalReasons.map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
                            <p className="text-[9px] text-amber-400 font-semibold mt-1">
                              * Se requiere de forma obligatoria fotografía de evidencia y justificación.
                            </p>
                          </div>
                        )}
                        {!isAtypical && formData.lecturaActual !== '' && (
                          <p className="mt-1 flex items-center text-[10px] text-emerald-400 font-medium text-left">
                            <Check className="w-3.5 h-3.5 mr-1 inline" />
                            Consumo en rango normal (Fotografía y observación opcionales).
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Live consumption stats panel */}
                    {formData.clientAndSuministro && formData.lecturaActual && (
                      <div className="bg-[#090C11] border border-slate-800 rounded-xl p-4 flex justify-between items-center">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider">CONSUMO CALCULADO</span>
                          <div className="text-lg font-black text-slate-100 font-mono">
                            {currentKwh} <span className="text-xs text-slate-400 font-medium">kWh</span>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider">MONTO ESTIMADO</span>
                          <div className="text-lg font-black text-emerald-400 font-mono">
                            {formatCurrency(Math.max((currentKwh) * (
                              (() => {
                                 const selClient = clients.find(c => c.id === formData.clientAndSuministro.split('|')[0]);
                                 const isSocio = suppliesInfo?.find(s => s.codigo === formData.clientAndSuministro.split('|')[1])?.isSocio ?? (selClient?.tipo === 'SOCIO');
                                 return selClient?.faseSuministro === 'TRIFASICO' && (settings?.costoTrifasico || 0) > 0
                                   ? (settings?.costoTrifasico || 0)
                                   : isSocio 
                                     ? (settings?.costoSocio || 0.20)
                                     : (settings?.costoUsuario || 0.30);
                              })()
                            ), settings?.consumoMinimo !== undefined ? settings.consumoMinimo : 6))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Photo Evidence with drag and drop */}
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Evidencia Fotográfica de la Lectura {isAtypical && <span className="text-red-400 font-semibold">(Obligatorio por Lectura Atípica)</span>}
                      </label>
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                          isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-[#090C11] hover:border-slate-700'
                        }`}
                        onClick={() => document.getElementById('foto-input-medidor')?.click()}
                      >
                        <input
                          id="foto-input-medidor"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        {evidenciaFileBase64 ? (
                          <div className="space-y-2">
                            <div className="relative inline-block">
                              <img
                                src={evidenciaFileBase64}
                                alt="Evidencia de lectura"
                                className="max-h-28 mx-auto rounded-lg border border-slate-800 object-cover"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEvidenciaFileBase64('');
                                }}
                                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-500 shadow active:scale-95 transition-transform"
                                title="Eliminar Foto"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-400 font-semibold">Foto cargada correctamente. Pulse para cambiar.</p>
                          </div>
                        ) : (
                          <div className="py-2">
                            <Camera className="mx-auto h-8 w-8 text-slate-500 mb-1" />
                            <p className="text-xs font-semibold text-slate-300">Arrastre y suelte una fotografía del medidor aquí, o pulse para explorar</p>
                            <p className="text-[10px] text-slate-500">Formatos válidos: JPG, PNG, WEBP (Max 5MB)</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Observación / Justificación */}
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Observación u Justificación {isAtypical && <span className="text-red-400 font-semibold">(Obligatorio por Lectura Atípica)</span>}
                      </label>
                      <textarea
                        rows={2}
                        placeholder={isAtypical 
                          ? "Describa detalladamente el motivo de la variación significativa del consumo..."
                          : "Ingrese una observación o comentario si corresponde..."}
                        value={justificacion}
                        onChange={e => setJustificacion(e.target.value)}
                        required={isAtypical}
                        className="block w-full border border-slate-700 rounded-lg py-2 px-3 text-xs bg-[#090C11] text-slate-100 placeholder-slate-600 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900/50 px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row-reverse sm:justify-start gap-3">
                    <Button type="submit" className="w-full sm:w-auto h-9 font-bold px-5 shadow shadow-blue-500/20">
                      {editingConsumption ? 'Guardar Cambios' : 'Guardar Lectura'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                      if (editingConsumption) {
                        handleCloseModal();
                      } else {
                        // Go back to Screen 1 (search screen)
                        setFormData({ ...formData, clientAndSuministro: '' });
                        setClientSearch('');
                      }
                    }} className="w-full sm:w-auto h-9 font-bold text-slate-300 border-slate-800 bg-transparent hover:bg-slate-900">
                      {editingConsumption ? 'Cancelar' : 'Atrás a Búsqueda'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial de Facturación */}
      {historyClientSuministro && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setHistoryClientSuministro(null)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-slate-800">
              <div className="px-4 py-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-[#0B0E14] z-20">
                <div>
                  <h3 className="text-lg font-medium text-slate-100 flex items-center">
                    Historial de Facturación
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Cliente: {historyClientSuministro.clientName} | Suministro: {historyClientSuministro.codigoSuministro}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setHistoryClientSuministro(null)}>
                  Cerrar
                </Button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Período</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Lectura (kWh)</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Consumo</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Monto</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                    {consumptions
                      .filter(c => c.clientId === historyClientSuministro.clientId && c.codigoSuministro === historyClientSuministro.codigoSuministro && (userRole !== 'OPERATOR' || c.createdBy === user?.email))
                      .sort((a,b) => b.mes.localeCompare(a.mes))
                      .map((hc, idx) => (
                      <tr key={hc.id} className={idx % 2 === 0 ? 'bg-[#0B0E14]' : 'bg-slate-900/20'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-medium">
                          {hc.mes}
                          {getExonerationClassification(comites, hc.codigoSuministro, hc.mes) === 'EXONERATED' && (
                            <span className="block text-[10px] text-emerald-400 font-semibold mt-0.5">
                              Exonerado de pago por cargo en Comité Directivo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{hc.lecturaActual || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{hc.kwh} kWh</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-200 uppercase">{formatCurrency(hc.montoCalculado)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge variant={hc.estadoPago === 'PAGADO' ? 'success' : 'warning'}>
                            {hc.estadoPago}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {consumptions.filter(c => c.clientId === historyClientSuministro.clientId && c.codigoSuministro === historyClientSuministro.codigoSuministro && (userRole !== 'OPERATOR' || c.createdBy === user?.email)).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          No hay historial de consumos para este suministro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizar Evidencia Fotográfica */}
      {selectedEvidenceUrl && (
        <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-95 transition-opacity" onClick={() => setSelectedEvidenceUrl(null)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative inline-block align-middle bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full border border-slate-800">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#0B0E14]">
                <h3 className="text-md font-medium text-slate-200 flex items-center gap-2">
                  <Camera className="h-5 w-5 text-blue-500" /> Evidencia Fotográfica de la Lectura
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEvidenceUrl(null)}>
                  Cerrar
                </Button>
              </div>
              <div className="p-4 bg-slate-950 flex justify-center items-center">
                <img
                  src={selectedEvidenceUrl}
                  alt="Evidencia fotográfica del medidor"
                  className="max-h-[70vh] rounded shadow-lg object-contain w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
