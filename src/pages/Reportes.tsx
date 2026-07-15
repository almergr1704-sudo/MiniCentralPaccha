import React, { useState, useMemo } from 'react';
import { Download, FileText, TrendingUp, Users, Calendar, Filter, Search, X } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Pagination } from '../components/ui';
import { formatCurrency, render3DPieChartToDataURL, normalizeSearchText } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import { toast } from 'react-hot-toast';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function Reportes() {
  const { clients, transactions, consumptions, fines, suppliesInfo } = useAppContext();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'financieros' | 'clientes'>('financieros');

  // Client Filters state
  const [clientSearch, setClientSearch] = useState('');
  const [socioTypeFilter, setSocioTypeFilter] = useState<'TODOS' | 'SOCIO' | 'USUARIO'>('TODOS');
  const [personTypeFilter, setPersonTypeFilter] = useState<'TODOS' | 'PERSONA' | 'EMPRESA'>('TODOS');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'TODOS' | 'MONOFASICO' | 'TRIFASICO'>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO' | 'CORTADO'>('TODOS');

  // Pagination for client table
  const [clientPage, setClientPage] = useState(1);
  const [clientItemsPerPage, setClientItemsPerPage] = useState(20);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t.fecha) return true;
      const tDate = t.fecha.split('T')[0];
      if (startDate && tDate < startDate) return false;
      if (endDate && tDate > endDate) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const pendingDebts = consumptions.filter(c => c.estadoPago === 'PENDIENTE');
  const pendingFines = (fines || []).filter(f => f.estadoPago === 'PENDIENTE');

  const totalRecibosVencidos = pendingDebts.length + pendingFines.length;
  const montoTotalDeuda = pendingDebts.reduce((sum, d) => sum + d.montoCalculado, 0) + pendingFines.reduce((sum, f) => sum + f.monto, 0);
  const totalDeudasRegistradas = consumptions.length + (fines ? fines.length : 0);
  const indiceMorosidad = totalDeudasRegistradas > 0 ? ((totalRecibosVencidos / totalDeudasRegistradas) * 100).toFixed(1) : 0;

  // New Client Filters list logic
  const filteredReportClients = useMemo(() => {
    return clients.filter(c => {
      const rawFullName = c.nombre ? c.nombre : `${c.nombres || ''} ${c.apellidos || ''}`;
      const fullName = normalizeSearchText(rawFullName);
      const dni = normalizeSearchText(c.dni || '');
      const allSuministros = normalizeSearchText([c.codigoSuministro || '', ...(c.suministros || [])].join(' '));
      const normalizedSearch = normalizeSearchText(clientSearch);
      
      const matchesSearch = !normalizedSearch || 
                            fullName.includes(normalizedSearch) || 
                            dni.includes(normalizedSearch) || 
                            allSuministros.includes(normalizedSearch);

      // Tipo de socio (Socio vs Usuario)
      const isClientSocio = (c.suministros?.length ? c.suministros : [c.codigoSuministro]).some(sup => {
         return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (c.tipo === 'SOCIO');
      }) || c.tipo === 'SOCIO';
      const computedSocioType = isClientSocio ? 'SOCIO' : 'USUARIO';
      const matchesSocioType = socioTypeFilter === 'TODOS' || computedSocioType === socioTypeFilter;

      // Tipo de cliente (Persona vs Empresa)
      const computedPersonType = c.tipoPersona || 'PERSONA';
      const matchesPersonType = personTypeFilter === 'TODOS' || computedPersonType === personTypeFilter;

      // Tipo de servicio (Monofasico vs Trifasico)
      const computedServiceType = c.faseSuministro || 'MONOFASICO';
      const matchesServiceType = serviceTypeFilter === 'TODOS' || computedServiceType === serviceTypeFilter;

      // Estado del servicio (Activo, Inactivo, Cortado)
      const computedStatus = c.estado || 'ACTIVO';
      const matchesStatus = statusFilter === 'TODOS' || computedStatus === statusFilter;

      return matchesSearch && matchesSocioType && matchesPersonType && matchesServiceType && matchesStatus;
    });
  }, [clients, suppliesInfo, clientSearch, socioTypeFilter, personTypeFilter, serviceTypeFilter, statusFilter]);

  const paginatedReportClients = useMemo(() => {
    const startIndex = (clientPage - 1) * clientItemsPerPage;
    return filteredReportClients.slice(startIndex, startIndex + clientItemsPerPage);
  }, [filteredReportClients, clientPage, clientItemsPerPage]);

  const clientTotalPages = Math.ceil(filteredReportClients.length / clientItemsPerPage);

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
        `Búsqueda: ${clientSearch || 'Ninguna'}`,
        `Socio: ${socioTypeFilter}`,
        `Persona: ${personTypeFilter}`,
        `Servicio: ${serviceTypeFilter}`,
        `Estado: ${statusFilter}`
      ].join(' | ');
      doc.text(`Filtros aplicados: ${filtersApplied}`, 14, 31);
      
      const tableHeaders = [
        ['Código Suministro', 'Nombre del Cliente', 'DNI/RUC', 'Dirección', 'Tipo Cliente', 'Tipo Socio', 'Servicio', 'Estado', 'Fecha Reg.']
      ];
      
      const tableRows = filteredReportClients.map(c => {
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
      const excelRows = filteredReportClients.map(c => {
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

  const handleExportPDF = (type: 'INGRESO' | 'EGRESO' | 'CONSOLIDADO') => {
    const toastId = toast.loading('Generando PDF...');
    try {
      const doc = new jsPDF();
    
    if (type === 'CONSOLIDADO') {
      doc.text(`Reporte Consolidado por Categoría`, 14, 20);
    } else {
      doc.text(`Reporte Consolidado de ${type === 'INGRESO' ? 'Ingresos' : 'Egresos'} por Categoría`, 14, 20);
    }
    
    if (startDate || endDate) {
      doc.setFontSize(10);
      doc.text(`Periodo: ${startDate || 'Inicio'} a ${endDate || 'Hoy'}`, 14, 26);
    }
    
    let tableData: any[][] = [];
    let headParams: string[][] = [];

    if (type === 'CONSOLIDADO') {
      const consolidatedMap: Record<string, { categoria: string, ingreso: number, egreso: number }> = {};
      filteredTransactions.forEach(t => {
        const key = t.categoria;
        if (!consolidatedMap[key]) {
          consolidatedMap[key] = { categoria: t.categoria, ingreso: 0, egreso: 0 };
        }
        if (t.tipo === 'INGRESO') consolidatedMap[key].ingreso += t.monto;
        else consolidatedMap[key].egreso += t.monto;
      });

      const totalIngresos = Object.values(consolidatedMap).reduce((a, b) => a + b.ingreso, 0);
      const totalEgresos = Object.values(consolidatedMap).reduce((a, b) => a + b.egreso, 0);

      tableData = Object.values(consolidatedMap).map(item => [
        item.categoria,
        formatCurrency(item.ingreso),
        formatCurrency(item.egreso)
      ]);
      tableData.push(['TOTAL GENERAL', formatCurrency(totalIngresos), formatCurrency(totalEgresos)]);
      headParams = [['Categoría', 'Total Ingresos', 'Total Egresos']];
    } else {
      const consolidatedMap: Record<string, { categoria: string, total: number }> = {};
      const filteredByType = filteredTransactions.filter(t => t.tipo === type);
      filteredByType.forEach(t => {
        const key = t.categoria;
        if (!consolidatedMap[key]) {
          consolidatedMap[key] = { categoria: t.categoria.replace('_', ' '), total: 0 };
        }
        consolidatedMap[key].total += t.monto;
      });

      tableData = Object.values(consolidatedMap).map(item => [
        item.categoria,
        formatCurrency(item.total)
      ]);

      const totalMonto = Object.values(consolidatedMap).reduce((acc, item) => acc + item.total, 0);
      tableData.push(['TOTAL GENERAL', formatCurrency(totalMonto)]);
      headParams = [['Categoría', type === 'INGRESO' ? 'Total Ingresos' : 'Total Egresos']];
    }
    
    if (tableData.length === 0 || (tableData.length === 1 && tableData[0][0] === 'TOTAL GENERAL')) {
       toast.error('No existen datos disponibles para generar el PDF.');
       return;
    }

    autoTable(doc, {
      startY: 35,
      head: headParams,
      body: tableData,
      didParseCell: function(data: any) {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    const afterTableY = (doc as any).lastAutoTable?.finalY + 10 || 50;

    if (type === 'CONSOLIDADO') {
      const totalIngresos = filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0);
      const totalEgresos = filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0);
      doc.setFontSize(12);
      doc.text(`Balance Final: ${formatCurrency(totalIngresos - totalEgresos)}`, 14, afterTableY);

      const finalY = afterTableY + 16;
      doc.setFontSize(14);
      doc.text('Resumen de Morosidad', 14, finalY);
      
      autoTable(doc, {
        startY: finalY + 6,
        head: [['Recibos Vencidos', 'Monto Total en Deuda', 'Índice de Morosidad']],
        body: [[
          totalRecibosVencidos.toString(),
          formatCurrency(montoTotalDeuda),
          indiceMorosidad + '%'
        ]],
      });
    } else {
      const totalLabel = type === 'INGRESO' ? 'Ingresos' : 'Egresos';
      const totalValue = filteredTransactions.filter(t => t.tipo === type).reduce((acc, t) => acc + t.monto, 0);
      doc.setFontSize(12);
      doc.text(`Total ${totalLabel}: ${formatCurrency(totalValue)}`, 14, afterTableY);
    }

    // Add 3D Pie Chart
    let chartData: { name: string, value: number, color: string }[] = [];
    if (type === 'CONSOLIDADO') {
      const totalIngresos = filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0);
      const totalEgresos = filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0);
      if (totalIngresos > 0 || totalEgresos > 0) {
        chartData = [
          { name: 'Ingresos', value: totalIngresos, color: '#10B981' },
          { name: 'Egresos', value: totalEgresos, color: '#EF4444' }
        ];
      }
    } else {
      const filteredByType = filteredTransactions.filter(t => t.tipo === type);
      const catMap: Record<string, number> = {};
      filteredByType.forEach(t => {
        catMap[t.categoria.replace('_', ' ')] = (catMap[t.categoria.replace('_', ' ')] || 0) + t.monto;
      });
      chartData = Object.entries(catMap).map(([name, value], i) => ({
        name,
        value,
        color: COLORS[i % COLORS.length]
      }));
    }

    if (chartData.length > 0) {
       let finalChartY = type === 'CONSOLIDADO' ? ((doc as any).lastAutoTable.finalY + 15) : (afterTableY + 20);
       if (finalChartY + 95 > 290) { // Using 95 as required space
          doc.addPage();
          finalChartY = 20;
       }
       const imgData = render3DPieChartToDataURL(chartData, type === 'CONSOLIDADO' ? 'Balance General' : `Gráfico de ${type === 'INGRESO' ? 'Ingresos' : 'Egresos'}`);
       if (imgData) {
          doc.addImage(imgData, 'PNG', 25, finalChartY, 160, 120); // Give it more width/height so legends are clearer
       }
    }

      doc.save(`Reporte_${type}.pdf`);
      toast.success('Reporte generado y descargado con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el reporte.', { id: toastId });
    }
  };

  const handleExportExcel = () => {
    const txSorted = [...filteredTransactions].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    const ingresosData = txSorted.filter(t => t.tipo === 'INGRESO').map(t => {
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
        Fecha: format(new Date(t.fecha), 'dd/MM/yyyy HH:mm'),
        Comprobante: t.comprobante || '',
        Suministro: supplyCode || 'N/A',
        Cliente: clientName || 'General',
        Categoría: t.categoria,
        Descripción: t.descripcion,
        'Ingreso (S/)': t.monto
      };
    });
    const totalIngresosMonto = txSorted.filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0);
    ingresosData.push({ Fecha: 'TOTAL GENERAL', Comprobante: '', Suministro: '', Cliente: '', Categoría: '', Descripción: '', 'Ingreso (S/)': totalIngresosMonto });

    const egresosData = txSorted.filter(t => t.tipo === 'EGRESO').map(t => {
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
        Fecha: format(new Date(t.fecha), 'dd/MM/yyyy HH:mm'),
        Comprobante: t.comprobante || '',
        Suministro: supplyCode || 'N/A',
        'Cliente / Destinatario': clientName || t.destinatario || 'General',
        Categoría: t.categoria,
        Descripción: t.descripcion,
        'Egreso (S/)': t.monto
      };
    });
    const totalEgresosMonto = txSorted.filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0);
    egresosData.push({ Fecha: 'TOTAL GENERAL', Comprobante: '', Suministro: '', 'Cliente / Destinatario': '', Categoría: '', Descripción: '', 'Egreso (S/)': totalEgresosMonto });

    const consolidatedMap: Record<string, { categoria: string, ingreso: number, egreso: number }> = {};
    txSorted.forEach(t => {
      const key = t.categoria;
      if (!consolidatedMap[key]) {
        consolidatedMap[key] = { categoria: t.categoria, ingreso: 0, egreso: 0 };
      }
      if (t.tipo === 'INGRESO') consolidatedMap[key].ingreso += t.monto;
      else consolidatedMap[key].egreso += t.monto;
    });

    const consolidadoData: any[] = Object.values(consolidatedMap).map(item => ({
      Categoría: item.categoria,
      'Ingresos (S/)': item.ingreso,
      'Egresos (S/)': item.egreso
    }));
    consolidadoData.push({
      Categoría: 'TOTAL GENERAL',
      'Ingresos (S/)': totalIngresosMonto,
      'Egresos (S/)': totalEgresosMonto
    });

    const morosidadData = [{
      'Balance Final (S/)': totalIngresosMonto - totalEgresosMonto,
      'Recibos Vencidos (Toda la deuda)': totalRecibosVencidos,
      'Monto Total en Deuda (S/)': montoTotalDeuda,
      'Índice de Morosidad (%)': indiceMorosidad
    }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ingresosData), "Ingresos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(egresosData), "Egresos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(consolidadoData), "Consolidado");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(morosidadData), "Resumen");
    XLSX.writeFile(wb, `Reporte_General_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // Ingresos por categoría
  const ingresosPorCategoria = filteredTransactions
    .filter(t => t.tipo === 'INGRESO')
    .reduce((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] || 0) + t.monto;
      return acc;
    }, {} as Record<string, number>);

  const pieDataIngresos = Object.keys(ingresosPorCategoria).map(key => ({
    name: key,
    value: ingresosPorCategoria[key]
  }));

  // Egresos por categoría
  const egresosPorCategoria = filteredTransactions
    .filter(t => t.tipo === 'EGRESO')
    .reduce((acc, t) => {
      acc[t.categoria] = (acc[t.categoria] || 0) + t.monto;
      return acc;
    }, {} as Record<string, number>);

  const pieDataEgresos = Object.keys(egresosPorCategoria).map(key => ({
    name: key,
    value: egresosPorCategoria[key]
  }));

  const pieDataConsolidado = [
    { name: 'Ingresos', value: filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((acc, t) => acc + t.monto, 0) },
    { name: 'Egresos', value: filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((acc, t) => acc + t.monto, 0) }
  ].filter(d => d.value > 0);

  const isAnyFilterActive = clientSearch || socioTypeFilter !== 'TODOS' || personTypeFilter !== 'TODOS' || serviceTypeFilter !== 'TODOS' || statusFilter !== 'TODOS';

  const clearClientFilters = () => {
    setClientSearch('');
    setSocioTypeFilter('TODOS');
    setPersonTypeFilter('TODOS');
    setServiceTypeFilter('TODOS');
    setStatusFilter('TODOS');
    setClientPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Reportes y Estadísticas
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Análisis financiero, recaudación y padrón de clientes con filtros avanzados.
          </p>
        </div>
        {activeTab === 'financieros' && (
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleExportPDF('INGRESO')}>
              <FileText className="-ml-1 mr-2 h-5 w-5" />
              PDF Ingresos
            </Button>
            <Button variant="outline" onClick={() => handleExportPDF('EGRESO')}>
              <FileText className="-ml-1 mr-2 h-5 w-5" />
              PDF Egresos
            </Button>
            <Button variant="outline" onClick={() => handleExportPDF('CONSOLIDADO')}>
              <FileText className="-ml-1 mr-2 h-5 w-5" />
              PDF Consolidado
            </Button>
            <Button onClick={handleExportExcel}>
              <Download className="-ml-1 mr-2 h-5 w-5" />
              Excel Consolidado
            </Button>
          </div>
        )}
        {activeTab === 'clientes' && (
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportClientsPDF}>
              <FileText className="-ml-1 mr-2 h-5 w-5" />
              Exportar PDF
            </Button>
            <Button onClick={handleExportClientsExcel}>
              <Download className="-ml-1 mr-2 h-5 w-5" />
              Exportar Excel
            </Button>
          </div>
        )}
      </div>

      {/* Modern Tab Selector */}
      <div className="border-b border-slate-800 flex space-x-6">
        <button
          onClick={() => setActiveTab('financieros')}
          className={`pb-4 text-sm font-semibold border-b-2 px-1 transition-all duration-200 ${
            activeTab === 'financieros'
              ? 'border-blue-500 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4" />
            <span>Reportes Financieros</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('clientes')}
          className={`pb-4 text-sm font-semibold border-b-2 px-1 transition-all duration-200 ${
            activeTab === 'clientes'
              ? 'border-blue-500 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Reportes de Clientes (Filtros Avanzados)</span>
          </div>
        </button>
      </div>

      {activeTab === 'financieros' ? (
        <>
          <Card>
            <CardContent className="p-4 bg-slate-800/30 border-b border-slate-800 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Fecha Inicio</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Fecha Fin</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <Button variant="outline" onClick={() => { setStartDate(''); setEndDate(''); }}>
                  Limpiar Filtros
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Resumen Financiero</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                    <p className="text-sm font-medium text-emerald-400">Total Ingresos</p>
                    <p className="text-2xl font-bold text-emerald-300 mt-1">
                      {formatCurrency(filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((a, b) => a + b.monto, 0))}
                    </p>
                  </div>
                  <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                    <p className="text-sm font-medium text-red-400">Total Egresos</p>
                    <p className="text-2xl font-bold text-red-300 mt-1">
                      {formatCurrency(filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((a, b) => a + b.monto, 0))}
                    </p>
                  </div>
                  <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                    <p className="text-sm font-medium text-blue-400">Balance</p>
                    <p className="text-2xl font-bold text-blue-300 mt-1">
                      {formatCurrency(
                        filteredTransactions.filter(t => t.tipo === 'INGRESO').reduce((a, b) => a + b.monto, 0) -
                        filteredTransactions.filter(t => t.tipo === 'EGRESO').reduce((a, b) => a + b.monto, 0)
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumen de Morosidad</CardTitle>
              </CardHeader>
              <CardContent>
                   <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                       <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex justify-between items-center">
                           <p className="text-sm font-medium text-red-400">Recibos Vencidos</p>
                           <p className="text-lg font-bold text-red-300">{totalRecibosVencidos}</p>
                       </div>
                       <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex justify-between items-center">
                           <p className="text-sm font-medium text-red-400">Monto en Deuda</p>
                           <p className="text-lg font-bold text-red-300">
                               {formatCurrency(montoTotalDeuda)}
                           </p>
                       </div>
                       <div className="bg-slate-500/10 p-3 rounded-xl border border-slate-500/20 flex justify-between items-center">
                           <p className="text-sm font-medium text-slate-400">Morosidad</p>
                           <p className="text-lg font-bold text-slate-300">
                               {indiceMorosidad}%
                           </p>
                       </div>
                   </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Gráfico de Ingresos</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {pieDataIngresos.length > 0 ? (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ bottom: 20 }}>
                        <defs>
                          <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="3" dy="8" stdDeviation="4" floodOpacity="0.6" floodColor="#000000" />
                            <feComponentTransfer><feFuncA type="linear" slope="0.8"/></feComponentTransfer>
                          </filter>
                        </defs>
                        <Pie
                          data={pieDataIngresos}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          filter="url(#shadow3d)"
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        >
                          {pieDataIngresos.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => formatCurrency(value as number)}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: '#E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                    <div className="h-64 flex items-center justify-center text-slate-500">
                        Sin datos
                    </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gráfico de Egresos</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {pieDataEgresos.length > 0 ? (
                   <div className="h-80 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart margin={{ bottom: 20 }}>
                         <defs>
                          <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="3" dy="8" stdDeviation="4" floodOpacity="0.6" floodColor="#000000" />
                            <feComponentTransfer><feFuncA type="linear" slope="0.8"/></feComponentTransfer>
                          </filter>
                         </defs>
                         <Pie
                           data={pieDataEgresos}
                           cx="50%"
                           cy="50%"
                           labelLine={false}
                           outerRadius={80}
                           fill="#8884d8"
                           dataKey="value"
                           filter="url(#shadow3d)"
                           label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                         >
                           {pieDataEgresos.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip 
                           formatter={(value) => formatCurrency(value as number)}
                           contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: '#E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                         />
                         <Legend />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                ) : (
                     <div className="h-64 flex items-center justify-center text-slate-500">
                         Sin datos
                     </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Balance General</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {pieDataConsolidado.length > 0 ? (
                   <div className="h-80 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart margin={{ bottom: 20 }}>
                         <defs>
                          <filter id="shadow3d" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="3" dy="8" stdDeviation="4" floodOpacity="0.6" floodColor="#000000" />
                            <feComponentTransfer><feFuncA type="linear" slope="0.8"/></feComponentTransfer>
                          </filter>
                         </defs>
                         <Pie
                           data={pieDataConsolidado}
                           cx="50%"
                           cy="50%"
                           labelLine={false}
                           outerRadius={80}
                           fill="#8884d8"
                           dataKey="value"
                           filter="url(#shadow3d)"
                           label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                         >
                           {pieDataConsolidado.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={entry.name === 'Ingresos' ? '#10B981' : '#EF4444'} />
                           ))}
                         </Pie>
                         <Tooltip 
                           formatter={(value) => formatCurrency(value as number)}
                           contentStyle={{ borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0F172A', color: '#E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                         />
                         <Legend />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                ) : (
                     <div className="h-64 flex items-center justify-center text-slate-500">
                         Sin datos
                     </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        // Advanced Client Reports Tab
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-blue-400" />
                <CardTitle>Filtros Avanzados de Clasificación</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 bg-slate-800/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search Term */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Búsqueda Rápida</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-500" />
                    </div>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setClientPage(1); }}
                      placeholder="Nombre, DNI, Suministro..."
                      className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                {/* Socio Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Tipo de Socio</label>
                  <select
                    value={socioTypeFilter}
                    onChange={(e) => { setSocioTypeFilter(e.target.value as any); setClientPage(1); }}
                    className="block w-full py-2 px-3 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="TODOS">Todos los Socios/Usuarios</option>
                    <option value="SOCIO">Socio</option>
                    <option value="USUARIO">Usuario (No Socio)</option>
                  </select>
                </div>

                {/* Person Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Tipo de Cliente</label>
                  <select
                    value={personTypeFilter}
                    onChange={(e) => { setPersonTypeFilter(e.target.value as any); setClientPage(1); }}
                    className="block w-full py-2 px-3 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="TODOS">Todos (Persona / Empresa)</option>
                    <option value="PERSONA">Persona Natural</option>
                    <option value="EMPRESA">Empresa</option>
                  </select>
                </div>

                {/* Service Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Tipo de Servicio</label>
                  <select
                    value={serviceTypeFilter}
                    onChange={(e) => { setServiceTypeFilter(e.target.value as any); setClientPage(1); }}
                    className="block w-full py-2 px-3 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="TODOS">Todos los Servicios</option>
                    <option value="MONOFASICO">Monofásico</option>
                    <option value="TRIFASICO">Trifásico</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Estado del Servicio</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value as any); setClientPage(1); }}
                    className="block w-full py-2 px-3 border border-slate-700 rounded-md bg-[#0B0E14] text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="TODOS">Todos los Estados</option>
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                    <option value="CORTADO">CORTADO</option>
                  </select>
                </div>
              </div>

              {isAnyFilterActive && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" onClick={clearClientFilters} size="sm">
                    <X className="h-4 w-4 mr-1.5" />
                    Limpiar Filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results Summary and Interactive Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-slate-800">
              <CardTitle className="text-base text-slate-300">
                Clientes Filtrados ({filteredReportClients.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-[#0B0E14]">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Código Suministro</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre del Cliente</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">DNI/RUC</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Dirección</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo Cliente</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tipo Socio</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Servicio</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-transparent">
                    {paginatedReportClients.length > 0 ? (
                      paginatedReportClients.map((client) => {
                        const isSocio = (client.suministros?.length ? client.suministros : [client.codigoSuministro]).some(sup => {
                           return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (client.tipo === 'SOCIO');
                        }) || client.tipo === 'SOCIO';

                        const cleanSuministros = [client.codigoSuministro, ...(client.suministros || [])].filter(Boolean).join(', ');

                        return (
                          <tr key={client.id} className="hover:bg-slate-800/10 transition-colors">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-blue-400">
                              {cleanSuministros || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-200">
                              {client.nombre ? client.nombre : `${client.apellidos || ''}, ${client.nombres || ''}`}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400 font-mono">
                              {client.dni || 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-400">
                              {`${client.direccion || ''} ${client.numeroDireccion || ''}`.trim() || 'N/A'}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                              <Badge variant="default">
                                {client.tipoPersona === 'EMPRESA' ? 'Empresa' : 'Persona Natural'}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <Badge variant={isSocio ? 'success' : 'info'}>
                                {isSocio ? 'Socio' : 'Usuario'}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <Badge variant="default">
                                {client.faseSuministro || 'MONOFASICO'}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <Badge variant={client.estado === 'ACTIVO' ? 'success' : client.estado === 'CORTADO' ? 'danger' : 'warning'}>
                                {client.estado || 'ACTIVO'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                          Ningún cliente coincide con los criterios de filtrado seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Client Pagination */}
              {clientTotalPages > 1 && (
                <div className="border-t border-slate-800 p-4">
                  <Pagination
                    currentPage={clientPage}
                    totalPages={clientTotalPages}
                    totalItems={filteredReportClients.length}
                    itemsPerPage={clientItemsPerPage}
                    onPageChange={(page) => setClientPage(page)}
                    onItemsPerPageChange={(items) => { setClientItemsPerPage(items); setClientPage(1); }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
