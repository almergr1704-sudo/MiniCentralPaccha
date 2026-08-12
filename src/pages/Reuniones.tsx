import React, { useState, useMemo } from 'react';
import { Plus, Users, Calendar, AlertCircle, FileText, CheckCircle, Download, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Button, Card, CardContent, Badge, CardHeader, CardTitle, Pagination } from '../components/ui';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { useFormPristine } from '../hooks/useFormPristine';

export default function Reuniones() {
  const { confirm } = useConfirm();
  const { clients, meetings, addMeeting, updateMeeting, recordAttendance, userRole, suppliesInfo } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [attendanceFilter, setAttendanceFilter] = useState<'SOCIO' | 'TODOS'>('SOCIO');

  const isClientSocio = (c: any) => {
     return (c.suministros?.length ? c.suministros : [c.codigoSuministro]).some((sup: string) => {
        return suppliesInfo?.find(s => s.codigo === sup)?.isSocio ?? (c.tipo === 'SOCIO');
     }) || c.tipo === 'SOCIO';
  };
  
  const socios = clients.filter(c => isClientSocio(c) && c.estado === 'ACTIVO');

  const [formData, setFormData] = useState<{
    fecha: string;
    horaTermino: string;
    motivo: string;
    lugar: string;
    temas: string;
    invitados: 'SOCIO' | 'TODOS';
  }>({
    fecha: new Date().toISOString().slice(0, 16),
    horaTermino: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    motivo: '',
    lugar: '',
    temas: '',
    invitados: 'SOCIO'
  });

  const currentMeetingState = useMemo(() => formData, [formData]);

  const initialMeetingState = useMemo(() => ({
    fecha: new Date().toISOString().slice(0, 16),
    horaTermino: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    motivo: '',
    lugar: '',
    temas: '',
    invitados: 'SOCIO' as const
  }), []);

  const { isDirty: isMeetingDirty } = useFormPristine(initialMeetingState, currentMeetingState);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.motivo) return;
    
    const isConfirmed = await confirm({
      title: 'Programar Nueva Reunión / Asamblea',
      message: `¿Está seguro de programar la reunión "${formData.motivo}" para el día ${formData.fecha.replace('T', ' ')}?`,
      type: 'confirm',
      confirmLabel: 'Sí, programar',
      cancelLabel: 'Cancelar'
    });

    if (!isConfirmed) return;

    try {
      await addMeeting({
        fecha: new Date(formData.fecha).toISOString(),
        horaTermino: new Date(formData.horaTermino).toISOString(),
        motivo: formData.motivo,
        asistencia: {}, // Initialize with empty attendance
        lugar: formData.lugar,
        temas: formData.temas,
        invitados: formData.invitados,
        estado: 'PROGRAMADA'
      });
      
      setIsModalOpen(false);
      setFormData({ 
        fecha: new Date().toISOString().slice(0, 16), 
        horaTermino: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
        motivo: '', lugar: '', temas: '', invitados: 'SOCIO' 
      });
      toast.success('✅ La reunión fue programada correctamente.');
    } catch (err: any) {
      toast.error('❌ No se pudo guardar la información. Verifique los datos e inténtelo nuevamente.');
    }
  };

  const activeMeeting = meetings.find(m => m.id === selectedMeeting);
  
  const filteredClientsList = clients.filter(c => {
    if (c.estado !== 'ACTIVO') return false;
    if (!activeMeeting) return isClientSocio(c);
    if (activeMeeting.invitados === 'TODOS') return true;
    return isClientSocio(c);
  }).sort((a, b) => 
    (a.codigoSuministro || '').localeCompare(b.codigoSuministro || '', undefined, { numeric: true, sensitivity: 'base' })
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const totalPages = Math.ceil(filteredClientsList.length / itemsPerPage);
  
  const currentClientsList = filteredClientsList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedMeeting]);

  const handleImprimirCitaciones = () => {
    if (!activeMeeting) return;
    const toastId = toast.loading('Generando citaciones...');
    try {
      const doc = new jsPDF({ format: 'a4' });
    
    const fDateLong = format(parseISO(activeMeeting.fecha), "eeee, dd 'de' MMMM 'de' yyyy", { locale: es });
    const fDate = format(parseISO(activeMeeting.fecha), "dd/MM/yyyy", { locale: es });
    const fTime = format(parseISO(activeMeeting.fecha), "HH:mm", { locale: es });
    const tipoReunion = activeMeeting.invitados === 'TODOS' ? 'todos los clientes' : 'socios';

    let yOffset = 0;
    const maxH = 297;
    
    const sortedClients = [...filteredClientsList].sort((a, b) => 
      (a.codigoSuministro || '').localeCompare(b.codigoSuministro || '')
    );
    
    sortedClients.forEach((client, index) => {
      const nmb = client.nombre || `${client.nombres} ${client.apellidos}`;
      const paragraph = `Se cita a Ud. ${nmb}, a la reunión de ${tipoReunion} de la Mini Central Hidroeléctrica Paccha, que se llevará a cabo el día ${fDateLong} a las ${fTime} en el ${activeMeeting.lugar || 'lugar de costumbre'}, con los siguientes puntos a tratar:`;
      const temasText = activeMeeting.temas || 'No especificados';
      const parsedTemas = temasText.split('\n').map(t => t.trim()).filter(t => t.length > 0);
      let temasListToPrint = parsedTemas.map((t, idx) => {
        const cleaned = t.replace(/^(\d+[\.\)\-]\s*|-\s*|\*\s*)/, '').trim();
        return `${idx + 1}. ${cleaned}`;
      });
      if (temasListToPrint.length === 0) {
        temasListToPrint = ['1. No especificados'];
      }

      // --- CALCULATE DYNAMIC HEIGHT ---
      const testDoc = new jsPDF({ format: 'a4' });
      testDoc.setFontSize(10);
      testDoc.setFont('helvetica', 'normal');
      const testDocText = testDoc.splitTextToSize(paragraph, 180);
      let testCurrentY = 16 + (testDocText.length * 5); // 16 is paragraph start Y offset relative to block
      temasListToPrint.forEach(tema => {
        const lines = testDoc.splitTextToSize(tema, 170);
        testCurrentY += lines.length * 5;
      });
      // final text and signature
      const estimatedHeight = testCurrentY + 3 + 15; // + 3 for margin, + 12 for signature + margin
      // --------------------------------

      // Auto Page Break
      if (yOffset > 0 && yOffset + estimatedHeight > maxH - 5) {
        doc.addPage();
        yOffset = 0;
      }

      // Draw dashed cut lines if not at the very top of a page
      if (yOffset > 0) {
        doc.setDrawColor(200);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(10, yOffset, 200, yOffset);
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(0);
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CITACIÓN A REUNIÓN', 105, yOffset + 8, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const docText = doc.splitTextToSize(paragraph, 180);
      doc.text(docText, 14, yOffset + 16);
      
      let currentY = yOffset + 16 + (docText.length * 5);

      temasListToPrint.forEach(tema => {
        const lines = doc.splitTextToSize(tema, 170);
        doc.text(lines, 20, currentY);
        currentY += lines.length * 5;
      });

      const finalY = currentY + 3;
      doc.text('Agradecemos su puntual asistencia.', 14, finalY);
      
      doc.line(80, finalY + 8, 130, finalY + 8);
      doc.text('La Directiva', 105, finalY + 12, { align: 'center' });

      yOffset = finalY + 18; // Setup for the next ticket offset
    });

      doc.save(`Citaciones_Reunion_${activeMeeting.fecha.split('T')[0]}.pdf`);
      toast.success('Citaciones generadas y descargadas con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating invitations PDF:', error);
      toast.error('Error al generar citaciones.', { id: toastId });
    }
  };

  const handleFinalizarReunion = async () => {
    if (!activeMeeting) return;
    
    // Check if current time is before the scheduled end time
    if (activeMeeting.horaTermino && new Date() < new Date(activeMeeting.horaTermino)) {
      toast.error('No se puede finalizar la reunión antes de la hora programada de término.');
      return;
    }

    const unregistered = filteredClientsList.filter(client => !activeMeeting.asistencia[client.id]);
    
    if (unregistered.length > 0) {
      toast.error(`No se puede finalizar la reunión. Faltan registrar la asistencia de ${unregistered.length} persona(s).`);
      return;
    }

    const confirmFin = await confirm({
      title: 'Finalizar Reunión',
      message: '¿Desea finalizar la reunión? Una vez finalizada no podrá modificar la asistencia y se emitirán multas automáticas.',
      type: 'warning',
      confirmLabel: 'Finalizar',
      cancelLabel: 'Cancelar'
    });
    if (confirmFin) {
        updateMeeting(activeMeeting.id, { estado: 'FINALIZADA', finalizada: true });
    }
  };

  const handleIniciarReunion = () => {
    if (!activeMeeting) return;
    if (new Date() < new Date(activeMeeting.fecha)) {
      toast.error('La hora programada para la reunión aún no ha llegado.');
      return;
    }
    updateMeeting(activeMeeting.id, { estado: 'EN_CURSO' });
  };

  const handleCancelarReunion = async () => {
    if (!activeMeeting) return;
    if (activeMeeting.estado && activeMeeting.estado !== 'PROGRAMADA') {
      toast.error('Solo se puede cancelar una reunión antes de que haya iniciado.');
      return;
    }
    const confirmCancel = await confirm({
      title: 'Cancelar Reunión',
      message: '¿Desea cancelar la reunión? Esta acción no se puede deshacer.',
      type: 'danger',
      confirmLabel: 'Sí, cancelar',
      cancelLabel: 'Atrás'
    });
    if (confirmCancel) {
      updateMeeting(activeMeeting.id, { estado: 'CANCELADA', finalizada: true });
    }
  };

  const handleGenerarReporteAsistencia = (meeting: typeof activeMeeting) => {
    if (!meeting) return;
    const toastId = toast.loading('Generando reporte de asistencia...');
    try {
      const doc = new jsPDF();
    doc.text(`Reporte de Asistencia`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Motivo: ${meeting.motivo}`, 14, 28);
    doc.text(`Fecha: ${format(parseISO(meeting.fecha), 'eeee, dd MMM yyyy, HH:mm', { locale: es })}`, 14, 34);

    const data: any[][] = [];
    filteredClientsList.forEach(client => {
      const status = meeting.asistencia[client.id] || 'NO_REGISTRADO';
      const labelStatus = 
          status === 'ASISTIO' ? 'Asistió' :
          status === 'FALTA_JUSTIFICADA' ? 'Falta Just.' :
          status === 'FALTA_INJUSTIFICADA' ? 'Falta Injust.' : 'No Registrado';
      data.push([
        client.codigoSuministro,
        client.nombre ? client.nombre : `${client.nombres} ${client.apellidos}`,
        client.dni,
        labelStatus
      ]);
    });
    
    if (data.length === 0) {
      toast.error('No existen datos disponibles para generar el PDF.');
      return;
    }

    autoTable(doc, {
      startY: 42,
      head: [['Cod.', 'Persona', 'DNI', 'Estado']],
      body: data,
    });

      doc.save(`Reporte_Asistencia_${meeting.fecha.split('T')[0]}.pdf`);
      toast.success('Reporte de asistencia generado y descargado con éxito.', { id: toastId });
    } catch (error) {
      console.error('Error generating attendance PDF:', error);
      toast.error('Error al generar el reporte de asistencia.', { id: toastId });
    }
  };


  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Gestión de Reuniones
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Programación de asambleas y control de asistencia (solo socios).
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          {userRole !== 'FISCALIZADOR' && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Programar Reunión
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-medium text-slate-100">Historial de Reuniones</h3>
          <div className="space-y-3">
             {meetings.length > 0 ? [...meetings].sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map(m => (
               <Card 
                 key={m.id} 
                 className={`cursor-pointer transition-colors ${selectedMeeting === m.id ? 'border-blue-500 ring-1 ring-blue-500' : 'hover:border-slate-700'}`}
                 onClick={() => setSelectedMeeting(m.id)}
                >
                 <CardContent className="p-4 flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      <Calendar className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-100">{m.motivo}</p>
                      <p className="text-xs text-slate-400">{format(parseISO(m.fecha), "dd MMM yyyy 'a las' HH:mm", { locale: es })}</p>
                      <div className="mt-2 flex items-center space-x-2">
                        <Badge variant="info">{Object.values(m.asistencia).filter(a => a === 'ASISTIO').length} Asistentes</Badge>
                      </div>
                    </div>
                 </CardContent>
               </Card>
             )) : (
               <div className="text-center py-8 text-slate-400 bg-[#0B0E14] rounded-xl border border-slate-800">
                 No hay reuniones programadas.
               </div>
             )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {activeMeeting ? (
            <Card>
              <CardHeader className="bg-slate-800/50 border-b border-slate-800">
                 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <CardTitle>{activeMeeting.motivo}</CardTitle>
                      <p className="text-sm text-slate-400 mt-1">
                        {format(parseISO(activeMeeting.fecha), "eeee, dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                      </p>
                    </div>
                    
                    <div className="flex space-x-2 items-center">
                       {activeMeeting.estado === 'CANCELADA' ? (
                         <Badge variant="danger" className="px-3 py-2 text-sm"><XCircle className="w-4 h-4 mr-2"/> Reunión Cancelada</Badge>
                       ) : activeMeeting.finalizada || activeMeeting.estado === 'FINALIZADA' ? (
                         <>
                           <Badge variant="success" className="px-3 py-2 text-sm"><CheckCircle className="w-4 h-4 mr-2"/> Reunión Finalizada</Badge>
                           <Button variant="outline" onClick={() => handleGenerarReporteAsistencia(activeMeeting)}>
                             <Download className="w-4 h-4 mr-2"/> Reporte
                           </Button>
                         </>
                       ) : (
                         userRole !== 'FISCALIZADOR' && (
                           <>
                             {(!activeMeeting.estado || activeMeeting.estado === 'PROGRAMADA') && (
                               <Button 
                                 onClick={handleIniciarReunion} 
                                 className="bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                 disabled={new Date() < new Date(activeMeeting.fecha)}
                                 title={new Date() < new Date(activeMeeting.fecha) ? 'La reunión aún no puede iniciar (hora programada futura)' : ''}
                               >
                                 Iniciar Reunión
                               </Button>
                             )}
                             {activeMeeting.estado === 'EN_CURSO' && (
                               <Button onClick={handleFinalizarReunion} variant="danger">
                                 Finalizar
                               </Button>
                             )}
                             {(!activeMeeting.estado || activeMeeting.estado === 'PROGRAMADA') && (
                               <Button variant="outline" onClick={handleCancelarReunion} className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300">
                                 Cancelar
                               </Button>
                             )}
                           </>
                         )
                       )}
                       <Button variant="outline" onClick={handleImprimirCitaciones}>
                         <FileText className="w-4 h-4 mr-2"/>
                         Citaciones
                       </Button>
                    </div>
                 </div>
              </CardHeader>
              <CardContent className="p-0">
                {activeMeeting.estado === 'EN_CURSO' ? (
                  <div className="bg-yellow-500/10 p-4 border-b border-yellow-500/20 flex items-start space-x-3">
                     <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                     <p className="text-sm text-yellow-200/80">
                       Marcar a una persona con <strong>"Falta Injustificada"</strong> penalizará según las reglas.
                     </p>
                  </div>
                ) : (
                  <div className="bg-blue-500/10 p-4 border-b border-blue-500/20 flex items-start space-x-3">
                     <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                     <p className="text-sm text-blue-200/80">
                       {activeMeeting.estado === 'PROGRAMADA' 
                         ? 'Debe iniciar la reunión para habilitar el registro de asistencia.' 
                         : 'El registro de asistencia ya se ha cerrado.'}
                     </p>
                  </div>
                )}
                
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredClientsList.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
                  disableTopBorder={true}
                />

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead className="bg-slate-800/50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Persona</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Estado de Asistencia</th>
                      </tr>
                    </thead>
                    <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                       {currentClientsList.map(socio => {
                         const status = activeMeeting.asistencia[socio.id];
                         return (
                           <tr key={socio.id} className="hover:bg-slate-800/50">
                             <td className="px-6 py-4 whitespace-nowrap">
                               <div className="flex items-center">
                                 <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                   <Users className="h-4 w-4 text-blue-600" />
                                 </div>
                                 <div className="ml-4">
                                   <div className="text-sm font-medium text-slate-100">{socio.nombre ? socio.nombre : `${socio.nombres} ${socio.apellidos}`} <span className="ml-2 text-xs text-slate-400">({socio.tipo})</span></div>
                                   <div className="text-xs text-slate-400">{socio.codigoSuministro}</div>
                                 </div>
                               </div>
                             </td>
                             <td className="px-6 py-4 whitespace-nowrap">
                               <div className="flex space-x-2">
                                  {(activeMeeting.finalizada || userRole === 'FISCALIZADOR' || activeMeeting.estado !== 'EN_CURSO') ? (
                                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                      status === 'ASISTIO' ? 'bg-emerald-500/20 text-emerald-400' :
                                      status === 'FALTA_JUSTIFICADA' ? 'bg-amber-500/20 text-amber-400' :
                                      status === 'FALTA_INJUSTIFICADA' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                      {status === 'ASISTIO' ? 'Asistió' :
                                       status === 'FALTA_JUSTIFICADA' ? 'Falta Justificada' :
                                       status === 'FALTA_INJUSTIFICADA' ? 'Falta Injustificada' : 'Sin Marcar'}
                                    </span>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => recordAttendance(activeMeeting.id, socio.id, 'ASISTIO')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                          status === 'ASISTIO' ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        Asistió
                                      </button>
                                      <button
                                        onClick={() => recordAttendance(activeMeeting.id, socio.id, 'FALTA_JUSTIFICADA')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                          status === 'FALTA_JUSTIFICADA' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        Falta Justificada
                                      </button>
                                      <button
                                        onClick={() => recordAttendance(activeMeeting.id, socio.id, 'FALTA_INJUSTIFICADA')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                          status === 'FALTA_INJUSTIFICADA' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                      >
                                        Injustificada (Multa)
                                      </button>
                                    </>
                                  )}
                               </div>
                             </td>
                           </tr>
                         )
                       })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredClientsList.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
                />
              </CardContent>
            </Card>
          ) : (
             <div className="h-full flex flex-col items-center justify-center bg-[#0B0E14] border border-slate-800 rounded-xl border-dashed py-12">
                <Calendar className="h-12 w-12 text-slate-600 mb-3" />
                <h3 className="text-lg font-medium text-slate-100">Ninguna reunión seleccionada</h3>
                <p className="text-slate-400 mt-1">Selecciona una reunión de la lista para gestionar la asistencia.</p>
             </div>
          )}
        </div>
      </div>

      {/* Modal Add Meeting */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-slate-900 bg-opacity-75 transition-opacity" onClick={() => setIsModalOpen(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative z-10 inline-block align-bottom bg-[#0B0E14] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <form onSubmit={handleSubmit}>
                <div className="bg-[#0B0E14] px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-slate-100" id="modal-title">
                    Programar Asamblea / Reunión
                  </h3>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300">Fecha y Hora de Inicio</label>
                        <input 
                          type="datetime-local" 
                          required 
                          value={formData.fecha} 
                          onChange={e => setFormData({...formData, fecha: e.target.value})} 
                          className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300">Fecha y Hora de Término</label>
                        <input 
                          type="datetime-local" 
                          required 
                          value={formData.horaTermino} 
                          onChange={e => setFormData({...formData, horaTermino: e.target.value})} 
                          className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Motivo de la Reunión</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Asamblea General Ordinaria"
                        value={formData.motivo} 
                        onChange={e => setFormData({...formData, motivo: e.target.value})} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 placeholder-slate-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Lugar</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Local Comunal"
                        value={formData.lugar} 
                        onChange={e => setFormData({...formData, lugar: e.target.value})} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 placeholder-slate-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Temas a tratar</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="Ej. 1. Balance anual&#10;2. Elecciones"
                        value={formData.temas} 
                        onChange={e => setFormData({...formData, temas: e.target.value})} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 placeholder-slate-500" 
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Invitados</label>
                      <select
                        value={formData.invitados} 
                        onChange={e => setFormData({...formData, invitados: e.target.value as 'SOCIO' | 'TODOS'})} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                      >
                        <option value="SOCIO">Solo Socios</option>
                        <option value="TODOS">Todos los Clientes</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                  <Button 
                    type="submit" 
                    variant="primary" 
                    disabled={!isMeetingDirty}
                    className="w-full sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Crear Reunión
                  </Button>
                  <Button type="button" variant="cancel" onClick={() => setIsModalOpen(false)} className="mt-3 w-full sm:mt-0 sm:w-auto">Cancelar</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
