export type ClientType = 'SOCIO' | 'USUARIO';
export type TransactionType = 'INGRESO' | 'EGRESO';
export type IncomeCategory = 'CONSUMO' | 'APORTE' | 'MULTA' | 'RECONEXION' | 'TRANSFERENCIA' | 'PAGO_EXTRAORDINARIO' | 'VENTA_SERVICIO' | 'OTROS';
export type ExpenseCategory = 'MANTENIMIENTO' | 'MATERIALES' | 'SUELDOS' | 'EQUIPOS' | 'ADMINISTRATIVOS' | 'OTROS';
export type AttendanceStatus = 'ASISTIO' | 'FALTA_JUSTIFICADA' | 'FALTA_INJUSTIFICADA';
export type PaymentStatus = 'PENDIENTE' | 'PAGADO';

export interface Client {
  id: string;
  nombres: string;
  apellidos: string;
  tipoPersona?: 'PERSONA' | 'EMPRESA';
  dni: string;
  direccion: string;
  numeroDireccion: string;
  referenciaDireccion: string;
  telefono: string;
  correo: string;
  codigoSuministro?: string;
  suministros?: string[];
  numeroMedidor?: string;
  tipo: ClientType;
  faseSuministro?: 'MONOFASICO' | 'TRIFASICO';
  estado: 'ACTIVO' | 'INACTIVO' | 'CORTADO';
  fechaRegistro: string;
  nombre?: string; // Legacy fallback
  createdBy?: string; // Para trazabilidad/auditoría
}

export interface Consumption {
  id: string;
  clientId: string;
  codigoSuministro?: string;
  fechaLectura: string;
  mes: string; // YYYY-MM
  kwh: number;
  lecturaAnterior?: number;
  lecturaActual?: number;
  montoCalculado: number;
  estadoPago: PaymentStatus;
  observacion?: string;
  createdBy?: string; // Para trazabilidad/auditoría
  reciboNo?: string; // REC-AAAA-MM-NNNN
  evidenciaFoto?: string; // Evidencia fotográfica de la lectura
}

export interface Transaction {
  id: string;
  tipo: TransactionType;
  categoria: IncomeCategory | ExpenseCategory;
  monto: number;
  fecha: string;
  descripcion: string;
  destinatario?: string; // For egresos
  clientId?: string; // If associated with a specific client (e.g. payment, fine)
  codigoSuministro?: string; // The specific supply code associated with this transaction
  createdBy?: string; // Para trazabilidad/auditoría
  conciliado?: boolean; // Para conciliación bancaria/caja
  referencia?: string;
  comprobante?: string;
  metodoPago?: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA';
}

export interface Meeting {
  id: string;
  fecha: string;
  horaTermino?: string;
  motivo: string;
  asistencia: Record<string, AttendanceStatus>; // clientId -> status
  lugar?: string;
  temas?: string;
  acta?: string; // Markdown or plain text for Acta
  invitados?: 'SOCIO' | 'TODOS';
  finalizada?: boolean;
  estado?: 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA';
  createdBy?: string; // Para trazabilidad/auditoría
}

export interface Fine {
  id: string;
  clientId: string;
  meetingId?: string;
  monto: number;
  motivo: string;
  estadoPago: PaymentStatus;
  fecha: string;
  createdBy?: string; // Para trazabilidad/auditoría
}

export interface AppSettings {
  costoSocio: number;
  costoUsuario: number;
  costoTrifasico: number;
  multaReunion: number;
  costoReconexion: number;
  consumoMinimo: number;
  ventaNuevoServicio?: number;
}

export interface AuditLog {
  id: string;
  fecha: string;
  usuario: string; // The email/username of the user who performed the action
  accion: 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'REPORTE' | 'LOGIN' | 'LOGOUT';
  modulo: 'USUARIOS' | 'SOCIOS' | 'CONSUMOS' | 'FINANZAS' | 'REUNIONES' | 'SISTEMA';
  detalles: string;
}

export interface SupplyInfo {
  codigo: string;
  isSocio: boolean;
  fechaSocio?: string;
  direccion?: string;
  sector?: string;
  referenciaDireccion?: string;
}

export interface Trabajador {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string;
  cargo: string;
  sueldoMensual: number;
  telefono?: string;
  correo?: string;
  direccion?: string;
  observaciones?: string;
  estado: 'ACTIVO' | 'INACTIVO';
  fechaRegistro: string;
  createdBy?: string;
}

export interface PagoSueldo {
  id: string;
  trabajadorId: string;
  trabajadorNombreCompleto: string;
  trabajadorDni: string;
  trabajadorCargo: string;
  monto: number;
  mesPagado: string; // Formato YYYY-MM
  fechaPago: string; // ISO String
  createdBy: string;
  comprobante: string;
  observaciones?: string;
}

export interface AppState {
  clients: Client[];
  consumptions: Consumption[];
  transactions: Transaction[];
  meetings: Meeting[];
  admins: any[];
  fines: Fine[];
  settings: AppSettings;
  auditLogs: AuditLog[];
  suppliesInfo: SupplyInfo[];
  comites?: Committee[];
  trabajadores?: Trabajador[];
  pagosSueldos?: PagoSueldo[];
}

export interface CommitteeMember {
  clientId: string; 
  nombreCompleto: string; 
  supplyCodeExonerado?: string; 
}

export interface Committee {
  id: string;
  nombrePeriodo: string; 
  fechaInicio: string; 
  fechaFin: string; 
  presidente: CommitteeMember;
  secretario: CommitteeMember;
  tesorero: CommitteeMember;
  fiscalizador: CommitteeMember;
  vocal?: CommitteeMember;
  activo: boolean; 
  createdBy: string;
  createdAt: string;
}
