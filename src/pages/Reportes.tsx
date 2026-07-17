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

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Reportes y Estadísticas Financieras
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Análisis financiero, recaudación e índice de morosidad.
          </p>
        </div>
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
      </div>

      <div className="space-y-6">
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
      </div>
    </div>
  );
}
