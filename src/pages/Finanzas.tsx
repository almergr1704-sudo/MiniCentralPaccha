import React, { useState, useRef, useEffect } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, Filter, Download, FileText, FileWarning, PowerOff, ChevronLeft, ChevronRight, User, MapPin, CreditCard, Activity, CheckCircle, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Button, Card, CardContent, Badge, CardHeader, CardTitle, Pagination } from '../components/ui';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { formatCurrency, render3DPieChartToDataURL, normalizeSearchText, scoreSupplyCodeMatch, scoreClientSuppliesMatch } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { TransactionType, Transaction } from '../store/types';
import { toast } from 'react-hot-toast';
import { generateGeneralPaymentReceiptPDF, generatePayrollReceiptPDF } from '../lib/receipts';
import { Briefcase, ArrowUpDown } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function Finanzas() {
  const { confirm } = useConfirm();
  const { 
    transactions, 
    addTransaction, 
    clients, 
    consumptions, 
    payConsumption, 
    fines, 
    payFine, 
    settings, 
    updateClient, 
    userRole, 
    toggleTransactionConciliado,
    trabajadores = [],
    pagosSueldos = [],
    addPagoSueldo,
    user
  } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState<false | 'INGRESO' | 'EGRESO' | 'APTOS_CORTE' | 'PAGO_SUELDO'>(false);
  const [filterType, setFilterType] = useState<TransactionType | 'TODOS'>('INGRESO');
  const [selectedMes, setSelectedMes] = useState(''); // Empty means All time
  const [clientSearch, setClientSearch] = useState('');
  const [searchSupplyCode, setSearchSupplyCode] = useState('');
  const [searchDniRuc, setSearchDniRuc] = useState('');
  const [searchName, setSearchName] = useState('');
  const [showOnlyAptForCut, setShowOnlyAptForCut] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSupplyCode, setSelectedSupplyCode] = useState('');
  const [showSuministroDropdown, setShowSuministroDropdown] = useState(false);
  const [aptosSearch, setAptosSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    tipo: 'INGRESO' as TransactionType,
    categoria: 'OTROS',
    monto: '',
    descripcion: '',
    destinatario: ''
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const handleGenerateEgresoPDF = (t: Transaction) => {
    const toastId = toast.loading('Generando PDF...');
    try {
      const success = generateGeneralPaymentReceiptPDF(t, undefined);
      if (success) {
        toast.success('Comprobante generado y descargado con éxito.', { id: toastId });
      } else {
        toast.error('Error al generar comprobante.', { id: toastId });
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar comprobante.', { id: toastId });
    }
  };

  const [sueldoForm, setSueldoForm] = useState({
    trabajadorId: '',
    trabajadorNombreCompleto: '',
    trabajadorDni: '',
    trabajadorCargo: '',
    mesPagado: (() => {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      return `${today.getFullYear()}-${mm}`;
    })(),
    monto: 0,
    observaciones: ''
  });

  const [workerSearchDni, setWorkerSearchDni] = useState('');
  const [workerSearchName, setWorkerSearchName] = useState('');
  const [workerSortColumn, setWorkerSortColumn] = useState<'dni' | 'nombre' | 'cargo' | 'area' | 'estado' | 'ultimoPago' | 'estadoPago'>('nombre');
  const [workerSortDirection, setWorkerSortDirection] = useState<'asc' | 'desc'>('asc');
  const [workerPageSize, setWorkerPageSize] = useState<number>(10);
  const [workerCurrentPage, setWorkerCurrentPage] = useState<number>(1);

  const closeModal = () => {
    setIsModalOpen(false);
    setShowOnlyAptForCut(false);
    setAptosSearch('');
    setFormData({ tipo: 'INGRESO', categoria: 'OTROS', monto: '', descripcion: '', destinatario: '' });
    setSelectedClientId('');
    setClientSearch('');
    setSearchSupplyCode('');
    setSearchDniRuc('');
    setSearchName('');
    setWorkerSearchDni('');
    setWorkerSearchName('');
    setWorkerSortColumn('nombre');
    setWorkerSortDirection('asc');
    setWorkerPageSize(10);
    setWorkerCurrentPage(1);
    setSueldoForm({
      trabajadorId: '',
      trabajadorNombreCompleto: '',
      trabajadorDni: '',
      trabajadorCargo: '',
      mesPagado: (() => {
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        return `${today.getFullYear()}-${mm}`;
      })(),
      monto: 0,
      observaciones: ''
    });
  };

  const generatePrintHTML = (clientsToPrint: any[]) => {
    const orgName = settings?.nombreOrganizacion || 'Asociación Administradora de Servicios de Saneamiento';
    const title = "Reporte de Suministros Aptos para Corte";
    const userGen = user?.email || 'Administrador';
    const dateFormatted = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

    let totalSupplies = clientsToPrint.length;
    let totalMonths = 0;
    let totalOwed = 0;

    const rowsHTML = clientsToPrint.map((c, index) => {
      const pendingCons = consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE');
      const months = pendingCons.length;
      const owedSum = pendingCons.reduce((sum, cons) => sum + (cons.montoCalculado || 0), 0);
      const fullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;

      totalMonths += months;
      totalOwed += owedSum;

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
          <td style="padding: 8px; text-align: left; font-size: 11px;">${index + 1}</td>
          <td style="padding: 8px; text-align: left; font-size: 11px; font-weight: bold;">${c.codigoSuministro || '-'}</td>
          <td style="padding: 8px; text-align: left; font-size: 11px;">${fullName}</td>
          <td style="padding: 8px; text-align: left; font-size: 11px;">${c.tipo === 'SOCIO' ? 'Socio' : 'Usuario'}</td>
          <td style="padding: 8px; text-align: left; font-size: 11px;">${c.direccion || '-'} ${c.numeroDireccion || ''}</td>
          <td style="padding: 8px; text-align: center; font-size: 11px; font-weight: bold; color: #dc2626;">${months}</td>
          <td style="padding: 8px; text-align: right; font-size: 11px; font-weight: bold;">S/ ${owedSum.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #1e293b;
            margin: 30px;
            line-height: 1.4;
          }
          .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .org-name {
            font-size: 12px;
            font-weight: bold;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .title {
            font-size: 20px;
            font-weight: bold;
            color: #0f172a;
            margin: 5px 0;
          }
          .meta-info {
            font-size: 10px;
            color: #64748b;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
          }
          th {
            background-color: #f1f5f9;
            border-bottom: 2px solid #cbd5e1;
            color: #334155;
            font-weight: bold;
            font-size: 11px;
            padding: 10px 8px;
          }
          .summary-box {
            border: 1px solid #cbd5e1;
            background-color: #f8fafc;
            border-radius: 6px;
            padding: 12px;
            width: 260px;
            margin-left: auto;
            page-break-inside: avoid;
          }
          .summary-title {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            margin-bottom: 8px;
            color: #1e293b;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 4px;
          }
          .summary-row.total {
            font-size: 12px;
            font-weight: bold;
            border-top: 1px solid #cbd5e1;
            padding-top: 4px;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="org-name">${orgName}</div>
          <h1 class="title">${title}</h1>
          <div class="meta-info">
            Fecha de emisión: ${dateFormatted} | Usuario originador: ${userGen}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 5%; text-align: left;">#</th>
              <th style="width: 15%; text-align: left;">Suministro</th>
              <th style="width: 30%; text-align: left;">Titular</th>
              <th style="width: 12%; text-align: left;">Tipo</th>
              <th style="width: 20%; text-align: left;">Dirección</th>
              <th style="width: 8%; text-align: center;">Meses</th>
              <th style="width: 10%; text-align: right;">Deuda Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-title">Resumen de deudores</div>
          <div class="summary-row">
            <span>Suministros Aptos:</span>
            <span style="font-weight: bold;">${totalSupplies}</span>
          </div>
          <div class="summary-row">
            <span>Total Meses:</span>
            <span style="font-weight: bold;">${totalMonths}</span>
          </div>
          <div class="summary-row total">
            <span>Monto Total:</span>
            <span style="color: #dc2626;">S/ ${totalOwed.toFixed(2)}</span>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintAptos = (clientsToPrint: any[]) => {
    let printFrame = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-iframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }
    
    const iframeDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(generatePrintHTML(clientsToPrint));
      iframeDoc.close();
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      }, 500);
    }
  };

  const handleGeneratePDFAptos = (clientsToPrint: any[]) => {
    const doc = new jsPDF();
    const orgName = settings?.nombreOrganizacion || 'Asociación Administradora de Servicios de Saneamiento';
    const title = "Reporte de Suministros Aptos para Corte";
    const userGen = user?.email || 'Administrador';
    const dateFormatted = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

    // Organization Header
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(orgName.toUpperCase(), 14, 15);
    
    // Title
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate 900
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 25);

    // Metadata line
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha/Hora de generación: ${dateFormatted}  |  Usuario: ${userGen}`, 14, 32);

    // Divider line
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    let totalSupplies = clientsToPrint.length;
    let totalMonths = 0;
    let totalOwed = 0;

    const tableData = clientsToPrint.map((c, index) => {
      const pendingCons = consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE');
      const months = pendingCons.length;
      const owedSum = pendingCons.reduce((sum, cons) => sum + (cons.montoCalculado || 0), 0);
      const fullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;

      totalMonths += months;
      totalOwed += owedSum;

      return [
        (index + 1).toString(),
        c.codigoSuministro || '-',
        fullName,
        c.tipo === 'SOCIO' ? 'Socio' : 'Usuario',
        `${c.direccion || '-'} ${c.numeroDireccion || ''}`.trim(),
        months.toString(),
        `S/ ${owedSum.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['#', 'Suministro', 'Titular', 'Tipo', 'Dirección', 'Meses', 'Deuda Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 45 },
        3: { cellWidth: 18 },
        4: { cellWidth: 60 },
        5: { cellWidth: 15, halign: 'center', fontStyle: 'bold', textColor: [220, 38, 38] },
        6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
      }
    });

    // Adding Summary Box after table
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // Draw box
    doc.setDrawColor(203, 213, 225); // slate 300
    doc.setFillColor(248, 250, 252); // slate 50
    doc.rect(130, finalY, 66, 30, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('RESUMEN DE CORTES', 134, finalY + 6);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Suministros Aptos:`, 134, finalY + 13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalSupplies}`, 190, finalY + 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Meses Adeudados:`, 134, finalY + 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalMonths}`, 190, finalY + 20, { align: 'right' });

    // Divider inside summary box
    doc.setDrawColor(226, 232, 240);
    doc.line(134, finalY + 23, 192, finalY + 23);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Monto Total:`, 134, finalY + 28);
    doc.setTextColor(220, 38, 38);
    doc.text(`S/ ${totalOwed.toFixed(2)}`, 190, finalY + 28, { align: 'right' });

    doc.save('Reporte_Suministros_Aptos_Corte.pdf');
  };

  const handleSueldoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sueldoForm.trabajadorId) {
      toast.error('Por favor, seleccione un trabajador de planta.');
      return;
    }
    if (sueldoForm.monto <= 0) {
      toast.error('Monto de remuneración inválido.');
      return;
    }
    if (!sueldoForm.mesPagado) {
      toast.error('Seleccione el mes remunerado.');
      return;
    }

    const confirmTx = await confirm({
      title: 'Confirmar Pago de Planilla',
      message: `¿Está seguro de registrar este pago de sueldo por S/ ${sueldoForm.monto.toFixed(2)} a ${sueldoForm.trabajadorNombreCompleto} por el mes de ${sueldoForm.mesPagado}?`,
      type: 'confirm',
      confirmLabel: 'Registrar y Emitir',
      cancelLabel: 'Cancelar'
    });
    if (!confirmTx) return;

    try {
      const nPago = await addPagoSueldo(sueldoForm);
      // Trigger PDF Receipt boleta de pago
      generatePayrollReceiptPDF(nPago);
      toast.success('Pago de sueldo registrado y boleta descargada exitosamente.');
      closeModal();
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar remuneración.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isModalOpen === 'INGRESO' && ['CONSUMO', 'MULTA'].includes(formData.categoria)) {
      return;
    }
    
    if (!formData.monto) return;
    const confirmTx = await confirm({
      title: 'Registrar Transacción',
      message: '¿Está seguro de registrar esta transacción?',
      type: 'confirm',
      confirmLabel: 'Registrar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmTx) return;
    
    const newTx = {
      tipo: formData.tipo,
      categoria: formData.categoria as any,
      monto: Number(formData.monto),
      descripcion: formData.descripcion,
      destinatario: formData.tipo === 'EGRESO' ? formData.destinatario : undefined,
      clientId: selectedClientId || undefined,
      codigoSuministro: selectedSupplyCode || undefined
    };
    
    await addTransaction(newTx);
    
    if (formData.tipo === 'EGRESO') {
      // Create a dummy transaction object to pass to the PDF generator
      handleGenerateEgresoPDF({ ...newTx, id: 'temp', fecha: new Date().toISOString() });
    }
    
    closeModal();
  };

  const handleGenerateReportPDFDetailed = (type: 'INGRESO' | 'EGRESO') => {
    const toastId = toast.loading(`Generando reporte de ${type.toLowerCase()}...`);
    try {
      const doc = new jsPDF();
    doc.text(`Reporte Detallado de Transacciones - ${type}`, 14, 20);
    
    if (selectedMes) {
      doc.setFontSize(10);
      doc.text(`Mes: ${selectedMes}`, 14, 26);
    }
    
    let tableData: any[][] = [];
    let headParams: string[][] = [];

    // Filter by type, and selected month if any
    const txForReport = transactions
      .filter(t => t.tipo === type)
      .filter(t => selectedMes ? t.fecha.startsWith(selectedMes) : true)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    if (txForReport.length === 0) {
      toast.error('No existen datos disponibles para generar el PDF.');
      return;
    }

    const totalAmount = txForReport.reduce((acc, t) => acc + t.monto, 0);

    tableData = txForReport.map(t => {
      const client = clients.find(c => c.id === t.clientId);
      const clientName = client ? `${client.apellidos}, ${client.nombres.slice(0, 8)}.` : '';
      let supplyCode = t.codigoSuministro || '';
      if (!supplyCode && t.referencia) {
        const match = t.referencia.match(/SUM-\d+/i);
        if (match) supplyCode = match[0].toUpperCase();
      }
      if (!supplyCode && t.descripcion) {
        const match = t.descripcion.match(/SUM-\d+/i);
        if (match) supplyCode = match[0].toUpperCase();
      }
      const clientAndSupply = [supplyCode, clientName].filter(Boolean).join(' - ');
      return [
        format(parseISO(t.fecha), 'dd/MM/yyyy HH:mm'),
        t.categoria.replace('_', ' '),
        clientAndSupply || t.destinatario || 'N/A',
        t.descripcion,
        formatCurrency(t.monto)
      ];
    });
    tableData.push(['TOTAL GENERAL', '', '', '', formatCurrency(totalAmount)]);
    headParams = [['Fecha', 'Categoría', 'Cliente / Suministro', 'Descripción', type === 'INGRESO' ? 'Monto Ingreso' : 'Monto Egreso']];

    autoTable(doc, {
      startY: selectedMes ? 35 : 30,
      head: headParams,
      body: tableData,
      didParseCell: function(data: any) {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    const finalY = (doc as any).lastAutoTable?.finalY + 10 || 40;
    doc.setFontSize(12);
    doc.text(`Total ${type === 'INGRESO' ? 'Ingresos' : 'Egresos'}: ${formatCurrency(totalAmount)}`, 14, finalY);

    // Add 3D Pie Chart
    const catMap: Record<string, number> = {};
    txForReport.forEach(t => {
      catMap[t.categoria.replace('_', ' ')] = (catMap[t.categoria.replace('_', ' ')] || 0) + t.monto;
    });
    
    const chartData = Object.entries(catMap).map(([name, value], i) => ({
      name,
      value,
      color: COLORS[i % COLORS.length]
    }));

    if (chartData.length > 0) {
       let finalChartY = finalY + 10;
       if (finalChartY + 85 > 290) {
          doc.addPage();
          finalChartY = 20;
       }
       const imgData = render3DPieChartToDataURL(chartData, `Gráfico de ${type === 'INGRESO' ? 'Ingresos' : 'Egresos'}`);
       if (imgData) {
          doc.addImage(imgData, 'PNG', 45, finalChartY, 120, 84);
       }
    }

      doc.save(`Reporte_Detallado_${type}_${selectedMes || 'Historico'}.pdf`);
      toast.success('Reporte generado y descargado con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF.', { id: toastId });
    }
  };

  const handleGenerateReportExcel = () => {
    let exportData: any[] = [];
    const reportIngresos = filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0);
    const reportEgresos = filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0);

    if (filterType === 'TODOS') {
      exportData = filteredTransactions.map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const clientName = client ? `${client.apellidos}, ${client.nombres}` : '';
        let supplyCode = t.codigoSuministro || '';
        if (!supplyCode && t.referencia) {
          const match = t.referencia.match(/SUM-\d+/i);
          if (match) supplyCode = match[0].toUpperCase();
        }
        if (!supplyCode && t.descripcion) {
          const match = t.descripcion.match(/SUM-\d+/i);
          if (match) supplyCode = match[0].toUpperCase();
        }
        return {
          Fecha: format(parseISO(t.fecha), 'dd/MM/yyyy HH:mm'),
          Comprobante: t.comprobante || '',
          Suministro: supplyCode || 'N/A',
          Cliente: clientName || t.destinatario || 'General',
          Categoría: t.categoria.replace('_', ' '),
          Descripción: t.descripcion,
          'Ingreso (S/)': t.tipo === 'INGRESO' ? t.monto : 0,
          'Egreso (S/)': t.tipo === 'EGRESO' ? t.monto : 0
        };
      });
      exportData.push({
        Fecha: 'TOTAL GENERAL',
        Comprobante: '',
        Suministro: '',
        Cliente: '',
        Categoría: '',
        Descripción: '',
        'Ingreso (S/)': reportIngresos,
        'Egreso (S/)': reportEgresos
      });
    } else {
      exportData = filteredTransactions.map(t => {
        const client = clients.find(c => c.id === t.clientId);
        const clientName = client ? `${client.apellidos}, ${client.nombres}` : '';
        let supplyCode = t.codigoSuministro || '';
        if (!supplyCode && t.referencia) {
          const match = t.referencia.match(/SUM-\d+/i);
          if (match) supplyCode = match[0].toUpperCase();
        }
        if (!supplyCode && t.descripcion) {
          const match = t.descripcion.match(/SUM-\d+/i);
          if (match) supplyCode = match[0].toUpperCase();
        }
        return {
          Fecha: format(parseISO(t.fecha), 'dd/MM/yyyy HH:mm'),
          Comprobante: t.comprobante || '',
          Suministro: supplyCode || 'N/A',
          Cliente: clientName || t.destinatario || 'General',
          Categoría: t.categoria.replace('_', ' '),
          Descripción: t.descripcion,
          [filterType === 'INGRESO' ? 'Monto Ingreso (S/)' : 'Monto Egreso (S/)']: t.monto
        };
      });
      exportData.push({
        Fecha: 'TOTAL GENERAL',
        Comprobante: '',
        Suministro: '',
        Cliente: '',
        Categoría: '',
        Descripción: '',
        [filterType === 'INGRESO' ? 'Monto Ingreso (S/)' : 'Monto Egreso (S/)']: filterType === 'INGRESO' ? reportIngresos : reportEgresos
      });
    }

    let totalesData: any[] = [];
    if (filterType === 'TODOS') {
      totalesData = [{
        'Total Ingresos': reportIngresos,
        'Total Egresos': reportEgresos,
        'Balance Final': reportIngresos - reportEgresos
      }];
    } else if (filterType === 'INGRESO') {
      totalesData = [{ 'Total Ingresos': reportIngresos }];
    } else if (filterType === 'EGRESO') {
      totalesData = [{ 'Total Egresos': reportEgresos }];
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wsTotales = XLSX.utils.json_to_sheet(totalesData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
    XLSX.utils.book_append_sheet(wb, wsTotales, "Totales");
    XLSX.writeFile(wb, `Reporte_Transacciones_${filterType}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const filteredTransactions = transactions
    .filter(t => filterType === 'TODOS' || t.tipo === filterType)
    .filter(t => selectedMes ? t.fecha.startsWith(selectedMes) : true)
    .sort((a, b) => {
      if (selectedMes) {
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      }
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const currentTransactions = filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, selectedMes]);

  // Quick stats
  const totalIngresos = (selectedMes ? transactions.filter(t => t.fecha.startsWith(selectedMes)) : transactions).filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0);
  const totalEgresos = (selectedMes ? transactions.filter(t => t.fecha.startsWith(selectedMes)) : transactions).filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0);
  const balance = totalIngresos - totalEgresos;

  const searchedClients = clients.filter(c => {
    const isActivoOrCortado = c.estado === 'ACTIVO' || c.estado === 'CORTADO';
    if (!isActivoOrCortado) return false;

    if (showOnlyAptForCut) {
        const pendingDebtsCount = consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE').length;
        if (!(pendingDebtsCount >= 3 && c.estado !== 'CORTADO')) return false;
    }

    if (!clientSearch && !searchSupplyCode && !searchDniRuc && !searchName) return true;
    
    let matches = true;

    if (clientSearch) {
      const searchNormalized = normalizeSearchText(clientSearch);
      const rawFullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;
      const fullName = normalizeSearchText(rawFullName);
      const dni = normalizeSearchText(c.dni || '');
      const address = normalizeSearchText(c.direccion || '');
      const supScore = scoreClientSuppliesMatch(c.codigoSuministro, c.suministros, clientSearch);
      
      const itemMatch = supScore > 0 ||
                        dni.includes(searchNormalized) ||
                        fullName.includes(searchNormalized) ||
                        address.includes(searchNormalized);
      if (!itemMatch) matches = false;
    }

    if (searchSupplyCode) {
      const supScore = scoreClientSuppliesMatch(c.codigoSuministro, c.suministros, searchSupplyCode);
      if (supScore === 0) matches = false;
    }

    if (searchDniRuc) {
      const searchNormalized = normalizeSearchText(searchDniRuc);
      const dni = normalizeSearchText(c.dni || '');
      if (!dni.includes(searchNormalized)) matches = false;
    }

    if (searchName) {
      const searchNormalized = normalizeSearchText(searchName);
      const rawFullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;
      const fullName = normalizeSearchText(rawFullName);
      if (!fullName.includes(searchNormalized)) matches = false;
    }

    return matches;
  });

  const availableSupplies = React.useMemo(() => {
     let supplies: { 
       id: string; 
       sup: string; 
       label: string; 
       desc: string;
       client: typeof clients[0];
       pendingBalance: number;
       hasDebt: boolean;
       pendingMonthsCount: number;
     }[] = [];
     searchedClients.forEach(c => {
        const clientSupplies = c.suministros?.length ? c.suministros : [c.codigoSuministro];
        clientSupplies.forEach(sup => {
           if (!sup) return;
           
           const supplyConsumptions = consumptions.filter(cons => cons.clientId === c.id && cons.codigoSuministro === sup && cons.estadoPago === 'PENDIENTE');
           const consSum = supplyConsumptions.reduce((sum, cons) => sum + cons.montoCalculado, 0);
           
           const clientFines = (fines || []).filter(f => f.clientId === c.id && f.estadoPago === 'PENDIENTE');
           const finesSum = clientFines.reduce((sum, f) => sum + f.monto, 0);
           
           const reconFee = c.estado === 'CORTADO' ? (settings?.costoReconexion || 0) : 0;
           const totalPending = consSum + finesSum + reconFee;

           supplies.push({
              id: c.id,
              sup: sup,
              label: `${sup} - ${c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`}`,
              desc: `DNI/RUC: ${c.dni} | Direcc: ${c.direccion || '-'} | Tipo: ${c.tipo} | Est: ${c.estado}`,
              client: c,
              pendingBalance: totalPending,
              hasDebt: totalPending > 0,
              pendingMonthsCount: supplyConsumptions.length
           });
        });
      });

      if (clientSearch || searchSupplyCode || searchDniRuc || searchName) {
        supplies.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;

          const calcScore = (item: typeof a) => {
            let score = 0;
            const dniLower = normalizeSearchText(item.client.dni || '');
            const rawName = item.client.nombre ? item.client.nombre : `${item.client.nombres || ''} ${item.client.apellidos || ''}`;
            const nameLower = normalizeSearchText(rawName);
            const addrLower = normalizeSearchText(item.client.direccion || '');

            if (clientSearch) {
              const q = clientSearch;
              const qNorm = normalizeSearchText(clientSearch);
              const supScore = scoreSupplyCodeMatch(item.sup, q);
              score += supScore * 10;

              if (dniLower === qNorm) score += 800;
              else if (dniLower.startsWith(qNorm)) score += 400;
              else if (dniLower.includes(qNorm)) score += 80;

              if (nameLower === qNorm) score += 600;
              else if (nameLower.startsWith(qNorm)) score += 300;
              else if (nameLower.includes(qNorm)) score += 60;

              if (addrLower.includes(qNorm)) score += 20;
            }

            if (searchSupplyCode) {
              const q = searchSupplyCode;
              const supScore = scoreSupplyCodeMatch(item.sup, q);
              score += supScore * 20;
            }

            if (searchDniRuc) {
              const q = normalizeSearchText(searchDniRuc);
              if (dniLower === q) score += 1600;
              else if (dniLower.startsWith(q)) score += 800;
              else if (dniLower.includes(q)) score += 160;
            }

            if (searchName) {
              const q = normalizeSearchText(searchName);
              if (nameLower === q) score += 1200;
              else if (nameLower.startsWith(q)) score += 600;
              else if (nameLower.includes(q)) score += 120;
            }

            return score;
          };

          scoreA = calcScore(a);
          scoreB = calcScore(b);

          return scoreB - scoreA;
        });
      }

      return supplies;
  }, [searchedClients, consumptions, fines, settings, clientSearch, searchSupplyCode, searchDniRuc, searchName]);

  useEffect(() => {
    if (clientSearch && availableSupplies.length === 1 && availableSupplies[0].sup === clientSearch.trim()) {
       setSelectedClientId(availableSupplies[0].id);
       setSelectedSupplyCode(availableSupplies[0].sup);
       setShowSuministroDropdown(false);
     }
  }, [clientSearch, availableSupplies]);

  // Reset worker sorting to ascending when worker search inputs change
  useEffect(() => {
    setWorkerCurrentPage(1);
    setWorkerSortDirection('asc');
  }, [workerSearchDni, workerSearchName]);

  const pendingConsumptions = consumptions.filter(c => c.clientId === selectedClientId && (!selectedSupplyCode || c.codigoSuministro === selectedSupplyCode) && c.estadoPago === 'PENDIENTE');
  const pendingFines = (fines || []).filter(c => c.clientId === selectedClientId && c.estadoPago === 'PENDIENTE');
  
  const selectedClientObj = clients.find(c => c.id === selectedClientId);
  const isCortado = selectedClientObj?.estado === 'CORTADO';
  const reconexionFee = settings?.costoReconexion || 0;
  
  const totalDeuda = pendingConsumptions.reduce((acc, c) => acc + c.montoCalculado, 0) + pendingFines.reduce((acc, f) => acc + f.monto, 0) + (isCortado ? reconexionFee : 0);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Control Financiero
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Registro y seguimiento de ingresos y egresos de la central.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 space-x-3 flex items-center">
          <Button 
            onClick={() => { 
                setShowOnlyAptForCut(true); 
                setIsModalOpen('APTOS_CORTE'); 
            }} 
            className="bg-transparent border border-red-500/50 text-red-500 hover:bg-red-900/20"
          >
            <FileWarning className="-ml-1 mr-2 h-4 w-4" />
            Aptos para corte
          </Button>
          {userRole !== 'FISCALIZADOR' && (
            <>
              <Button onClick={() => { setIsModalOpen('PAGO_SUELDO'); }} className="bg-blue-600 hover:bg-blue-500 text-white border-0">
                <Briefcase className="-ml-1 mr-2 h-4 w-4" aria-hidden="true" />
                Pago de Sueldos
              </Button>
              <Button onClick={() => { setFormData({...formData, tipo: 'INGRESO', categoria: 'OTROS'}); setIsModalOpen('INGRESO'); }} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                Nuevo Cobro
              </Button>
              <Button onClick={() => { setFormData({...formData, tipo: 'EGRESO', categoria: 'MANTENIMIENTO'}); setIsModalOpen('EGRESO'); }} className="bg-red-600 hover:bg-red-500 text-white border-0">
                <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                Nuevo Pago
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <dt className="text-sm font-medium text-slate-400 truncate">Total Ingresos</dt>
            <dd className="mt-1 text-2xl font-semibold text-emerald-600">{formatCurrency(totalIngresos)}</dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <dt className="text-sm font-medium text-slate-400 truncate">Total Egresos</dt>
            <dd className="mt-1 text-2xl font-semibold text-red-600">{formatCurrency(totalEgresos)}</dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <dt className="text-sm font-medium text-slate-400 truncate">Balance General</dt>
            <dd className={`mt-1 text-2xl font-semibold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(balance)}
            </dd>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center sm:pr-4">
            <nav className="flex -mb-px w-full sm:w-2/3" aria-label="Tabs">
              <button
                onClick={() => setFilterType('INGRESO')}
                className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                  filterType === 'INGRESO'
                    ? 'border-emerald-500 text-emerald-500'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                }`}
              >
                Cobros (Ingresos)
              </button>
              <button
                onClick={() => setFilterType('EGRESO')}
                className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                  filterType === 'EGRESO'
                    ? 'border-red-500 text-red-500'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                }`}
              >
                Pagos (Egresos)
              </button>
            </nav>
            <div className="flex flex-wrap items-center space-x-2 py-3 px-4 sm:p-0">
               <input 
                 type="month" 
                 value={selectedMes}
                 onChange={(e) => setSelectedMes(e.target.value)}
                 className="block border-slate-700 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm border bg-[#0B0E14] text-slate-100"
               />
               <Button variant="outline" size="sm" onClick={() => handleGenerateReportPDFDetailed('INGRESO')}>
                 <FileText className="-ml-1 mr-2 h-4 w-4" />
                 PDF Ingresos
               </Button>
               <Button variant="outline" size="sm" onClick={() => handleGenerateReportPDFDetailed('EGRESO')}>
                 <FileText className="-ml-1 mr-2 h-4 w-4" />
                 PDF Egresos
               </Button>
               <Button variant="outline" size="sm" onClick={handleGenerateReportExcel} className="hidden lg:inline-flex">
                 <Download className="-ml-1 mr-2 h-4 w-4" />
                 Excel
               </Button>
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredTransactions.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            disableTopBorder={true}
          />

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800">
              <thead className="bg-slate-800/80">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">Fecha</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">Categoría</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-200 uppercase tracking-wider">Descripción</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-200 uppercase tracking-wider">Monto</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-200 uppercase tracking-wider">Conciliado</th>
                </tr>
              </thead>
              <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                {currentTransactions.length > 0 ? currentTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                      {format(parseISO(t.fecha), 'dd MMM yyyy, HH:mm', { locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        t.tipo === 'INGRESO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {t.categoria.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-white max-w-xs truncate">
                      {t.tipo === 'EGRESO' && t.destinatario && <div className="text-xs text-slate-300 mb-0.5">Para: {t.destinatario}</div>}
                      {t.descripcion}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${
                      t.tipo === 'INGRESO' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {t.tipo === 'INGRESO' ? '+' : '-'}{formatCurrency(t.monto)}
                      {t.tipo === 'EGRESO' && (
                        <Button variant="ghost" size="sm" onClick={() => handleGenerateEgresoPDF(t)} className="ml-2 px-2 text-slate-300 hover:text-white" title="Descargar comprobante de egreso">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {t.tipo === 'INGRESO' && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          const client = clients.find(c => c.id === t.clientId);
                          generateGeneralPaymentReceiptPDF(t, client);
                        }} className="ml-2 px-2 text-slate-300 hover:text-white" title="Descargar recibo de pago">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button 
                        onClick={() => {
                          if (userRole === 'ADMIN' || userRole === 'TESORERO') {
                            toggleTransactionConciliado(t.id);
                            toast.success(`Transacción ${t.conciliado ? 'desmarcada' : 'marcada'} como conciliada.`);
                          } else {
                            toast.error('No tiene permisos para conciliar movimientos.');
                          }
                        }}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                          t.conciliado 
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                        }`}
                        title={t.conciliado ? "Conciliado (haga clic para deshacer)" : "Marcar como conciliado"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-300">
                      No hay transacciones en esta sección.
                    </td>
                  </tr>
                )}
              </tbody>

            </table>
            
            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredTransactions.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modal Add Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={closeModal}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className={`relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:w-full ${isModalOpen === 'APTOS_CORTE' ? 'sm:max-w-4xl' : isModalOpen === 'INGRESO' ? 'sm:max-w-5xl' : 'sm:max-w-md'}`}>
              <form onSubmit={handleSubmit}>
                <div className="bg-[#0B0E14] px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-slate-100 mb-4" id="modal-title">
                    {isModalOpen === 'INGRESO' ? 'Registrar Nuevo Cobro' : isModalOpen === 'EGRESO' ? 'Registrar Nuevo Pago' : 'Usuarios Aptos para Corte'}
                  </h3>
                  {isModalOpen === 'APTOS_CORTE' ? (
                    <div className="mt-2 space-y-4">
                      {(() => {
                        const filteredAptos = clients.filter(c => {
                          const pendingDebtsCount = consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE').length;
                          const isApto = pendingDebtsCount >= 3 && c.estado !== 'CORTADO';
                          if (!isApto) return false;
                          
                          if (!aptosSearch) return true;
                          const searchClean = normalizeSearchText(aptosSearch);
                          const fullName = normalizeSearchText(c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`);
                          const supply = normalizeSearchText(c.codigoSuministro || '');
                          const dni = normalizeSearchText(c.dni || '');
                          return fullName.includes(searchClean) || supply.includes(searchClean) || dni.includes(searchClean);
                        });

                        const totalAptos = filteredAptos.length;
                        const totalMonths = filteredAptos.reduce((acc, c) => acc + consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE').length, 0);
                        const totalAmount = filteredAptos.reduce((acc, c) => acc + consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE').reduce((sum, cons) => sum + (cons.montoCalculado || 0), 0), 0);

                        return (
                          <div className="space-y-4">
                            {/* Search bar + buttons */}
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  placeholder="Filtrar por suministro, titular o DNI..."
                                  value={aptosSearch}
                                  onChange={(e) => setAptosSearch(e.target.value)}
                                  className="block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-800 text-slate-100 placeholder-slate-400"
                                />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePrintAptos(filteredAptos)}
                                  className="bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700 font-semibold"
                                  disabled={totalAptos === 0}
                                >
                                  <FileText className="w-4 h-4 mr-2 text-slate-400" />
                                  Imprimir
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleGeneratePDFAptos(filteredAptos)}
                                  className="bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700 font-semibold"
                                  disabled={totalAptos === 0}
                                >
                                  <Download className="w-4 h-4 mr-2 text-slate-400" />
                                  Descargar PDF
                                </Button>
                              </div>
                            </div>

                            {totalAptos === 0 ? (
                              <p className="text-sm text-slate-400 p-8 text-center bg-slate-900/20 border border-slate-800 rounded-lg">No hay usuarios aptos para corte que coincidan con la búsqueda.</p>
                            ) : (
                              <>
                                <div className="max-h-96 overflow-auto border border-slate-700/60 rounded-lg">
                                  <table className="min-w-full divide-y divide-slate-700 text-sm">
                                    <thead className="bg-[#111622] sticky top-0 z-10 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                                      <tr>
                                        <th scope="col" className="px-4 py-3 text-left">Suministro</th>
                                        <th scope="col" className="px-4 py-3 text-left">Titular</th>
                                        <th scope="col" className="px-4 py-3 text-left">Tipo</th>
                                        <th scope="col" className="px-4 py-3 text-left">Dirección</th>
                                        <th scope="col" className="px-4 py-3 text-center">Meses Deuda</th>
                                        <th scope="col" className="px-4 py-3 text-right">Monto Total</th>
                                        <th scope="col" className="px-4 py-3 text-center">Acción</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-slate-300 bg-slate-900/40">
                                      {filteredAptos.map(c => {
                                        const pending = consumptions.filter(cons => cons.clientId === c.id && cons.estadoPago === 'PENDIENTE');
                                        const months = pending.length;
                                        const amountOwed = pending.reduce((sum, cons) => sum + (cons.montoCalculado || 0), 0);
                                        const fullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;

                                        return (
                                          <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-purple-300 text-xs">{c.codigoSuministro}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-200" title={fullName}>
                                              {fullName.length > 25 ? `${fullName.substring(0, 25)}...` : fullName}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                                c.tipo === 'SOCIO' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/55' : 'bg-blue-950/40 text-blue-400 border border-blue-800/55'
                                              }`}>
                                                {c.tipo}
                                              </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-400" title={c.direccion}>
                                              {c.direccion ? (c.direccion.length > 22 ? `${c.direccion.substring(0, 22)}...` : c.direccion) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center font-bold text-red-500 text-xs">{months}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-200 text-xs">{formatCurrency(amountOwed)}</td>
                                            <td className="px-4 py-3 text-center">
                                              {userRole !== 'FISCALIZADOR' && (
                                                <Button size="sm" variant="destructive" className="bg-red-600 hover:bg-red-700 font-semibold py-1 h-7 text-xs" type="button" onClick={async () => {
                                                  const confirmChange = await confirm({
                                                    title: 'Cortar Servicio',
                                                    message: `¿Está seguro de cambiar el estado de ${c.codigoSuministro} a CORTADO?`,
                                                    type: 'danger',
                                                    confirmLabel: 'Sí, cortar'
                                                  });
                                                  if (confirmChange) {
                                                    updateClient(c.id, { estado: 'CORTADO' });
                                                  }
                                                }}>
                                                  Cortar
                                                </Button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Summary Box */}
                                <div className="border border-slate-700 bg-slate-900/50 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Total Suministros:</span>
                                    <span className="font-bold text-slate-100 text-sm">{totalAptos}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Meses de Deuda:</span>
                                    <span className="font-bold text-slate-100 text-sm">{totalMonths}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Monto Adeudado:</span>
                                    <span className="font-bold text-red-400 text-sm">{formatCurrency(totalAmount)}</span>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Categoría</label>
                      <select 
                        required 
                        value={formData.categoria} 
                        onChange={e => {
                          const val = e.target.value;
                          setFormData({
                            ...formData, 
                            categoria: val,
                            monto: val === 'RECONEXION' ? '20' : formData.monto,
                            descripcion: val === 'RECONEXION' ? 'Cobro por reconexión de servicio' : formData.descripcion
                          });
                        }} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100"
                      >
                        {formData.tipo === 'INGRESO' ? (
                          <>
                            <option value="CONSUMO">Cobro por Consumo de Energía</option>
                            <option value="APORTE">Aporte de Socio</option>
                            <option value="MULTA">Pago de Multa</option>
                            <option value="RECONEXION">Cobro por Reconexión de Servicio (S/ 20.00)</option>
                            <option value="OTROS">Otros Ingresos</option>
                          </>
                        ) : (
                          <>
                            <option value="MANTENIMIENTO">Mantenimiento de Planta</option>
                            <option value="MATERIALES">Compra de Materiales</option>
                            <option value="SUELDOS">Pago de Sueldos</option>
                            <option value="EQUIPOS">Compra de Equipos</option>
                            <option value="ADMINISTRATIVOS">Gastos Administrativos</option>
                            <option value="OTROS">Otros Egresos</option>
                          </>
                        )}
                      </select>
                    </div>
                    {isModalOpen === 'EGRESO' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300">A quién se paga (Nombres y Apellidos)</label>
                        <input 
                          type="text" 
                          required 
                          value={formData.destinatario} 
                          onChange={e => setFormData({...formData, destinatario: e.target.value})} 
                          className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                        />
                      </div>
                    )}
                    {isModalOpen === 'INGRESO' && ['CONSUMO', 'MULTA', 'APORTE', 'RECONEXION'].includes(formData.categoria) && (
                      <div className="space-y-4">
                        {selectedSupplyCode ? (
                          /* Highlighted Selected Supply Card */
                          <div className="bg-gradient-to-br from-[#121824] to-[#0D111A] p-4 rounded-xl border border-blue-500/30 shadow-lg relative overflow-hidden mb-2">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                            
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-blue-400 bg-blue-950/60 border border-blue-500/40 px-2.5 py-1 rounded text-xs tracking-wider">
                                    SUMINISTRO: {selectedSupplyCode}
                                  </span>
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider uppercase ${
                                    selectedClientObj?.tipo === 'SOCIO' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50' : 'bg-blue-950/50 text-blue-400 border border-blue-800/50'
                                  }`}>
                                    {selectedClientObj?.tipo}
                                  </span>
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider uppercase ${
                                    selectedClientObj?.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${selectedClientObj?.estado === 'ACTIVO' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                                    {selectedClientObj?.estado === 'ACTIVO' ? 'Servicio Activo' : 'Servicio Cortado'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-slate-300">
                                  <div>
                                    <span className="text-slate-500 block mb-0.5">Titular / Cliente</span>
                                    <span className="font-semibold text-sm text-slate-100">
                                      {selectedClientObj?.nombre ? selectedClientObj.nombre : `${selectedClientObj?.nombres || ''} ${selectedClientObj?.apellidos || ''}`}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block mb-0.5">DNI / RUC</span>
                                    <span className="font-mono text-slate-200">{selectedClientObj?.dni || '-'}</span>
                                  </div>
                                  <div className="sm:col-span-2 border-t border-slate-800/60 pt-2.5 mt-1">
                                    <span className="text-slate-500 block mb-0.5">Dirección del Predio</span>
                                    <span className="text-slate-200 font-medium">
                                      {selectedClientObj?.direccion || '-'} {selectedClientObj?.numeroDireccion || ''}
                                      {selectedClientObj?.referenciaDireccion && (
                                        <span className="text-slate-400 text-[11px] block mt-0.5 font-normal">Ref: {selectedClientObj.referenciaDireccion}</span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedClientId('');
                                  setSelectedSupplyCode('');
                                  setClientSearch('');
                                }}
                                className="bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200 text-xs py-1.5 h-8 flex items-center gap-1.5"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Cambiar Suministro
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Search Input & Wide Results Panel when no selection is active */
                          <div>
                            {/* Advanced Search Filters Panel */}
                            <div className="bg-[#10141D] p-4 rounded-xl border border-slate-800 space-y-4 mb-4 shadow-inner">
                              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
                                  <Filter className="h-4 w-4 text-blue-400" />
                                  <span>Panel de Búsqueda Avanzada de Suministros</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setClientSearch('');
                                    setSearchSupplyCode('');
                                    setSearchDniRuc('');
                                    setSearchName('');
                                    setShowOnlyAptForCut(false);
                                  }}
                                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1 rounded border border-slate-700/60"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Limpiar Filtros
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Código de Suministro */}
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Código de Suministro</label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                                      <CreditCard className="h-4 w-4" />
                                    </span>
                                    <input 
                                      type="text" 
                                      placeholder="Ej: SUM-001..."
                                      value={searchSupplyCode}
                                      onChange={(e) => setSearchSupplyCode(e.target.value)}
                                      className="block w-full border border-slate-700 rounded-md py-2 pl-9 pr-3 focus:ring-blue-500 focus:border-blue-500 text-xs bg-[#0B0E14] text-slate-100 placeholder-slate-500"
                                    />
                                  </div>
                                </div>

                                {/* DNI / RUC */}
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">DNI o RUC del Titular</label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                                      <User className="h-4 w-4" />
                                    </span>
                                    <input 
                                      type="text" 
                                      placeholder="Ej: 71234567 o RUC..."
                                      value={searchDniRuc}
                                      onChange={(e) => setSearchDniRuc(e.target.value)}
                                      className="block w-full border border-slate-700 rounded-md py-2 pl-9 pr-3 focus:ring-blue-500 focus:border-blue-500 text-xs bg-[#0B0E14] text-slate-100 placeholder-slate-500"
                                    />
                                  </div>
                                </div>

                                {/* Nombres y Apellidos o Razón Social */}
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Nombre o Razón Social</label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                                      <Search className="h-4 w-4" />
                                    </span>
                                    <input 
                                      type="text" 
                                      placeholder="Ej: Juan Perez o Empresa SAC..."
                                      value={searchName}
                                      onChange={(e) => setSearchName(e.target.value)}
                                      className="block w-full border border-slate-700 rounded-md py-2 pl-9 pr-3 focus:ring-blue-500 focus:border-blue-500 text-xs bg-[#0B0E14] text-slate-100 placeholder-slate-500"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/40">
                                {/* General text filter */}
                                <div className="flex-1 min-w-[240px]">
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Búsqueda Rápida General (Cualquier coincidencia)</label>
                                  <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                                      <Search className="h-3.5 w-3.5" />
                                    </span>
                                    <input 
                                      ref={searchInputRef}
                                      type="text" 
                                      placeholder="Busque por dirección, referencia, medidor..."
                                      value={clientSearch}
                                      onChange={(e) => setClientSearch(e.target.value)}
                                      className="block w-full border border-slate-700 rounded-md py-1.5 pl-9 pr-3 focus:ring-blue-500 focus:border-blue-500 text-xs bg-[#0B0E14] text-slate-100 placeholder-slate-500"
                                    />
                                  </div>
                                </div>

                                {/* Aptos para corte checkbox / toggle button */}
                                <div className="flex-shrink-0 pt-4">
                                  <button
                                    type="button"
                                    onClick={() => setShowOnlyAptForCut(!showOnlyAptForCut)}
                                    className={`flex px-3 py-1.5 text-xs font-bold rounded-md border items-center gap-2 transition-colors ${showOnlyAptForCut ? 'bg-red-950/60 text-red-400 border-red-500/50' : 'bg-[#0B0E14] text-slate-400 border-slate-700 hover:text-slate-200'}`}
                                    title="Filtrar clientes con riesgo de corte"
                                  >
                                    <FileWarning className="h-3.5 w-3.5" />
                                    <span>Riesgo de Corte (3+ recibos)</span>
                                  </button>
                                </div>
                              </div>
                            </div>



                            {/* Wide visual search results tabular container */}
                            <div className="mt-3 space-y-2">
                              <div className="text-xs font-semibold text-slate-400 px-1 pb-1.5 flex justify-between items-center">
                                <span className="flex items-center gap-2">
                                  <span>Resultados Encontrados</span>
                                  <span className="bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full text-[10px]">
                                    {availableSupplies.length}
                                  </span>
                                </span>
                                <span className="text-slate-500 text-[10px]">Haga clic en una fila o en el botón para iniciar el cobro</span>
                              </div>

                              <div className="overflow-x-auto border border-slate-800 rounded-lg bg-[#090C11] max-h-80 overflow-y-auto">
                                <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                                  <thead className="bg-[#0B0F19] text-slate-400 uppercase font-bold text-[9px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                                    <tr>
                                      <th className="px-4 py-3 bg-[#0B0F19]">Suministro</th>
                                      <th className="px-4 py-3 bg-[#0B0F19]">DNI/RUC</th>
                                      <th className="px-4 py-3 bg-[#0B0F19]">Titular / Razón Social</th>
                                      <th className="px-4 py-3 bg-[#0B0F19]">Dirección</th>
                                      <th className="px-4 py-3 bg-[#0B0F19]">Tipo</th>
                                      <th className="px-4 py-3 bg-[#0B0F19]">Estado</th>
                                      <th className="px-4 py-3 bg-[#0B0F19] text-center">Meses Deuda</th>
                                      <th className="px-4 py-3 bg-[#0B0F19] text-right">Saldo Pendiente</th>
                                      <th className="px-4 py-3 bg-[#0B0F19] text-center">Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60 bg-[#0B0E14]">
                                    {availableSupplies.length > 0 ? (
                                      availableSupplies.slice(0, 30).map(s => {
                                        const clientName = s.client.nombre ? s.client.nombre : `${s.client.nombres || ''} ${s.client.apellidos || ''}`;
                                        return (
                                          <tr 
                                            key={`${s.id}|${s.sup}`}
                                            className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                                            onClick={() => {
                                              setSelectedClientId(s.id);
                                              setSelectedSupplyCode(s.sup);
                                              setClientSearch(s.label);
                                            }}
                                          >
                                            {/* Suministro */}
                                            <td className="px-4 py-3 font-bold text-blue-400 whitespace-nowrap">
                                              {s.sup}
                                            </td>
                                            {/* DNI/RUC */}
                                            <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                                              {s.client.dni || '-'}
                                            </td>
                                            {/* Nombre / Razón Social */}
                                            <td className="px-4 py-3 font-semibold text-slate-200 truncate max-w-[180px]" title={clientName}>
                                              {clientName}
                                            </td>
                                            {/* Dirección */}
                                            <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]" title={`${s.client.direccion || ''} ${s.client.numeroDireccion || ''}`}>
                                              {s.client.direccion || '-'} {s.client.numeroDireccion || ''}
                                            </td>
                                            {/* Tipo */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                                s.client.tipo === 'SOCIO' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/30' : 'bg-blue-950/50 text-blue-400 border border-blue-800/30'
                                              }`}>
                                                {s.client.tipo}
                                              </span>
                                            </td>
                                            {/* Estado */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                                                s.client.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' : 'bg-red-500/10 text-red-400 border border-red-500/10'
                                              }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${s.client.estado === 'ACTIVO' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                                                {s.client.estado}
                                              </span>
                                            </td>
                                            {/* Meses de deuda */}
                                            <td className="px-4 py-3 text-center font-bold whitespace-nowrap">
                                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${s.pendingMonthsCount > 0 ? 'bg-red-950/50 text-red-400 border-red-800/50' : 'bg-slate-900/50 text-slate-500 border-slate-800/50'}`}>
                                                {s.pendingMonthsCount} {s.pendingMonthsCount === 1 ? 'mes' : 'meses'}
                                              </span>
                                            </td>
                                            {/* Saldo pendiente */}
                                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                                              <span className={s.pendingBalance > 0 ? 'text-red-400 bg-red-950/20 px-2 py-1 rounded border border-red-900/30' : 'text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-900/30'}>
                                                {formatCurrency(s.pendingBalance)}
                                              </span>
                                            </td>
                                            {/* Acción */}
                                            <td className="px-4 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                              <Button 
                                                type="button" 
                                                size="sm" 
                                                variant={s.pendingBalance > 0 ? 'default' : 'outline'}
                                                onClick={() => {
                                                  setSelectedClientId(s.id);
                                                  setSelectedSupplyCode(s.sup);
                                                  setClientSearch(s.label);
                                                }}
                                                className="h-7 py-1 px-2.5 text-[11px] font-bold"
                                              >
                                                Cobrar
                                              </Button>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    ) : (
                                      <tr>
                                        <td colSpan={9} className="p-8 text-center text-slate-400 text-sm">
                                          No se encontraron suministros que coincidan con la búsqueda. Intente combinar otros filtros.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {['CONSUMO', 'MULTA'].includes(formData.categoria) && isModalOpen === 'INGRESO' ? (
                      <div className="space-y-4">
                        {selectedClientId && (
                          <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700">
                            <h4 className="text-sm font-medium text-slate-200 mb-2">Estado de Cuenta</h4>
                            
                            <div className="mb-4">
                              <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Por Consumo de Energía</h5>
                              {pendingConsumptions.length > 0 ? (
                                <ul className="space-y-2 mb-3">
                                  {pendingConsumptions.map(c => (
                                    <li key={c.id} className="flex justify-between items-center text-sm">
                                      <span className="text-slate-300">{c.mes} ({c.kwh} kWh) - Suministro {c.codigoSuministro}</span>
                                      <div className="flex items-center space-x-3">
                                        <span className="text-slate-200 font-medium">{formatCurrency(c.montoCalculado)}</span>
                                        <Button size="sm" type="button" onClick={async () => {
                                          const confirmCobro = await confirm({
                                            title: 'Cobrar Recibo',
                                            message: '¿Está seguro de cobrar este recibo por consumo?',
                                            type: 'confirm',
                                            confirmLabel: 'Cobrar'
                                          });
                                          if (confirmCobro) {
                                             try {
                                                await payConsumption(c.id);
                                                setClientSearch('');
                                                setSelectedClientId('');
                                                setSelectedSupplyCode('');
                                                if (searchInputRef.current) searchInputRef.current.focus();
                                                toast.success('Cobro registrado correctamente');
                                              } catch (err) {
                                                toast.error('Error al registrar cobro');
                                              }
                                          }
                                        }}>Cobrar</Button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-slate-400 mb-2">No tiene deudas por consumo pendientes.</p>
                              )}
                            </div>

                            <div className="mb-4 pt-4 border-t border-slate-700">
                              <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Por Multas (Faltas a Reuniones, etc)</h5>
                              {pendingFines.length > 0 ? (
                                <ul className="space-y-2 mb-3">
                                  {pendingFines.map(f => (
                                    <li key={f.id} className="flex justify-between items-center text-sm gap-4">
                                      <span className="text-slate-300 flex-1 truncate" title={f.motivo}>{f.motivo}</span>
                                      <div className="flex items-center space-x-3 flex-shrink-0">
                                        <span className="text-slate-200 font-medium">{formatCurrency(f.monto)}</span>
                                        <Button size="sm" type="button" onClick={async () => {
                                          const confirmMulta = await confirm({
                                            title: 'Cobrar Multa',
                                            message: '¿Está seguro de cobrar esta multa?',
                                            type: 'confirm',
                                            confirmLabel: 'Cobrar'
                                          });
                                          if (confirmMulta) {
                                             try {
                                                await payFine(f.id);
                                                setClientSearch('');
                                                setSelectedClientId('');
                                                setSelectedSupplyCode('');
                                                if (searchInputRef.current) searchInputRef.current.focus();
                                                toast.success('Cobro de multa registrado correctamente');
                                              } catch (err) {
                                                toast.error('Error al registrar pago de multa');
                                              }
                                          }
                                        }}>Cobrar</Button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-slate-400 mb-2">No tiene multas pendientes registradas.</p>
                              )}
                            </div>
                            
                            {isCortado && (
                              <div className="mb-4 pt-4 border-t border-slate-700">
                                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2">Por Reconexión de Servicio</h5>
                                <div className="flex justify-between items-center text-sm gap-4">
                                  <span className="text-slate-300 flex-1 truncate">
                                    Cargo por reactivación del servicio cortado
                                  </span>
                                  <div className="flex items-center space-x-3 flex-shrink-0">
                                    <span className="text-slate-200 font-medium">{formatCurrency(reconexionFee)}</span>
                                    <Button size="sm" type="button" onClick={async () => {
                                      if (pendingConsumptions.length > 2) {
                                        toast.error('No se puede reconectar el servicio. El cliente tiene deuda de 3 o más recibos pendientes. Debe regularizar la deuda de consumo primero.');
                                        return;
                                      }
                                      const confirmReconexion = await confirm({
                                        title: 'Cobrar Reconexión',
                                        message: `¿Está seguro de cobrar S/ ${reconexionFee.toFixed(2)} por reconexión y reactivar el servicio?`,
                                        type: 'confirm',
                                        confirmLabel: 'Recaudar y Reactivar'
                                      });
                                      if (confirmReconexion) {
                                        await addTransaction({
                                          tipo: 'INGRESO',
                                          categoria: 'RECONEXION',
                                          monto: reconexionFee,
                                          descripcion: 'Cobro y pago por reconexión de servicio',
                                          clientId: selectedClientId,
                                          codigoSuministro: selectedSupplyCode || undefined
                                        });
                                        await updateClient(selectedClientId, { estado: 'ACTIVO' });
                                        toast.success('Cobro realizado y servicio reactivado exitosamente.');
                                        closeModal();
                                      }
                                    }}>Cobrar y Reactivar</Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="pt-2 border-t border-slate-700 flex justify-between">
                              <span className="font-semibold text-slate-300">Deuda Total:</span>
                              <span className="font-bold text-red-500">{formatCurrency(totalDeuda)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-300">Monto (S/)</label>
                          <input 
                            type="number" 
                            min="0.01" 
                            step="0.01"
                            required 
                            value={formData.monto} 
                            onChange={e => setFormData({...formData, monto: e.target.value})} 
                            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300">Descripción / Motivo</label>
                          <textarea 
                            required
                            rows={3}
                            value={formData.descripcion} 
                            onChange={e => setFormData({...formData, descripcion: e.target.value})} 
                            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                          />
                        </div>
                      </>
                    )}
                  </div>
                  )}
                </div>
                <div className="bg-slate-800/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  {isModalOpen !== 'APTOS_CORTE' && !['CONSUMO', 'MULTA'].includes(formData.categoria) && (
                    <Button type="submit" className="w-full sm:ml-3 sm:w-auto">Guardar Transacción</Button>
                  )}
                  <Button type="button" variant="outline" onClick={closeModal} className="mt-3 w-full sm:mt-0 sm:w-auto">Cerrar</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isModalOpen === 'PAGO_SUELDO' && (() => {
        // Filter and sort trabajadores list dynamically based on real-time filters
        const filteredTrabajadores = (trabajadores || []).filter((t: any) => {
          if (!t) return false;
          const matchesDni = workerSearchDni ? (t.dni || '').toLowerCase().includes(workerSearchDni.toLowerCase()) : true;
          const fullName = `${t.apellidos || ''} ${t.nombres || ''}`.toLowerCase();
          const matchesName = workerSearchName ? normalizeSearchText(fullName).includes(normalizeSearchText(workerSearchName)) : true;
          return matchesDni && matchesName;
        });

        const getAreaForCargo = (cargo: string) => {
          const c = (cargo || '').toLowerCase();
          if (c.includes('admin') || c.includes('secretar') || c.includes('tesorer') || c.includes('contad') || c.includes('oficina') || c.includes('presidente') || c.includes('vocal')) {
            return 'Administración';
          }
          return 'Operaciones / Planta';
        };

        const getUltimoPago = (trabajadorId: string) => {
          const list = (pagosSueldos || []).filter((p: any) => p && p.trabajadorId === trabajadorId);
          if (list.length === 0) return 'Ninguno';
          const sorted = [...list].sort((a: any, b: any) => b.mesPagado.localeCompare(a.mesPagado));
          const [year, month] = sorted[0].mesPagado.split('-');
          const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
          const mIndex = parseInt(month, 10) - 1;
          const mName = monthNames[mIndex] || month;
          return `${mName} ${year}`;
        };

        const getRawUltimoPago = (trabajadorId: string) => {
          const list = (pagosSueldos || []).filter((p: any) => p && p.trabajadorId === trabajadorId);
          if (list.length === 0) return '';
          const sorted = [...list].sort((a: any, b: any) => b.mesPagado.localeCompare(a.mesPagado));
          return sorted[0].mesPagado;
        };

        const getEstadoPago = (trabajadorId: string) => {
          const isPaid = (pagosSueldos || []).some(
            (p: any) => p && p.trabajadorId === trabajadorId && p.mesPagado === sueldoForm.mesPagado
          );
          return isPaid ? 'Pagado' : 'Pendiente';
        };

        // Advanced sorting based on columns
        const sortedTrabajadores = [...filteredTrabajadores].sort((a: any, b: any) => {
          let comparison = 0;
          if (workerSortColumn === 'dni') {
            comparison = (a.dni || '').localeCompare(b.dni || '');
          } else if (workerSortColumn === 'nombre') {
            const nameA = `${a.apellidos || ''}, ${a.nombres || ''}`.toLowerCase();
            const nameB = `${b.apellidos || ''}, ${b.nombres || ''}`.toLowerCase();
            comparison = nameA.localeCompare(nameB);
          } else if (workerSortColumn === 'cargo') {
            comparison = (a.cargo || '').localeCompare(b.cargo || '');
          } else if (workerSortColumn === 'area') {
            comparison = getAreaForCargo(a.cargo).localeCompare(getAreaForCargo(b.cargo));
          } else if (workerSortColumn === 'estado') {
            comparison = (a.estado || '').localeCompare(b.estado || '');
          } else if (workerSortColumn === 'ultimoPago') {
            comparison = getRawUltimoPago(a.id).localeCompare(getRawUltimoPago(b.id));
          } else if (workerSortColumn === 'estadoPago') {
            comparison = getEstadoPago(a.id).localeCompare(getEstadoPago(b.id));
          }

          return workerSortDirection === 'asc' ? comparison : -comparison;
        });

        // Pagination calculations
        const totalItems = sortedTrabajadores.length;
        const totalPages = Math.ceil(totalItems / workerPageSize);
        const currentPage = Math.max(1, Math.min(workerCurrentPage, totalPages || 1));
        const startIndex = (currentPage - 1) * workerPageSize;
        const paginatedTrabajadores = sortedTrabajadores.slice(startIndex, startIndex + workerPageSize);

        const renderHeader = (colId: typeof workerSortColumn, label: string, widthClass: string, isCenter = false) => {
          const isActive = workerSortColumn === colId;
          return (
            <th
              scope="col"
              onClick={() => {
                if (workerSortColumn === colId) {
                  setWorkerSortDirection(workerSortDirection === 'asc' ? 'desc' : 'asc');
                } else {
                  setWorkerSortColumn(colId);
                  setWorkerSortDirection('asc');
                }
                setWorkerCurrentPage(1);
              }}
              className={`px-2 py-2 cursor-pointer hover:bg-slate-800/80 hover:text-slate-200 select-none transition-colors duration-150 ${widthClass}`}
            >
              <div className={`flex items-center gap-1 ${isCenter ? 'justify-center' : ''}`}>
                <span className="truncate">{label}</span>
                <ArrowUpDown className={`w-3 h-3 flex-shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-650 opacity-40'}`} />
              </div>
            </th>
          );
        };

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-[#07090E] bg-opacity-80 transition-opacity" aria-hidden="true" onClick={closeModal}></div>

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

              <div className="relative z-10 inline-block align-bottom bg-[#111622] rounded-xl border border-slate-800 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl sm:w-full">
                <form onSubmit={handleSueldoSubmit}>
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-blue-500" />
                        Registrar Pago de Sueldo
                      </h3>
                      <span className="text-[10px] text-slate-500">Módulo de Planillas</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Sección Izquierda: Búsqueda y Selección */}
                      <div className="lg:col-span-8 space-y-4 lg:border-r lg:border-slate-800/60 lg:pr-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <Search className="w-3.5 h-3.5 text-blue-500" /> 1. Localizar Trabajador
                          </h4>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {totalItems} trabajadores encontrados
                          </span>
                        </div>

                        {/* Panel de filtros avanzados */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0A0D15]/60 p-3 rounded-lg border border-slate-800/80">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Nombres y Apellidos
                            </label>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                <User className="h-3.5 w-3.5 text-slate-500" />
                              </span>
                              <input
                                type="text"
                                className="block w-full pl-8 pr-2 py-1.5 bg-[#07090E] border border-slate-800 rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Buscar por nombres..."
                                value={workerSearchName}
                                onChange={(e) => {
                                  setWorkerSearchName(e.target.value);
                                  setWorkerCurrentPage(1);
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Número de DNI
                            </label>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                              </span>
                              <input
                                type="text"
                                className="block w-full pl-8 pr-2 py-1.5 bg-[#07090E] border border-slate-800 rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Buscar por DNI..."
                                value={workerSearchDni}
                                onChange={(e) => {
                                  setWorkerSearchDni(e.target.value);
                                  setWorkerCurrentPage(1);
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Tabla de Resultados: 100% de ancho adaptado, sticky header y sin desplazamiento horizontal */}
                        <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0A0D15]/30">
                          <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
                            <table className="w-full table-fixed divide-y divide-slate-800 text-left text-[11px] text-slate-300">
                              <thead className="bg-[#0B0F19] text-slate-400 uppercase font-bold text-[9px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                                <tr>
                                  {renderHeader('dni', 'DNI', 'w-[12%]')}
                                  {renderHeader('nombre', 'Apellidos y Nombres', 'w-[28%]')}
                                  {renderHeader('cargo', 'Cargo / Puesto', 'w-[18%]')}
                                  {renderHeader('area', 'Área / Dependencia', 'w-[15%]')}
                                  {renderHeader('estado', 'Estado', 'w-[8%]', true)}
                                  {renderHeader('ultimoPago', 'Período', 'w-[10%]')}
                                  {renderHeader('estadoPago', 'Estado Pago', 'w-[9%]', true)}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 bg-[#0B0E14]/40">
                                {paginatedTrabajadores.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                      No se encontraron trabajadores con los filtros especificados.
                                    </td>
                                  </tr>
                                ) : (
                                  paginatedTrabajadores.map((t: any) => {
                                    const isSelected = sueldoForm.trabajadorId === t.id;
                                    const area = getAreaForCargo(t.cargo);
                                    const ultimoPago = getUltimoPago(t.id);
                                    const estadoPago = getEstadoPago(t.id);
                                    const isInactive = t.estado === 'INACTIVO';

                                    return (
                                      <tr
                                        key={t.id}
                                        onClick={() => {
                                          setSueldoForm({
                                            ...sueldoForm,
                                            trabajadorId: t.id,
                                            trabajadorNombreCompleto: `${t.apellidos}, ${t.nombres}`,
                                            trabajadorDni: t.dni,
                                            trabajadorCargo: t.cargo,
                                            monto: t.sueldoMensual
                                          });
                                        }}
                                        className={`group cursor-pointer transition-colors duration-150 ${
                                          isSelected
                                            ? 'bg-blue-600/10 hover:bg-blue-600/15 border-l-2 border-blue-500'
                                            : 'hover:bg-slate-800/35'
                                        }`}
                                      >
                                        <td className={`px-2.5 py-2.5 font-mono font-medium ${isSelected ? 'text-blue-400' : 'text-slate-300'} break-all`}>
                                          {t.dni}
                                        </td>
                                        <td className="px-2.5 py-2.5 font-semibold text-slate-100 whitespace-normal break-words leading-snug">
                                          {t.apellidos}, {t.nombres}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-slate-300 whitespace-normal break-words leading-snug">
                                          {t.cargo || '-'}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-slate-450 whitespace-normal break-words leading-snug">
                                          {area}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-center">
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            t.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                          }`}>
                                            <span className={`w-1 h-1 rounded-full ${t.estado === 'ACTIVO' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                                            {t.estado}
                                          </span>
                                        </td>
                                        <td className="px-2.5 py-2.5 text-slate-400 font-mono whitespace-normal break-words">
                                          {ultimoPago}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-center">
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                            estadoPago === 'Pagado'
                                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-850/40'
                                              : isInactive
                                                ? 'bg-slate-900 text-slate-500 border border-slate-800/40'
                                                : 'bg-amber-950/60 text-amber-400 border border-amber-850/40'
                                          }`}>
                                            {estadoPago}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Paginación y control de registros */}
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0B0F19] px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>Mostrar</span>
                              <select
                                value={workerPageSize}
                                onChange={(e) => {
                                  setWorkerPageSize(Number(e.target.value));
                                  setWorkerCurrentPage(1);
                                }}
                                className="bg-[#07090E] border border-slate-800 text-xs text-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {[10, 20, 50, 100].map((size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ))}
                              </select>
                              <span>registros por página</span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-slate-500 font-mono text-[11px]">
                                {totalItems === 0
                                  ? 'Sin registros'
                                  : `Mostrando ${startIndex + 1} - ${Math.min(startIndex + workerPageSize, totalItems)} de ${totalItems}`}
                              </span>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={currentPage === 1}
                                  onClick={() => setWorkerCurrentPage(currentPage - 1)}
                                  className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-200 rounded font-mono text-xs font-bold">
                                  {currentPage} / {totalPages || 1}
                                </span>
                                <button
                                  type="button"
                                  disabled={currentPage >= totalPages}
                                  onClick={() => setWorkerCurrentPage(currentPage + 1)}
                                  className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Sección Derecha: Datos de Pago */}
                      <div className="lg:col-span-4 space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-emerald-500" /> 2. Registro del Pago
                        </h4>

                        {sueldoForm.trabajadorId ? (
                          <div className="bg-blue-600/5 p-3.5 rounded-lg border border-blue-500/20 space-y-1.5">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Trabajador Activo Seleccionado</span>
                            <div className="text-sm font-bold text-slate-100">{sueldoForm.trabajadorNombreCompleto}</div>
                            <div className="text-xs text-slate-400 font-mono">DNI: {sueldoForm.trabajadorDni}</div>
                            <div className="text-xs text-slate-400">Cargo: {sueldoForm.trabajadorCargo}</div>
                          </div>
                        ) : (
                          <div className="bg-slate-900/40 p-6 rounded-lg border border-dashed border-slate-850 text-center text-xs text-slate-500">
                            Seleccione un trabajador de la lista de la izquierda para cargar automáticamente su información laboral.
                          </div>
                        )}

                        {/* Month input selector */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-300">Mes a Remunerar <span className="text-red-500">*</span></label>
                          <input
                            type="month"
                            required
                            className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
                            value={sueldoForm.mesPagado}
                            onChange={(e) => setSueldoForm({ ...sueldoForm, mesPagado: e.target.value })}
                          />
                        </div>

                        {/* Wages Amount */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 font-sans">Monto del Sueldo (S/)</label>
                          <input
                            type="number"
                            required
                            disabled
                            className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-slate-900 rounded-lg text-xs text-emerald-400 font-bold outline-none cursor-not-allowed"
                            placeholder="Carga automática al seleccionar"
                            value={sueldoForm.monto || ''}
                          />
                          <p className="text-[10px] text-slate-500 mt-1">El monto se carga de manera fija según las condiciones contractuales.</p>
                        </div>

                        {/* Observations */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-300">Observaciones o Notas del Pago</label>
                          <textarea
                            rows={2}
                            className="mt-1 block w-full py-2 px-3 border border-slate-800 bg-[#0C101A] rounded-lg text-xs text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Ej. Planilla regular del mes..."
                            value={sueldoForm.observaciones}
                            onChange={(e) => setSueldoForm({ ...sueldoForm, observaciones: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 px-6 py-3 sm:flex sm:flex-row-reverse sm:gap-3 border-t border-slate-800">
                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full inline-flex justify-center sm:w-auto font-bold"
                    >
                      Registrar y Emitir Boleta
                    </Button>
                    <Button
                      type="button"
                      variant="cancel"
                      onClick={closeModal}
                      className="mt-3 w-full sm:mt-0 sm:w-auto"
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
