import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, Badge, Button, Pagination } from '../components/ui';
import { formatCurrency, normalizeSearchText, getExonerationClassification, scoreSupplyCodeMatch } from '../lib/utils';
import { generateGeneralPaymentReceiptPDF, generatePayrollReceiptPDF, generateConsumptionTicketPDF } from '../lib/receipts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Search,
  Filter,
  Download,
  Printer,
  Ban,
  Calendar,
  X,
  FileText,
  User,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Briefcase,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Receipt
} from 'lucide-react';

// Unified interface representing a Virtual Receipt item for indexing/querying
interface VirtualReceipt {
  uniqueId: string; // Composite unique key like `cons-id` or `tx-id`
  sourceType: 'CONSUMO' | 'VENTA_SERVICIO' | 'TRANSFERENCIA' | 'CUOTA_SOCIO' | 'PAGO_SUELDO' | 'INGRESO' | 'EGRESO' | 'MULTA';
  rawId: string; // original entity ID
  comprobanteNo: string; // Formatted receipt serial or correlative
  fecha: string; // ISO string
  monto: number;
  estado: 'PAGADO' | 'PENDIENTE' | 'VENCIDO' | 'ANULADO';
  concepto: string;
  registradoPor: string;
  
  // Client specific info
  clientId?: string;
  clientName: string;
  clientDni: string;
  clientDireccion: string;
  clientMedidor: string;
  codigoSuministro: string;
  
  // Specific payload references for exact actions
  rawPayload: any;
}

export default function Recibos() {
  const {
    clients,
    consumptions,
    transactions,
    pagosSueldos,
    fines,
    settings,
    suppliesInfo,
    userRole,
    addAuditLog,
    deleteConsumption,
    comites
  } = useAppContext();

  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // URL state queries / integrations
  const params = new URLSearchParams(location.search);
  const initialClientId = params.get('clientId') || '';
  const initialSupplyCode = params.get('supplyCode') || '';

  // Store annulled receipts in localStorage for persistence
  const [annulledIds, setAnnulledIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('paccha_annulled_receipts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('paccha_annulled_receipts', JSON.stringify(annulledIds));
    } catch (e) {
      console.error('Storage error:', e);
    }
  }, [annulledIds]);

  // Search and Advanced Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Advanced filters state
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterBilledMonth, setFilterBilledMonth] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('TODOS');
  const [filterType, setFilterType] = useState<string>('TODOS');
  const [filterCreator, setFilterCreator] = useState<string>('TODOS');

  // Selected parameters from other modules (Clears when user performs a general reset)
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [selectedSupplyCode, setSelectedSupplyCode] = useState(initialSupplyCode);

  // Pagination Table state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected receipt state (can be used for tracking or further details if needed)
  const [selectedReceipt, setSelectedReceipt] = useState<VirtualReceipt | null>(null);

  // Reset all search criteria
  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterBilledMonth('');
    setFilterEstado('TODOS');
    setFilterType('TODOS');
    setFilterCreator('TODOS');
    setSelectedClientId('');
    setSelectedSupplyCode('');
    setCurrentPage(1);
    navigate('/consumo?tab=recibos', { replace: true });
  };

  // Helper to extract debt info (identically match getDebtInfo in Consumo)
  const getDebtInfo = (clientId: string, codigoSuministro: string, currentMes: string) => {
    const sortedPending = consumptions
      .filter(c => 
        c.clientId === clientId && 
        c.codigoSuministro === codigoSuministro && 
        c.estadoPago === 'PENDIENTE' && 
        c.mes < currentMes
      )
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const totalDeuda = sortedPending.reduce((sum, c) => sum + c.montoCalculado, 0);
    return {
      previousUnpaid: sortedPending,
      totalDeuda,
      warning: sortedPending.length >= 2
    };
  };

  // Build the complete unified query list of all system Receipts / Comprobantes
  const unifiedReceiptsList: VirtualReceipt[] = [];

  // 1. Convert Consumo Readings into VirtualReceipt list
  consumptions.forEach(cons => {
    const isLocalAnnulled = annulledIds.includes(`cons-${cons.id}`);
    const client = clients.find(c => c.id === cons.clientId);
    const clientName = client ? `${client.apellidos}, ${client.nombres}` : 'Desconocido';
    const clientDni = client?.dni || '';
    const clientDireccion = client ? `${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}` : '';
    const clientMedidor = client?.numeroMedidor || 'No registrado';
    const [yearPart, monthPart] = cons.mes.split('-');
    const compNo = cons.reciboNo || `REC-${yearPart}-${monthPart}-${cons.id.slice(-4).toUpperCase()}`;

    // Determine state
    let estado: VirtualReceipt['estado'] = cons.estadoPago === 'PAGADO' ? 'PAGADO' : 'PENDIENTE';
    if (isLocalAnnulled) {
      estado = 'ANULADO';
    } else if (estado === 'PENDIENTE') {
      // Past due if pending and billing period is older than current month
      const currentMonthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      if (cons.mes < currentMonthStr) {
        estado = 'VENCIDO';
      }
    }

    unifiedReceiptsList.push({
      uniqueId: `cons-${cons.id}`,
      sourceType: 'CONSUMO',
      rawId: cons.id,
      comprobanteNo: compNo,
      fecha: cons.fechaLectura || new Date().toISOString(),
      monto: cons.montoCalculado,
      estado,
      concepto: `CONSUMO DE ENERGÍA - PERÍODO: ${cons.mes} (${cons.kwh} kWh)`,
      registradoPor: cons.createdBy || 'Sistema',
      clientId: cons.clientId,
      clientName,
      clientDni,
      clientDireccion,
      clientMedidor,
      codigoSuministro: cons.codigoSuministro || client?.codigoSuministro || '',
      rawPayload: cons
    });
  });

  // 2. Convert PagoSueldos into VirtualReceipt list
  (pagosSueldos || []).forEach(pago => {
    const isLocalAnnulled = annulledIds.includes(`pago-${pago.id}`);
    unifiedReceiptsList.push({
      uniqueId: `pago-${pago.id}`,
      sourceType: 'PAGO_SUELDO',
      rawId: pago.id,
      comprobanteNo: pago.comprobante,
      fecha: pago.fechaPago,
      monto: pago.monto,
      estado: isLocalAnnulled ? 'ANULADO' : 'PAGADO',
      concepto: `BOLETA DE ENTRADA SUELDO - MES: ${pago.mesPagado} (${pago.trabajadorCargo})`,
      registradoPor: pago.createdBy || 'Sistema',
      clientName: pago.trabajadorNombreCompleto,
      clientDni: pago.trabajadorDni,
      clientDireccion: 'Planta Paccha',
      clientMedidor: 'No aplica',
      codigoSuministro: 'No aplica',
      rawPayload: pago
    });
  });

  // 3. Convert all Incomes/Expenses Transactions into VirtualReceipt representation list (excluding duplications that represent consumer payments mapping)
  transactions.forEach(tx => {
    // Avoid double counting paid Consumos and unpaid wage roles that are registered as sueldos or consumption
    // We already have clean consumos and pagos sueldos listed above
    const isDuplicate = 
      (tx.categoria === 'CONSUMO' && tx.descripcion.toLowerCase().includes('consumo')) ||
      (tx.categoria === 'SUELDOS' && tx.descripcion.toLowerCase().includes('sueldo'));

    if (isDuplicate) return;

    const isLocalAnnulled = annulledIds.includes(`tx-${tx.id}`);
    const client = clients.find(c => c.id === tx.clientId);
    const clientName = client ? `${client.apellidos}, ${client.nombres}` : (tx.destinatario || 'Público General');
    const clientDni = client?.dni || '';
    const clientDireccion = client ? `${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}` : '';
    const clientMedidor = client?.numeroMedidor || 'No registrado';
    const compNo = tx.comprobante || `B-${tx.id?.slice(-6).toUpperCase()}`;

    let sourceType: VirtualReceipt['sourceType'] = tx.tipo === 'INGRESO' ? 'INGRESO' : 'EGRESO';
    if (tx.categoria === 'VENTA_SERVICIO') {
      sourceType = 'VENTA_SERVICIO';
    } else if (tx.categoria === 'TRANSFERENCIA') {
      sourceType = 'TRANSFERENCIA';
    } else if (tx.categoria === 'APORTE' || tx.categoria === 'PAGO_EXTRAORDINARIO') {
      sourceType = 'CUOTA_SOCIO';
    } else if (tx.categoria === 'MULTA') {
      sourceType = 'MULTA';
    }

    unifiedReceiptsList.push({
      uniqueId: `tx-${tx.id}`,
      sourceType,
      rawId: tx.id,
      comprobanteNo: compNo,
      fecha: tx.fecha || new Date().toISOString(),
      monto: tx.monto,
      estado: isLocalAnnulled ? 'ANULADO' : 'PAGADO',
      concepto: tx.descripcion.toUpperCase(),
      registradoPor: tx.createdBy || 'Sistema',
      clientId: tx.clientId,
      clientName,
      clientDni,
      clientDireccion,
      clientMedidor,
      codigoSuministro: client?.suministros?.[0] || client?.codigoSuministro || '',
      rawPayload: tx
    });
  });

  // 4. Convert all Fines from specific fines list that aren't already represented as general transactions yet
  (fines || []).forEach(fine => {
    // Show only pending fines, as paid ones create a TRANSACTION which gets mapped above
    if (fine.estadoPago !== 'PENDIENTE') return;

    const isLocalAnnulled = annulledIds.includes(`fine-${fine.id}`);
    const client = clients.find(c => c.id === fine.clientId);
    const clientName = client ? `${client.apellidos}, ${client.nombres}` : 'Desconocido';
    const clientDni = client?.dni || '';
    const clientDireccion = client ? `${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}` : '';
    const clientMedidor = client?.numeroMedidor || 'No registrado';
    const compNo = `R-MUL-${fine.id.slice(-4).toUpperCase()}`;

    let estado: VirtualReceipt['estado'] = 'PENDIENTE';
    if (isLocalAnnulled) {
      estado = 'ANULADO';
    } else {
      const currentYearMonth = new Date().toISOString().slice(0, 7);
      const fineYearMonth = fine.fecha.slice(0, 7);
      if (fineYearMonth < currentYearMonth) {
        estado = 'VENCIDO';
      }
    }

    unifiedReceiptsList.push({
      uniqueId: `fine-${fine.id}`,
      sourceType: 'MULTA',
      rawId: fine.id,
      comprobanteNo: compNo,
      fecha: fine.fecha,
      monto: fine.monto,
      estado,
      concepto: `MULTA PENDIENTE: ${fine.motivo.toUpperCase()}`,
      registradoPor: fine.createdBy || 'Sistema',
      clientId: fine.clientId,
      clientName,
      clientDni,
      clientDireccion,
      clientMedidor,
      codigoSuministro: client?.suministros?.[0] || client?.codigoSuministro || '',
      rawPayload: fine
    });
  });

  // Sort receipts: oldest to newest (ascending) if search filters are active, otherwise newest to oldest (descending)
  const isFilterActive = !!(searchTerm || selectedClientId || selectedSupplyCode || filterEstado !== 'TODOS' || filterType !== 'TODOS' || filterCreator !== 'TODOS' || filterBilledMonth || filterStartDate || filterEndDate);
  if (isFilterActive) {
    unifiedReceiptsList.sort((a, b) => a.fecha.localeCompare(b.fecha));
  } else {
    unifiedReceiptsList.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  // FILTER LOGIC
  const filteredReceipts = unifiedReceiptsList.filter(item => {
    // 1. Direct Context selections
    if (selectedClientId && item.clientId !== selectedClientId) {
      return false;
    }
    if (selectedSupplyCode && item.codigoSuministro !== selectedSupplyCode) {
      return false;
    }

    // 2. Quick search filter matching client, dni, supply number, meter code, receipt index, concept, year, month
    if (searchTerm) {
      const searchNormalized = normalizeSearchText(searchTerm);
      const invoiceNo = normalizeSearchText(item.comprobanteNo);
      const clientName = normalizeSearchText(item.clientName);
      const dni = normalizeSearchText(item.clientDni);
      const supScore = scoreSupplyCodeMatch(item.codigoSuministro || '', searchTerm);
      const address = normalizeSearchText(item.clientDireccion);
      const meter = normalizeSearchText(item.clientMedidor);
      const concept = normalizeSearchText(item.concepto);

      // Get Month Name / Year / Month number
      let dateObj: Date | null = null;
      try {
        if (item.fecha) {
          dateObj = parseISO(item.fecha);
        }
      } catch (err) {}
      
      const monthLabel = dateObj ? format(dateObj, 'MMMM', { locale: es }) : '';
      const yearLabel = dateObj ? format(dateObj, 'yyyy') : '';
      const monthNumberLabel = dateObj ? format(dateObj, 'MM') : '';

      const matches = 
        invoiceNo.includes(searchNormalized) ||
        clientName.includes(searchNormalized) ||
        dni.includes(searchNormalized) ||
        supScore > 0 ||
        address.includes(searchNormalized) ||
        meter.includes(searchNormalized) ||
        concept.includes(searchNormalized) ||
        normalizeSearchText(monthLabel).includes(searchNormalized) ||
        yearLabel.includes(searchNormalized) ||
        monthNumberLabel === searchNormalized;

      if (!matches) return false;
    }

    // 3. Status filter
    if (filterEstado !== 'TODOS' && item.estado !== filterEstado) {
      return false;
    }

    // 4. Type / concept category filter
    if (filterType !== 'TODOS' && item.sourceType !== filterType) {
      return false;
    }

    // 5. Creator user filter
    if (filterCreator !== 'TODOS' && item.registradoPor !== filterCreator) {
      return false;
    }

    // 6. Billed Period Month filters ("YYYY-MM")
    if (filterBilledMonth) {
      if (item.sourceType === 'CONSUMO') {
        const cons: any = item.rawPayload;
        if (cons.mes !== filterBilledMonth) return false;
      } else if (item.sourceType === 'PAGO_SUELDO') {
        const p: any = item.rawPayload;
        if (p.mesPagado !== filterBilledMonth) return false;
      } else {
        // Fallback check date prefix
        if (!item.fecha.startsWith(filterBilledMonth)) return false;
      }
    }

    // 7. Date range filters
    if (filterStartDate) {
      const itemDate = item.fecha.split('T')[0];
      if (itemDate < filterStartDate) return false;
    }
    if (filterEndDate) {
      const itemDate = item.fecha.split('T')[0];
      if (itemDate > filterEndDate) return false;
    }

    return true;
  });

  // If searchTerm is provided, prioritize results by supply code match score
  if (searchTerm) {
    filteredReceipts.sort((a, b) => {
      const scoreA = scoreSupplyCodeMatch(a.codigoSuministro || '', searchTerm);
      const scoreB = scoreSupplyCodeMatch(b.codigoSuministro || '', searchTerm);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return 0; // maintain original date sorting order for identical scores
    });
  }

  // Extract unique creator/operator users for advanced filtering dropdown list
  const creatorsSet = new Set<string>();
  unifiedReceiptsList.forEach(item => {
    if (item.registradoPor) creatorsSet.add(item.registradoPor);
  });
  const allCreators = Array.from(creatorsSet);

  // Pagination bounds calculation
  const totalItems = filteredReceipts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedReceipts = filteredReceipts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handle direct PDF downloads targeting exact generators
  const handleDownloadTicket = (item: VirtualReceipt) => {
    const toastId = toast.loading('Generando Ticket (80mm)...');
    try {
      if (item.sourceType !== 'CONSUMO') {
        const client = clients.find(c => c.id === item.clientId);
        const success = generateGeneralPaymentReceiptPDF(item.rawPayload, client);
        if (success) {
          toast.success('Ticket descargado exitosamente.', { id: toastId });
        } else {
          toast.error('Error al descargar ticket.', { id: toastId });
        }
        return;
      }

      const cons = item.rawPayload;
      const client = clients.find(c => c.id === cons.clientId);
      if (!client) {
        toast.error('Cliente asociado no existe.', { id: toastId });
        return;
      }
      const codSuministro = cons.codigoSuministro || client.codigoSuministro;
      const debtInfo = getDebtInfo(client.id, codSuministro || '', cons.mes);

      const success = generateConsumptionTicketPDF(cons, client, settings, debtInfo);
      if (success) {
        toast.success('Ticket descargado exitosamente.', { id: toastId });
      } else {
        toast.error('Error al descargar ticket.', { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error('Fallo al generar ticket.', { id: toastId });
    }
  };

  // Handle direct PDF downloads targeting exact generators
  const handleDownloadPDF = (item: VirtualReceipt) => {
    const toastId = toast.loading('Preparando PDF...');
    try {
      if (item.sourceType === 'CONSUMO') {
        // Run customized consumption pdf download
        const cons = item.rawPayload;
        const client = clients.find(c => c.id === cons.clientId);
        if (!client) {
          toast.error('Socio / Cliente asociado para este consumo no existe.', { id: toastId });
          return;
        }
        
        // Exact mirror replica of Consumo receipt document generator
        const codSuministro = cons.codigoSuministro || client.codigoSuministro;
        const debtInfo = getDebtInfo(client.id, codSuministro || '', cons.mes);

        const doc = new jsPDF({ format: 'a4' });
        let yOffset = 10;
        
        // Header Logo
        doc.setFontSize(16);
        doc.text('Mini Central Hidroeléctrica Paccha', 14, yOffset + 6);

        if (debtInfo.warning) {
          doc.setFontSize(9);
          doc.setTextColor(220, 38, 38);
          const extReconexion = (settings?.costoReconexion || 0).toFixed(2);
          doc.text('SERVICIO PARA CORTE', 196, yOffset + 6, { align: 'right' });
          doc.text(`Reconexión S/ ${extReconexion}`, 196, yOffset + 10, { align: 'right' });
          doc.setTextColor(0, 0, 0);
        }

        const [yearPart, monthPart] = cons.mes.split('-');
        const displayReciboNo = cons.reciboNo || `REC-${yearPart}-${monthPart}-${cons.id.slice(-4).toUpperCase()}`;

        doc.setFontSize(10);
        doc.text(`Recibo: ${displayReciboNo} | Suministro: ${codSuministro} | Tipo: ${client.tipo}`, 14, yOffset + 12);
        doc.setFontSize(9);
        doc.text(`Fecha Emisión: ${format(parseISO(cons.fechaLectura), 'dd MMM yyyy', { locale: es })} | Periodo: ${cons.mes} | Estado: ${item.estado}`, 14, yOffset + 18);

        // Cliente
        doc.setFontSize(10);
        const nameDisplay = `${client.apellidos}, ${client.nombres}`;
        doc.text(`Cliente: ${nameDisplay}`, 14, yOffset + 23);
        doc.text(`Dirección: ${client.direccion} ${client.numeroDireccion ? `N° ${client.numeroDireccion}` : ''}`, 14, yOffset + 28);

        // Usage readings
        const allCons = consumptions
          .filter(c => c.clientId === client.id && c.codigoSuministro === codSuministro)
          .sort((a,b) => a.mes.localeCompare(b.mes));
        
        let calcLecturaAnterior = cons.lecturaAnterior ?? 0;
        let calcLecturaActual = cons.lecturaActual ?? 0;
        const currentKwh = cons.kwh || 0;

        if (cons.lecturaAnterior === undefined || cons.lecturaActual === undefined) {
          const pastCons = allCons.filter(c => c.mes < cons.mes);
          const initialL = allCons.length > 0 && allCons[0].lecturaAnterior !== undefined ? allCons[0].lecturaAnterior : 0;
          calcLecturaAnterior = initialL + pastCons.reduce((acc, c) => acc + (c.kwh || 0), 0);
          calcLecturaActual = calcLecturaAnterior + currentKwh;
        }

        doc.text(`Lectura actual: ${calcLecturaActual} kWh | Lectura anterior: ${calcLecturaAnterior} kWh`, 14, yOffset + 34);
        doc.text(`Consumo del mes: ${currentKwh} kWh`, 14, yOffset + 39);

        // Historial mini-bar graph
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
        doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

        if (historyCons.length > 0) {
          const maxK = Math.max(...historyCons.map(c => c.montoCalculado || 0), 10);
          const barW = 6;
          const spacing = (chartW - (historyCons.length * barW)) / (historyCons.length + 1);
          
          const colors = [
            [59,130,246], [16,185,129], [245,158,11], [239,68,68],
            [139,92,246], [236,72,153], [6,182,212], [249,115,22]
          ];

          historyCons.forEach((hc, i) => {
            const x = chartX + spacing + i * (barW + spacing);
            const barH = ((hc.montoCalculado || 0) / maxK) * chartH;
            const y = chartY + chartH - barH;
            
            let mIndex = hc.mes ? parseInt(hc.mes.split('-')[1], 10) - 1 : 0;
            const color = colors[mIndex % colors.length];

            doc.setFillColor(color[0], color[1], color[2]);
            doc.rect(x, y, barW, barH, 'F');

            doc.setFontSize(5);
            doc.text((hc.montoCalculado || 0).toFixed(0).toString(), x + barW / 2, y - 1, { align: 'center' });
            const mShort = hc.mes ? new Date(`${hc.mes}-02`).toLocaleDateString('es', { month: 'short' }).substring(0, 3) : '';
            doc.text(mShort, x + barW / 2, chartY + chartH + 3, { align: 'center' });
          });
        }

        // Table
        const isSocio = suppliesInfo?.find(s => s.codigo === cons.codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
        const tarifaAplicada = client.faseSuministro === 'TRIFASICO' && (settings?.costoTrifasico || 0) > 0 
          ? (settings?.costoTrifasico || 0) 
          : isSocio ? (settings?.costoSocio || 0.2) : (settings?.costoUsuario || 0.3);
        const minimoAplica = settings?.consumoMinimo ?? 6;
        const esMinimo = currentKwh * tarifaAplicada < minimoAplica;

        const classification = getExonerationClassification(comites, codSuministro, cons.mes);
        let labelCons = 'Consumo Eléctrico';
        if (classification === 'EXONERATED') {
          labelCons += ' - Exonerado de pago por cargo en Comité Directivo';
        } else if (classification === 'PRE_EXONERATION') {
          labelCons += ' - (Anterior a Exoneración Directiva)';
        } else if (classification === 'POST_EXONERATION') {
          labelCons += ' - (Posterior a Exoneración Directiva)';
        } else if (esMinimo) {
          labelCons += ` (Mín. S/ ${minimoAplica.toFixed(2)})`;
        }

        const tableBody: any[][] = [];
        tableBody.push([
          labelCons,
          currentKwh.toString(), tarifaAplicada.toFixed(2), formatCurrency(cons.montoCalculado)
        ]);

        if (debtInfo.previousUnpaid && debtInfo.previousUnpaid.length > 0) {
          debtInfo.previousUnpaid.forEach(unpaid => {
            const unpaidClass = getExonerationClassification(comites, codSuministro, unpaid.mes);
            let unpaidLabel = `Deuda Pendiente ${unpaid.mes}`;
            if (unpaidClass === 'EXONERATED') {
              unpaidLabel += ' - EXONERADA';
            } else if (unpaidClass === 'PRE_EXONERATION') {
              unpaidLabel += ' - ANTERIOR A EXONERACIÓN';
            } else if (unpaidClass === 'POST_EXONERATION') {
              unpaidLabel += ' - POSTERIOR A EXONERACIÓN';
            }
            
            tableBody.push([
              { content: unpaidLabel, styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
              (unpaid.kwh || 0).toString(), '-', formatCurrency(unpaid.montoCalculado)
            ]);
          });
        }

        const totalAPagar = cons.montoCalculado + debtInfo.totalDeuda;

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
        doc.setFontSize(14);
        doc.text(`Total a Pagar: S/ ${totalAPagar.toFixed(2)}`, 196, finalY + 8, { align: 'right' });
        
        const [yearStr, monthStr] = cons.mes.split('-');
        const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
        const monthName = new Date(`${cons.mes}-02`).toLocaleDateString('es', { month: 'long' });
        const expirationText = `${lastDay} de ${monthName} del ${yearStr}`;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Vence el: ${expirationText}`, 14, finalY + 6);
        doc.setFont('helvetica', 'normal');

        // Draw simulated QR
        const qrSize = 20;
        doc.rect(14, finalY + 12, qrSize, qrSize);
        doc.setFontSize(7);
        doc.text('Scanee para validar pago', 14, finalY + 36);

        doc.save(`Recibo_Consumo_${codSuministro}_${cons.mes}.pdf`);
        toast.success('Recibo de consumo descargado exitosamente.', { id: toastId });
      } else if (item.sourceType === 'PAGO_SUELDO') {
        const success = generatePayrollReceiptPDF(item.rawPayload);
        if (success) {
          toast.success('Boleta de pago de sueldo descargada exitosamente.', { id: toastId });
        } else {
          toast.error('Error al generar boleta de sueldo.', { id: toastId });
        }
      } else {
        // Ingreso or Egreso transaction
        const client = clients.find(c => c.id === item.clientId);
        const success = generateGeneralPaymentReceiptPDF(item.rawPayload, client);
        if (success) {
          toast.success('Comprobante descargado exitosamente.', { id: toastId });
        } else {
          toast.error('Error al descargar comprobante.', { id: toastId });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Fallo de impresión en lote del PDF.', { id: toastId });
    }
  };

  // Perform receipt voiding / annulment
  const handleAnnulReceipt = async (item: VirtualReceipt) => {
    const isAdminOrTesorero = userRole === 'ADMIN' || userRole === 'TESORERO';
    if (!isAdminOrTesorero) {
      toast.error('No tiene permisos para anular comprobantes. Comuníquese con el Administrador o Tesorero.');
      return;
    }

    const confirmResult = await confirm({
      title: 'Anular Comprobante',
      message: `¿Está absolutamente seguro de que desea ANULAR el recibo ${item.comprobanteNo}? Esta acción registrará el egreso o ingreso como cancelado, afectando los arqueos fiscales de manera permanente.`,
      type: 'danger',
      confirmLabel: 'Sí, anular comprobante',
      cancelLabel: 'Conservar activo'
    });

    if (!confirmResult) return;

    try {
      const toastId = toast.loading('Anulando comprobante...');
      
      // Persist in annulled set
      setAnnulledIds(prev => [...prev, item.uniqueId]);

      // If it's a consumption, we can also call deleteConsumption so it clears out or stays as audit
      if (item.sourceType === 'CONSUMO') {
        // Keeping it flag-wise in state or we can choose to delete from state:
        // We will keep it registered but with 'ANULADO' state via annulledIds, log it:
        addAuditLog('ELIMINAR', 'CONSUMOS', `Anuló recibo de consumo ${item.comprobanteNo} correspondiente al mes ${item.rawPayload.mes}.`);
      } else {
        addAuditLog('ELIMINAR', 'FINANZAS', `Anuló la transacción financiera ${item.comprobanteNo} por valor de S/ ${item.monto.toFixed(2)}.`);
      }

      toast.success('Comprobante anulado correctamente y guardado en auditoría.', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Error al anular comprobante.');
    }
  };

  // Dynamic status badges
  const renderStatusBadge = (estado: VirtualReceipt['estado']) => {
    switch (estado) {
      case 'PAGADO':
        return <Badge variant="success">PAGADO</Badge>;
      case 'PENDIENTE':
        return <Badge variant="warning">PENDIENTE</Badge>;
      case 'VENCIDO':
        return <Badge variant="danger">VENCIDO</Badge>;
      case 'ANULADO':
        return <Badge variant="default" className="bg-red-950/40 text-red-400 border-red-900/50">ANULADO</Badge>;
      default:
        return <Badge variant="default">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-500" />
            Consulta de Recibos
          </h1>
          <p className="text-sm text-slate-400">
            Buscador global, verificación fiscal y reimpresión de todos los comprobantes emitidos
          </p>
        </div>
      </div>

      {/* Integration Warnings / Active Parameters */}
      {(selectedClientId || selectedSupplyCode) && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex justify-between items-center text-sm text-blue-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              Mostrando recibos filtrados por{' '}
              {selectedClientId ? `Socio / Cliente` : ''}
              {selectedClientId && selectedSupplyCode ? ' y ' : ''}
              {selectedSupplyCode ? `Suministro "${selectedSupplyCode}"` : ''}
            </span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs font-semibold underline hover:text-blue-300"
          >
            Ver todos los recibos
          </button>
        </div>
      )}

      {/* Search Bar & Primary Filters */}
      <Card className="bg-[#0f131a] border-slate-800">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Quick Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar por N° Recibo, Suministro, DNI/RUC, Nombre, Dirección, Medidor..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-[#161c26] border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Toggle Advanced Filters */}
            <Button
              variant={showAdvanced ? 'secondary' : 'outline'}
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros Avanzados
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {/* Clear Filters Button */}
            {(searchTerm || filterEstado !== 'TODOS' || filterType !== 'TODOS' || filterCreator !== 'TODOS' || filterBilledMonth || filterStartDate || filterEndDate) && (
              <Button variant="ghost" onClick={handleResetFilters} className="text-red-400 hover:text-red-300">
                Limpiar Filtros
              </Button>
            )}
          </div>

          {/* Advanced Filters Drawer */}
          {showAdvanced && (
            <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
              {/* Filter: Estado */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Estado de Recibo</label>
                <select
                  value={filterEstado}
                  onChange={e => {
                    setFilterEstado(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
                >
                  <option value="TODOS">Todos los Estados</option>
                  <option value="PAGADO">PAGADO</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="VENCIDO">VENCIDO</option>
                  <option value="ANULADO">ANULADO</option>
                </select>
              </div>

              {/* Filter: Tipo de Comprobante */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Comprobante</label>
                <select
                  value={filterType}
                  onChange={e => {
                    setFilterType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
                >
                  <option value="TODOS">Todos los tipos</option>
                  <option value="CONSUMO">Consumo de energía</option>
                  <option value="VENTA_SERVICIO">Nuevo Suministro</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CUOTA_SOCIO">Cuota de socio</option>
                  <option value="PAGO_SUELDO">Pago de sueldo</option>
                  <option value="MULTA">Multas</option>
                  <option value="INGRESO">Otros Ingresos</option>
                  <option value="EGRESO">Otros Egresos</option>
                </select>
              </div>

              {/* Filter: Mes Facturado */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Mes Facturado</label>
                <input
                  type="month"
                  value={filterBilledMonth}
                  onChange={e => {
                    setFilterBilledMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-1.5 text-slate-200 focus:outline-none"
                />
              </div>

              {/* Filter: Registrado por */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Operador / Registrador</label>
                <select
                  value={filterCreator}
                  onChange={e => {
                    setFilterCreator(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none"
                >
                  <option value="TODOS">Todos los operadores</option>
                  {allCreators.map(user => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter: Fecha Emisión Desde */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Fecha Emisión (Desde)</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => {
                    setFilterStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-1.5 text-slate-200 focus:outline-none"
                />
              </div>

              {/* Filter: Fecha Emisión Hasta */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Fecha Emisión (Hasta)</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => {
                    setFilterEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-sm bg-[#161c26] border border-slate-800 rounded-lg p-1.5 text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RESULTS TABLE */}
      <Card className="bg-[#0f131a] border-slate-800 overflow-hidden shadow-xl rounded-xl">
        <div className="overflow-x-auto w-full">
          <table className="w-full divide-y divide-slate-800 table-fixed md:table-auto">
            <thead className="bg-[#141b25]">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[120px] md:w-[140px]">
                  N° Recibo
                </th>
                <th scope="col" className="px-3 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[90px] md:w-[110px]">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider min-w-[130px] md:min-w-[180px]">
                  Cliente / Trabajador
                </th>
                <th scope="col" className="px-3 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[80px] md:w-[100px]">
                  Suministro
                </th>
                <th scope="col" className="px-3 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider min-w-[150px] md:min-w-[220px]">
                  Concepto / Operación
                </th>
                <th scope="col" className="px-3 py-3 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[80px] md:w-[100px]">
                  Monto
                </th>
                <th scope="col" className="px-3 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[75px] md:w-[95px]">
                  Estado
                </th>
                <th scope="col" className="px-3 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider w-[70px] md:w-[90px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#0f131a]">
              {paginatedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500 text-sm">
                    No se encontraron comprobantes que coincidan con los filtros de búsqueda establecidos.
                  </td>
                </tr>
              ) : (
                paginatedReceipts.map(item => (
                  <tr key={item.uniqueId} className="hover:bg-[#161c26]/60 transition-colors">
                    <td className="px-3 py-2.5 text-sm font-semibold text-blue-400 font-mono break-all leading-tight">
                      {item.comprobanteNo}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 leading-tight">
                      {item.fecha ? format(parseISO(item.fecha), "dd MMM yyyy, HH:mm", { locale: es }) : '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs sm:text-sm font-semibold text-slate-300 break-words line-clamp-2">{item.clientName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">DNI: {item.clientDni || 'No req'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-300 font-semibold font-mono leading-tight break-all">
                      {item.codigoSuministro || '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-slate-300 font-medium break-words max-w-[280px]">
                        {item.concepto}
                        {item.sourceType === 'CONSUMO' && (() => {
                          const classification = getExonerationClassification(comites, item.codigoSuministro, item.rawPayload?.mes);
                          if (classification === 'EXONERATED') {
                            return (
                              <span className="block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-1.5 py-0.5 rounded w-fit">
                                Exonerado de pago por cargo en Comité Directivo
                              </span>
                            );
                          } else if (classification === 'PRE_EXONERATION') {
                            return (
                              <span className="block mt-1 text-[10px] font-bold text-orange-400 bg-orange-950/40 border border-orange-500/20 px-1.5 py-0.5 rounded w-fit">
                                Anterior a Exoneración Directiva
                              </span>
                            );
                          } else if (classification === 'POST_EXONERATION') {
                            return (
                              <span className="block mt-1 text-[10px] font-bold text-slate-400 bg-slate-900/40 border border-slate-700 px-1.5 py-0.5 rounded w-fit">
                                Posterior a Exoneración Directiva
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">Operador: {item.registradoPor}</div>
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs sm:text-sm font-bold ${
                      item.sourceType === 'EGRESO' || item.sourceType === 'PAGO_SUELDO' ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {item.sourceType === 'EGRESO' || item.sourceType === 'PAGO_SUELDO' ? '-' : '+'}{formatCurrency(item.monto)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {renderStatusBadge(item.estado)}
                    </td>
                    <td className="px-3 py-2.5 text-center space-x-1">
                      {/* Visualizar / Descargar PDF */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadPDF(item)}
                        title="Visualizar / Descargar PDF"
                        className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>

                      {/* Descargar Ticket 80mm */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadTicket(item)}
                        title="Imprimir Ticket (80mm)"
                        className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>

                      {/* Anular Comprobante */}
                      {item.estado !== 'ANULADO' && (userRole === 'ADMIN' || userRole === 'TESORERO') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAnnulReceipt(item)}
                          title="Anular Comprobante"
                          className="p-1.5 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION PANEL */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 bg-[#0f131a] flex justify-between items-center">
            <span className="text-xs text-slate-400">
              Mostrando {Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)} a {Math.min(totalItems, currentPage * itemsPerPage)} de {totalItems} comprobantes
            </span>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </Card>

    </div>
  );
}
