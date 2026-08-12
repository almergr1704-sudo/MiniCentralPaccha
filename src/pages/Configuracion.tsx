import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, Save, KeyRound, Database, BookOpen, Download, Trash2, RotateCcw } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, CardTitle, Button } from '../components/ui';
import { useConfirm } from '../components/ui/ConfirmDialog';
import bcrypt from 'bcryptjs';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import { PasswordStrengthIndicator, evaluatePasswordStrength } from '../components/PasswordStrengthIndicator';
import html2canvas from 'html2canvas';
import ManualCapture from '../components/ManualCapture';
import ComiteDirectivo from '../components/ComiteDirectivo';
import { useFormPristine } from '../hooks/useFormPristine';

export default function Configuracion() {
  const { settings, updateSettings, userRole, user, updateAdmin, admins, mustChangePassword, seedDatabaseFromBackup, resetDatabase, initializeCounter } = useAppContext();
  const { confirm } = useConfirm();
  const [configTab, setConfigTab] = useState<'operativa' | 'comite' | 'cuenta' | 'datos_manuales'>(() => {
    if (userRole === 'OPERATOR') return 'cuenta';
    return userRole === 'ADMIN' ? 'operativa' : 'comite';
  });
  const [isCapturing, setIsCapturing] = useState(false);

  const initialSettings = useMemo(() => ({
    costoSocio: settings?.costoSocio ?? 0.20,
    costoUsuario: settings?.costoUsuario ?? 0.30,
    costoTrifasico: settings?.costoTrifasico ?? 0.00,
    multaReunion: settings?.multaReunion ?? 40,
    costoReconexion: settings?.costoReconexion ?? 0.00,
    consumoMinimo: settings?.consumoMinimo ?? 6.00,
    ventaNuevoServicio: settings?.ventaNuevoServicio ?? 0.00
  }), [settings]);

  const [formData, setFormData] = useState(initialSettings);

  useEffect(() => {
    setFormData(initialSettings);
  }, [initialSettings]);

  const { isDirty: isConfigDirty, markSaved: markConfigSaved, resetToInitial: resetConfig } = useFormPristine(initialSettings, formData);

  const [counterPrefix, setCounterPrefix] = useState<'REC' | 'S' | 'VS' | 'TR'>('REC');
  const [counterSuffix, setCounterSuffix] = useState(new Date().toISOString().slice(0, 7));
  const [counterStart, setCounterStart] = useState<number>(0);
  const [isInitializingCounter, setIsInitializingCounter] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigDirty) return;
    if (userRole === 'OPERATOR' || userRole === 'FISCALIZADOR') {
      toast.error('No tiene permisos para modificar la configuración.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Actualizar Configuración del Sistema',
      message: '¿Está seguro de que desea guardar los cambios en las tarifas y parámetros operativos?\n\nSe procederá a guardar la información ingresada. Verifique los datos antes de continuar.',
      type: 'confirm',
      confirmLabel: 'Sí, guardar',
      cancelLabel: 'Cancelar'
    });

    if (!isConfirmed) return;

    try {
      await updateSettings(formData);
      markConfigSaved(formData);
      toast.success('✅ La información se guardó correctamente.');
    } catch {
      toast.error('❌ No se pudo guardar la información. Verifique los datos e inténtelo nuevamente.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('No se pudo identificar al usuario actual.');
      return;
    }

    const currentAdmin = admins.find(a => a.email === user.email);
    if (!currentAdmin) {
      toast.error('Usuario no encontrado en la base de datos.');
      return;
    }

    let isMatch = false;
    try {
      isMatch = bcrypt.compareSync(passwordForm.currentPassword, currentAdmin.password) || currentAdmin.password === passwordForm.currentPassword;
    } catch {
      isMatch = currentAdmin.password === passwordForm.currentPassword;
    }

    if (!isMatch) {
      toast.error('La contraseña actual es incorrecta.');
      return;
    }

    // Validar que la nueva contraseña no sea igual a la contraseña actual
    const isSamePassword = passwordForm.newPassword === passwordForm.currentPassword || 
      (currentAdmin.password && (
        currentAdmin.password === passwordForm.newPassword || 
        bcrypt.compareSync(passwordForm.newPassword, currentAdmin.password)
      ));

    if (isSamePassword) {
      toast.error('❌ La nueva contraseña no puede ser igual a la contraseña actual. Por favor, ingresa una contraseña diferente.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    const strength = evaluatePasswordStrength(passwordForm.newPassword);
    if (strength.score < 4) {
      toast.error('La contraseña no cumple con todas las políticas de seguridad requeridas. Siga las recomendaciones debajo del campo.');
      return;
    }

    const isFirstTimeChange = currentAdmin.mustChangePassword;

    const hashedPassword = bcrypt.hashSync(passwordForm.newPassword, 10);
    await updateAdmin(currentAdmin.id, { 
      password: hashedPassword, 
      rawPasswordToCheck: passwordForm.newPassword,
      mustChangePassword: false,
      lastPasswordChangeLog: isFirstTimeChange 
        ? `Cambio obligatorio de contraseña realizado en primer inicio el ${new Date().toLocaleString()}`
        : `Cambio voluntario el ${new Date().toLocaleString()}`
    });
    
    if (isFirstTimeChange) {
      toast.success('Cambio obligatorio de contraseña registrado correctamente en la auditoría.');
    } else {
      toast.success('Contraseña actualizada correctamente.');
    }
    
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const backupInputRef = React.useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    const data = localStorage.getItem('erp_data');
    if (!data) {
      toast.error('No hay datos para exportar.');
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Backup_Sistema_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Copia de seguridad descargada.');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isConfirmed = await confirm({
      title: 'Restaurar Copia de Seguridad',
      message: '¿ESTÁS SEGURO? Importar una copia de seguridad sobrescribirá TODOS los datos actuales del sistema en Firestore. Esta acción no se puede deshacer.',
      type: 'danger',
      confirmLabel: 'Restaurar',
      cancelLabel: 'Cancelar'
    });

    if (!isConfirmed) {
      if(backupInputRef.current) backupInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const toastId = toast.loading('Sincronizando base de datos en Firestore...');
      try {
        const jsonStr = evt.target?.result as string;
        const parsedData = JSON.parse(jsonStr); // Validate JSON
        await seedDatabaseFromBackup(parsedData);
        toast.success('Base de datos restaurada correctamente en la nube. Recargando...', { id: toastId });
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        toast.error('El archivo de respaldo no es válido o está dañado.', { id: toastId });
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    const isConfirmed = await confirm({
      title: '⚠ ¿Vaciar y restablecer toda la base de datos a cero?',
      message: 'Esta operación es IRREVERSIBLE.\n\nSe eliminarán TODOS los registros del sistema: clientes, lecturas, consumos, recibos, multas, transacciones de caja, reuniones, comités y trabajadores.\n\nSe restablecerá únicamente el usuario administrador inicial (admin@jass.com / admin) para que pueda empezar nuevamente desde cero.\n\n¿Está seguro de continuar?',
      type: 'danger',
      confirmLabel: 'Sí, vaciar y empezar de cero',
      cancelLabel: 'Cancelar'
    });

    if (!isConfirmed) return;

    const toastId = toast.loading('Eliminando todos los datos en Firestore...');
    try {
      await resetDatabase();
      toast.success('Base de datos restablecida a cero con éxito. Recargando...', { id: toastId });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      toast.error('Error al intentar vaciar la base de datos: ' + (error.message || 'Error desconocido'), { id: toastId });
    }
  };

  const handleInitCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitializingCounter(true);
    const counterId = counterPrefix === 'REC' ? `${counterPrefix}-${counterSuffix}` : counterPrefix;
    
    const isConfirmed = await confirm({
      title: 'Inicializar Correlativo',
      message: `¿Está seguro de inicializar el correlativo "${counterId}" con valor de inicio ${counterStart}? Si ya existe, se sobrescribirá.`,
      type: 'warning',
      confirmLabel: 'Inicializar'
    });

    if (!isConfirmed) {
      setIsInitializingCounter(false);
      return;
    }

    try {
      await initializeCounter(counterId, counterStart);
      toast.success(`Contador "${counterId}" inicializado en ${counterStart} correctamente.`);
    } catch (err: any) {
      toast.error(err.message || 'Error al inicializar contador.');
    } finally {
      setIsInitializingCounter(false);
    }
  };

  const handleDownloadManual = async (roleType: string) => {
    setIsCapturing(true);
    const toastId = toast.loading(`Generando manual de ${roleType}...`);
    try {
      const doc = new jsPDF();
      let yOffset = 20;
      
      // Helper to add page if needed
      const checkPage = (addedHeight: number) => {
        if (yOffset + addedHeight > 280) {
          doc.addPage();
          yOffset = 20;
        }
      };
      
      // Header
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text(`Manual de Usuario - Perfil: ${roleType}`, 105, 20, { align: 'center' });
      
      // Indice
      yOffset = 45;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text('ÍNDICE', 14, yOffset);
      yOffset += 10;
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(50, 50, 50);
      const indiceRows = [
        '1. Descripción General y Permisos',
        '2. Módulos Habilitados y Accesos Operativos',
        '3. Guías Paso a Paso de Módulos (con Capturas)',
        '4. Glosario de Términos',
        '5. Preguntas Frecuentes (FAQ)'
      ];
      indiceRows.forEach((row, i) => {
        doc.text(row, 18, yOffset + (i * 7));
      });
      
      doc.addPage();
      yOffset = 20;
      
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text('1. Descripción General y Permisos:', 14, yOffset);
      yOffset += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(50, 50, 50);
      
      let description = '';
      if (roleType === 'ADMIN') {
        description = 'El Administrador tiene acceso total al sistema. Puede gestionar clientes, ver y procesar cobros, aplicar consumos y multas, configurar tarifas, administrar cuentas de usuario, realizar exportaciones/importaciones (Backups) y visualizar finanzas.';
      } else if (roleType === 'TESORERO') {
        description = 'El Tesorero se encarga principalmente de recaudar ingresos. Tiene acceso al cobro de recibos (Consumos y Multas) y puede visualizar el estado de deuda de los clientes. No puede alterar lecturas ni reportar egresos.';
      } else if (roleType === 'OPERATOR') {
        description = 'El Operador (Digitador) es responsable del trabajo de campo o digitación. Puede registrar nuevos clientes, actualizar direcciones e ingresar mensualmente las lecturas de los medidores de agua.';
      } else if (roleType === 'FISCALIZADOR') {
        description = 'El Fiscalizador realiza tareas de auditoría. Tiene acceso de solo lectura a los movimientos financieros, listado de clientes y consumos, permitiendo monitorear las métricas de la asociación sin alterar datos.';
      }
      
      const descLines = doc.splitTextToSize(description, 180);
      doc.text(descLines, 14, yOffset);
      yOffset += (descLines.length * 6) + 10;
      
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Módulos Habilitados y Funcionalidades:', 14, yOffset);
      yOffset += 10;
      
      const writeSection = async (title: string, desc: string, steps: string[], mockId: string) => {
        checkPage(30);
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 64, 175); // blue-800
        doc.text(`Módulo: ${title}`, 14, yOffset);
        yOffset += 7;
        
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);
        const textLines = doc.splitTextToSize(desc, 180);
        doc.text(textLines, 14, yOffset);
        yOffset += (textLines.length * 6) + 4;
        
        if (steps && steps.length > 0) {
          checkPage(steps.length * 7 + 10);
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text('Guía Paso a Paso:', 14, yOffset);
          yOffset += 6;
          doc.setFontSize(11);
          doc.setFont(undefined, 'normal');
          steps.forEach((step, idx) => {
            const stepLines = doc.splitTextToSize(`Paso ${idx + 1}: ${step}`, 175);
            doc.text(stepLines, 18, yOffset);
            yOffset += (stepLines.length * 5) + 2;
          });
          yOffset += 7;
        }
        
        checkPage(75);

        // Capture image from DOM
        try {
          const el = document.getElementById(mockId);
          if (el) {
            const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, logging: false });
            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            
            // Draw window header
            doc.setFillColor(226, 232, 240);
            doc.rect(14, yOffset, 182, 8, 'F');
            doc.setFillColor(241, 245, 249);
            doc.circle(20, yOffset + 4, 1.5, 'F');
            doc.circle(25, yOffset + 4, 1.5, 'F');
            doc.circle(30, yOffset + 4, 1.5, 'F');
            
            doc.addImage(imgData, 'JPEG', 14, yOffset + 8, 182, (canvas.height * 182) / canvas.width);
            
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184); // slate-400
            doc.text(`Captura: Sistema ERP - ${title}`, 105, yOffset + 8 + ((canvas.height * 182) / canvas.width) + 5, { align: 'center' });
            
            yOffset += ((canvas.height * 182) / canvas.width) + 18;
          }
        } catch (captureErr) {
          console.error("Error capturing "+mockId, captureErr);
        }
      };

      if (roleType === 'ADMIN') {
        await writeSection(
          'Panel Principal (Dashboard)', 
          'Proporciona una vista rápida de las métricas principales del sistema: ingresos, egresos, balance total, así como la cantidad de clientes morosos y aquellos con reconexiones pendientes.',
          ['Visualizar un resumen de las métricas en tarjetas superiores.', 'Revisar la tabla de distribución de clientes por sector y tipo.', 'Ver el gráfico de los ingresos del mes.'],
          'capture-dashboard'
        );
        await writeSection(
          'Clientes', 
          'Gestión completa del padrón de pobladores (Socios y Usuarios). Permite administrar datos, cortes de servicio y verificar deudas.',
          ['Hacer clic en "Nuevo Cliente" para agregar usuarios o socios.', 'En la tabla, buscar mediante código de suministro o nombre.', 'Seleccionar "D" o "M" en los botones de acción para gestionar Deudas o Multas.', 'Editar la información desde el botón Lápiz o activar CORTADO/ACTIVO.'],
          'capture-clientes'
        );
        await writeSection(
          'Consumos Anuales', 
          'Módulo para procesar lecturas de medidores mensualmente. Genera masivamente los comprobantes en base al rango de consumo y la tarifa establecida.',
          ['Elegir el Mes y Año para habilitar la planilla de registro.', 'Ingresar la lectura actual para cada cliente que no cuente con una.', 'Hacer clic en "Generar Recibo" o "Generar Recibos Faltantes" para emitir la deuda.', 'Usar los botones "PAGAR" para liquidar el recibo generado.'],
          'capture-consumo'
        );
        await writeSection(
          'Reuniones / Asambleas', 
          'Registra reuniones comunitarias o asambleas para el control de asistencia. Calcula quórum y asigna multas para quienes no justifiquen su inasistencia.',
          ['Crear una nueva reunión indicando fecha, hora general y hora límite (Fin de Tolerancia).', 'Marcar la asistencia de cada socio mediante los botones Asistió (Verde) o Justificó.', 'Cerrar el padrón y presionar "Asignar Multas" para que los inasistentes adquieran una deuda automática.', 'Imprimir el reporte de citados.'],
          'capture-reuniones'
        );
        await writeSection(
          'Finanzas', 
          'Lleva el registro de caja de toda la asociación, consolidando ingresos de multas y consumos. Permite asentar salidas (egresos) monetarias justificadas.',
          ['Visualizar el listado en tiempo real de transacciones (Cobros y Egresos).', 'Filtrar por tipo (Recibo, Multa, Egreso, Reingreso, Devolución) y mes.', 'Hacer clic en "Generar Detalle de Ingresos PDF" para reportes por operador en fechas elegidas.', 'Ingresar "Nuevo Egreso" con su concepto (p. ej. reparación tuberías) y monto.'],
          'capture-finanzas'
        );
        await writeSection(
          'Usuarios (Gestión de Roles)', 
          'Administra los perfiles de acceso. Permite dar de alta a miembros de mesa directiva y/o digitadores.',
          ['Abrir el módulo Usuarios (ícono de Escudo).', 'Crear un usuario nuevo llenando nombres, DNI, correo temporal (opcional), rol a desempeñar y contraseña.', 'Revocar accesos eliminando o editando cuentas existentes.'],
          'capture-usuarios'
        );
        await writeSection(
          'Configuración del Sistema', 
          'Parámetros centrales de tarifas de agua, costos de multa por defecto y exportación de copias de seguridad de los datos.',
          ['Revisar "Tarifas de Agua"; cambiar el rango, el costo de las cuotas familiares, y cuotas base de agua.', 'En la sección Bases Administrativas configurar Multa de Asamblea (ej. 50 MXN/PEN), Asignación de Socio y Reconexiones de Servicio.', 'Exportar copia de Sistema (JSON) a escritorio como archivo de respaldo diario.', 'Descargar este manual PDF.'],
          'capture-dashboard'
        );
      } else if (roleType === 'TESORERO') {
        await writeSection(
          'Panel Principal', 
          'Brinda lectura rápida del desempeño de las recaudaciones y nivel de deuda de los clientes.',
          ['Seleccionar Panel Inferior para ver tarjetas informativas.', 'El sistema detalla el número de morosos para realizar notificaciones físicas.'],
          'capture-dashboard'
        );
        await writeSection(
          'Cobro de Consumos', 
          'Recaudación por recibos de suministro de agua correspondientes al consumo capturado (mensual).',
          ['Navegar a Consumos.', 'Seleccionar el Mes activo a liquidar.', 'Hacer clic en el botón verde "PAGAR" al lado del cliente en la lista, lo que transfiere el dinero al sistema contable.', 'Hacer clic en el icono "PDF (Recibo)" para imprimir el comprobante térmico/A4.'],
          'capture-consumo'
        );
        await writeSection(
          'Cobro de Multas y Asistencia', 
          'Recaudación por faltas o reuniones de inasistencia, garantizando el control del libro de asambleas.',
          ['Navegar al apartado Clientes, pulsar en Icono Naranja Escudo (Ver Multas). Alternativamente entrar a padrón.', 'Buscar a un cliente específico, y cobrar las deudas listadas y generadas previamente.', 'El estado cambiará automáticamente a PAGADO.'],
          'capture-clientes'
        );
      } else if (roleType === 'OPERATOR') {
        await writeSection(
          'Clientes', 
          'Registro digital del libro padrón. Actualización de censos y altas de servicios.',
          ['Entrar a "Clientes" e ingresar "Crear Cliente".', 'Completar Nombres, DNI, Código de suministro asignado, Sexo, Categoría (Socio/Usuario) y Sector.', 'Hacer clic en guardar. Los datos estarán automáticamente en el sistema para la toma de lecturas diarias.'],
          'capture-clientes'
        );
        await writeSection(
          'Consumos (Lecturas Médicas)', 
          'Toma de lecturas mensuales del medidor de agua correspondiente a cada cliente.',
          ['Ir a Consumos y seleccionar el mes activo.', 'Caminar a los domicilios, e identificar por número de suministro y titular.', 'Digitar en "Lectura Actual" los m3 del hidrómetro y apretar "Enter".', 'El sistema mostrará en amarillo cambios anormalmente altos del consumo anterior.'],
          'capture-consumo'
        );
        await writeSection(
          'Reuniones (Toma de Lista)', 
          'Apoyo perimetral para registrar asistencia a la hora del evento general.',
          ['Para facilitar la entrada al local, dar check a Asistió o Falto en la tabla en el módulo Reuniones para la asamblea ACTIVA.', 'Puede buscar en campo de texto con las primeras letras de los apellidos del socio en la puerta.'],
          'capture-reuniones'
        );
      } else if (roleType === 'FISCALIZADOR') {
        await writeSection(
          'Panel y Dashboard', 
          'Vista de métricas operativas del desempeño de Tesoreria y Directiva de Operaciones.',
          ['Supervisar la recaudación en tiempo real (ingresos vs. egresos).', 'Revisar la alerta de desconexiones pendientes por acumulación.', 'Visualizar evolución mes a mensual en gráficos de barra.'],
          'capture-dashboard'
        );
        await writeSection(
          'Auditoría y Reportes (Finanzas)', 
          'Extractos y comprobantes consolidados de cada mes emitidos por el secretario.',
          ['Navegar a la pestaña "Finanzas".', 'Generar Exportación a "Excel" del flujo de caja, o presionar "Exportar a PDF" para imprimir extracto certificado del registro de actividades.', 'Comparar lecturas y cobros para verificar validez y exactitud de información guardada.'],
          'capture-finanzas'
        );
      }
      
      // Glosario
      doc.addPage();
      yOffset = 20;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text('4. Glosario de Términos', 14, yOffset);
      yOffset += 10;
      doc.setFontSize(11);
      
      const glosario = [
        { term: 'Suministro', desc: 'Conexión de agua de cada predio. Cada usuario puede tener uno o múltiples.' },
        { term: 'Socio', desc: 'Participante inscrito en la padrón principal que tiene obligaciones de asistir a reuniones.' },
        { term: 'Multa por Inasistencia', desc: 'Cargo monetario aplicado automáticamente cuando un socio falta a una reunión.' },
        { term: 'Lectura', desc: 'Valor numérico (en metros cúbicos) reportado por el medidor en un momento del mes.' },
        { term: 'Conciliación', desc: 'Verificación de que los ingresos y egresos cuadran con el efectivo físico.' }
      ];
      
      glosario.forEach(item => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text(item.term, 14, yOffset);
        yOffset += 5;
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);
        const splitDesc = doc.splitTextToSize(item.desc, 180);
        doc.text(splitDesc, 14, yOffset);
        yOffset += (splitDesc.length * 5) + 5;
      });
      
      // FAQ
      yOffset += 10;
      if (yOffset > 250) { doc.addPage(); yOffset = 20; }
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.setFont(undefined, 'bold');
      doc.text('5. Preguntas Frecuentes (FAQ)', 14, yOffset);
      yOffset += 10;
      doc.setFontSize(11);
      
      const faqs = [
        { q: '¿Cómo restablezco un pago por error?', a: 'Comunícate con el Administrador para que anule la transacción ingresando al panel y emitiendo un contra-movimiento de corrección o anulación directa.' },
        { q: '¿Qué pasa si me equivoco en una lectura?', a: 'Puedes corregirla en el mes activo editando directamente el número y volviendo a guardar con "Enter".' },
        { q: '¿Dónde veo el balance mensual?', a: 'Se encuentra en la sección Finanzas o en el Dashboard si cuentas con permisos.' }
      ];
      
      faqs.forEach(faq => {
        if (yOffset > 270) { doc.addPage(); yOffset = 20; }
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        const qLines = doc.splitTextToSize(`P: ${faq.q}`, 180);
        doc.text(qLines, 14, yOffset);
        yOffset += (qLines.length * 5) + 2;
        
        doc.setFont(undefined, 'normal');
        doc.setTextColor(50, 50, 50);
        const aLines = doc.splitTextToSize(`R: ${faq.a}`, 180);
        doc.text(aLines, 14, yOffset);
        yOffset += (aLines.length * 5) + 6;
      });

      doc.save(`Manual_Paccha_${roleType}.pdf`);
      toast.success('Manual exportado con éxito.', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Error al generar el manual PDF', { id: toastId });
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight flex items-center">
            <Settings className="h-8 w-8 mr-3 text-blue-500" />
            Configuración del Sistema
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Administre las tarifas, multas y costos operativos generales.
          </p>
        </div>
      </div>

      {!mustChangePassword && (
        <div className="flex border-b border-slate-700/60 space-x-2 md:space-x-4 mb-2 overflow-x-auto pb-1 scrollbar-none">
          {userRole === 'ADMIN' && (
            <button
              type="button"
              onClick={() => setConfigTab('operativa')}
              className={`pb-3 text-xs md:text-sm font-semibold border-b-2 transition-all px-2 whitespace-nowrap ${
                configTab === 'operativa' 
                  ? 'border-blue-500 text-blue-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Configuración Operativa
            </button>
          )}
          {userRole !== 'OPERATOR' && (
            <button
              type="button"
              onClick={() => setConfigTab('comite')}
              className={`pb-3 text-xs md:text-sm font-semibold border-b-2 transition-all px-2 whitespace-nowrap ${
                configTab === 'comite' 
                  ? 'border-blue-500 text-blue-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Comité Directivo de la Central
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfigTab('cuenta')}
            className={`pb-3 text-xs md:text-sm font-semibold border-b-2 transition-all px-2 whitespace-nowrap ${
              configTab === 'cuenta' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Mi Cuenta (Contraseña)
          </button>
          <button
            type="button"
            onClick={() => setConfigTab('datos_manuales')}
            className={`pb-3 text-xs md:text-sm font-semibold border-b-2 transition-all px-2 whitespace-nowrap ${
              configTab === 'datos_manuales' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {userRole === 'OPERATOR' ? 'Manuales de Usuario' : 'Copias de Respaldo & Manuales'}
            </button>
          </div>
        )}
      
      {mustChangePassword && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg">
          <p className="text-red-400 text-sm font-medium">
            Por seguridad, debe cambiar su contraseña antes de continuar utilizando el sistema.
          </p>
        </div>
      )}

      {(!mustChangePassword && configTab === 'operativa' && userRole === 'ADMIN') && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-lg font-medium text-slate-200 mb-4 border-b border-slate-700 pb-2">Tarifas de Consumo (S/ por kWh)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Costo para Socios</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="costoSocio"
                        step="0.01"
                        min="0"
                        value={formData.costoSocio} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Costo para Demás Clientes (Usuarios)</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="costoUsuario"
                        step="0.01"
                        min="0"
                        value={formData.costoUsuario} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Costo para Suministro Trifásico</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="costoTrifasico"
                        step="0.01"
                        min="0"
                        value={formData.costoTrifasico} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Deje en 0 para no aplicar tarifa especial.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Consumo Mínimo (Monto a pagar)</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="consumoMinimo"
                        step="0.01"
                        min="0"
                        value={formData.consumoMinimo} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Venta de Nuevo Servicio</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="ventaNuevoServicio"
                        step="0.10"
                        min="0"
                        value={formData.ventaNuevoServicio} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Costo base asociado a la instalación de un nuevo suministro.</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                <h3 className="text-lg font-medium text-slate-200 mb-4 border-b border-slate-700 pb-2">Multas y Otros Pagos</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Multa por Inasistencia a Reuniones</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="multaReunion"
                        step="1"
                        min="0"
                        value={formData.multaReunion} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Pago por Reconexión</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-slate-500 sm:text-sm">S/</span>
                      </div>
                      <input 
                        type="number" 
                        name="costoReconexion"
                        step="1"
                        min="0"
                        value={formData.costoReconexion} 
                        onChange={handleChange} 
                        className="block w-full pl-8 bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100" 
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
            <div className="flex justify-end items-center space-x-3 pt-4 border-t border-slate-800">
              {isConfigDirty && (
                <Button 
                  type="button" 
                  variant="cancel"
                  onClick={() => setFormData(resetConfig())}
                  className="flex items-center"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restablecer Cambios
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={!isConfigDirty}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar Configuración
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {!mustChangePassword && configTab === 'comite' && (
        <ComiteDirectivo />
      )}

      {(mustChangePassword || configTab === 'cuenta') && (() => {
        const isSamePassword = Boolean(
          passwordForm.currentPassword &&
          passwordForm.newPassword &&
          passwordForm.newPassword === passwordForm.currentPassword
        );
        return (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={handlePasswordChange} className="space-y-6">
                <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2 flex items-center">
                  <KeyRound className="w-5 h-5 mr-2 text-slate-400" />
                  {mustChangePassword ? 'Cambio Obligatorio de Contraseña' : 'Cambiar mi Contraseña'}
                </h3>
                {mustChangePassword && (
                  <div className="bg-amber-950/40 border border-amber-800/50 text-amber-300 p-3.5 rounded-lg text-sm flex items-start space-x-2">
                    <span className="text-amber-400 font-bold text-base leading-none">⚠️</span>
                    <div>
                      <strong>Cambio de clave requerido:</strong> Por razones de seguridad, es obligatorio actualizar su contraseña inicial antes de continuar utilizando el sistema.
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-300">Contraseña Actual</label>
                    <div className="mt-1">
                      <input 
                        type="password"
                        required
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                        className="block w-full max-w-md bg-[#0B0E14] border border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100 placeholder-slate-500" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Nueva Contraseña</label>
                    <div className="mt-1">
                      <input 
                        type="password"
                        required
                        minLength={8}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        className={`block w-full bg-[#0B0E14] border ${
                          isSamePassword 
                            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500' 
                            : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
                        } rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm text-slate-100 placeholder-slate-500`}
                        placeholder="Mínimo 8 caracteres, alfanuméricos y especiales"
                      />
                    </div>
                    {isSamePassword && (
                      <p className="mt-1.5 text-xs font-semibold text-red-400 flex items-center justify-start bg-red-950/40 p-2.5 rounded border border-red-800/50">
                        ❌ La nueva contraseña no puede ser igual a la contraseña actual. Por favor, ingresa una contraseña diferente.
                      </p>
                    )}
                    <PasswordStrengthIndicator passwordStr={passwordForm.newPassword} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Confirmar Nueva Contraseña</label>
                    <div className="mt-1">
                      <input 
                        type="password"
                        required
                        minLength={8}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className={`block w-full bg-[#0B0E14] border ${
                          passwordForm.confirmPassword 
                            ? (passwordForm.newPassword === passwordForm.confirmPassword && !isSamePassword
                              ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500' 
                              : 'border-red-500/50 focus:border-red-500 focus:ring-red-500')
                            : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
                        } rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm text-slate-100 placeholder-slate-500`}
                      />
                    </div>
                    {passwordForm.confirmPassword !== '' && passwordForm.newPassword !== passwordForm.confirmPassword && (
                        <p className="mt-1 text-sm font-medium text-red-500 flex items-center justify-start">
                          ✗ Las contraseñas no coinciden
                        </p>
                    )}
                    {passwordForm.confirmPassword !== '' && passwordForm.newPassword === passwordForm.confirmPassword && !isSamePassword && (
                        <p className="mt-1 text-sm font-medium text-emerald-500 flex items-center justify-start">
                          ✓ Las contraseñas coinciden
                        </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-800">
                  <Button 
                    type="submit" 
                    className="bg-slate-700 hover:bg-slate-600 text-white border-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      !passwordForm.currentPassword || 
                      !passwordForm.newPassword || 
                      !passwordForm.confirmPassword || 
                      passwordForm.newPassword !== passwordForm.confirmPassword || 
                      isSamePassword
                    }
                  >
                    Actualizar Contraseña
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        );
      })()}

      {(!mustChangePassword && configTab === 'datos_manuales' && userRole === 'ADMIN') && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2 flex items-center">
                <Database className="w-5 h-5 mr-2 text-slate-400" />
                Respaldo y Recuperación (Backups)
              </h3>
            <p className="text-sm text-slate-400">
              Crea copias de seguridad de toda la información del sistema (clientes, consumos, multas, configuración). Guárdalas en un lugar seguro.
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Button type="button" onClick={handleExportBackup} variant="outline" className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10">
                Descargar Copia de Seguridad
              </Button>
              
              <input 
                type="file" 
                ref={backupInputRef} 
                onChange={handleImportBackup} 
                className="hidden" 
                accept=".json" 
              />
              <Button type="button" variant="danger" onClick={() => backupInputRef.current?.click()}>
                Restaurar desde Respaldo
              </Button>
            </div>
            <p className="text-xs text-red-400 mt-2">
              <strong>Atención:</strong> Restaurar una base de datos sobrescribirá toda la información actual y no se podrá deshacer.
            </p>
          </div>
        </CardContent>
      </Card>
      )}

      {(!mustChangePassword && configTab === 'datos_manuales' && userRole === 'ADMIN') && (
        <Card className="border-red-500/30 bg-red-950/10">
          <CardContent className="p-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-red-400 border-b border-red-500/30 pb-2 flex items-center">
                <Trash2 className="w-5 h-5 mr-2 text-red-500" />
                Vaciar y Restablecer Base de Datos (Empezar de Cero)
              </h3>
              <p className="text-sm text-slate-300">
                Elimina permanentemente toda la información de la base de datos (clientes, suministros, consumos, recibos, multas, transacciones, reuniones, trabajadores y comités) para iniciar una nueva instalación completamente limpia.
              </p>
              <div>
                <Button 
                  type="button" 
                  variant="danger" 
                  onClick={handleResetDatabase}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-2 border border-red-500/50 shadow-lg shadow-red-950/50"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  Vaciar Base de Datos (Empezar de Cero)
                </Button>
              </div>
              <p className="text-xs text-red-400/90">
                <strong>Advertencia:</strong> Esta acción no se puede deshacer. Se preservará únicamente el usuario administrador inicial (<code>admin@jass.com</code> / contraseña: <code>admin</code>).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(!mustChangePassword && configTab === 'datos_manuales' && userRole === 'ADMIN') && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleInitCounter} className="space-y-4">
              <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2 flex items-center">
                <Settings className="w-5 h-5 mr-2 text-slate-400" />
                Inicialización Administrativa de Correlativos (Contadores)
              </h3>
              <p className="text-xs text-slate-400">
                Por motivos de seguridad y de integridad histórica, los correlativos secuenciales de recibos y planillas deben inicializarse manualmente para cada período. No se permite la autoinferencia desde la memoria cache.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Tipo de Documento</label>
                  <select
                    value={counterPrefix}
                    onChange={e => setCounterPrefix(e.target.value as any)}
                    className="mt-1 block w-full rounded-md border border-slate-700 bg-[#0B0E14] py-2 px-3 text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="REC">Recibo de Consumo (REC-YYYY-MM)</option>
                    <option value="S">Planilla de Sueldo (S-000000)</option>
                    <option value="VS">Egreso de Caja (VS-000000)</option>
                    <option value="TR">Transacción de Ingreso (TR-000000)</option>
                  </select>
                </div>

                {counterPrefix === 'REC' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300">Periodo (Mes)</label>
                    <input
                      type="month"
                      value={counterSuffix}
                      onChange={e => setCounterSuffix(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-700 bg-[#0B0E14] py-2 px-3 text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300">Número Inicial (Valor de Inicio)</label>
                  <input
                    type="number"
                    min="0"
                    value={counterStart}
                    onChange={e => setCounterStart(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 block w-full rounded-md border border-slate-700 bg-[#0B0E14] py-2 px-3 text-slate-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                    placeholder="Ej. 1000"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isInitializingCounter} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  {isInitializingCounter ? 'Inicializando...' : 'Inicializar Contador en Servidor'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {(!mustChangePassword && configTab === 'datos_manuales') && (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-slate-200 border-b border-slate-700 pb-2 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-slate-400" />
              Manuales de Usuario y Capacitación
            </h3>
            <p className="text-sm text-slate-400">
              {userRole === 'OPERATOR' 
                ? 'Descargue el manual detallado de uso correspondiente a su perfil de operador.'
                : 'Descargue los manuales detallados de uso del sistema según el rol del usuario, incluye descripciones de módulos e imágenes de referencia.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {userRole !== 'OPERATOR' && (
                <>
                  <Button type="button" onClick={() => handleDownloadManual('ADMIN')} variant="outline" className="text-slate-300 border-slate-700 hover:bg-slate-800 flex justify-center">
                    <Download className="w-4 h-4 mr-2" /> Manual Admin
                  </Button>
                  <Button type="button" onClick={() => handleDownloadManual('TESORERO')} variant="outline" className="text-slate-300 border-slate-700 hover:bg-slate-800 flex justify-center">
                    <Download className="w-4 h-4 mr-2" /> Manual Tesorero
                  </Button>
                </>
              )}
              <Button type="button" onClick={() => handleDownloadManual('OPERATOR')} variant="outline" className="text-slate-300 border-slate-700 hover:bg-slate-800 flex justify-center border-blue-500/30 text-blue-300 hover:text-white">
                <Download className="w-4 h-4 mr-2 text-blue-400" /> Manual Operador
              </Button>
              {userRole !== 'OPERATOR' && (
                <Button type="button" onClick={() => handleDownloadManual('FISCALIZADOR')} variant="outline" className="text-slate-300 border-slate-700 hover:bg-slate-800 flex justify-center">
                  <Download className="w-4 h-4 mr-2" /> Manual Fiscalizador
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
