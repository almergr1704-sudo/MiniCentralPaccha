import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, Client, Consumption, Transaction, Meeting, ClientType, Fine, AuditLog, Committee, CommitteeMember, Trabajador, PagoSueldo } from './types';
import { normalizeSupplyCode, getExonerationClassification, getMonthFollowing, getMonthOf } from '../lib/utils';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import bcrypt from 'bcryptjs';
import { toast } from 'react-hot-toast';

interface AppContextType extends AppState {
  user: any;
  userRole: string;
  mustChangePassword?: boolean;
  loadingAuth: boolean;
  comites: Committee[];
  trabajadores: Trabajador[];
  pagosSueldos: PagoSueldo[];
  addCommittee: (committee: Omit<Committee, 'id' | 'createdBy' | 'createdAt'>) => Promise<void>;
  updateCommittee: (id: string, updates: Partial<Committee>) => Promise<void>;
  deleteCommittee: (id: string) => Promise<void>;
  toggleCommitteeStatus: (id: string) => Promise<void>;
  addAuditLog: (accion: AuditLog['accion'], modulo: AuditLog['modulo'], detalles: string) => void;
  addClient: (client: Omit<Client, 'id' | 'fechaRegistro'>) => Promise<Client>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;
  transferSupply: (fromClientId: string, toClientId: string, supplyCode: string) => Promise<void>;
  addConsumption: (consumption: Omit<Consumption, 'id' | 'montoCalculado' | 'estadoPago'>) => Promise<void>;
  updateConsumption: (id: string, updates: Partial<Consumption>) => Promise<void>;
  payConsumption: (consumptionId: string) => Promise<void>;
  addFine: (fine: Omit<Fine, 'id' | 'estadoPago' | 'fecha'>) => Promise<void>;
  payFine: (fineId: string) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'fecha'>) => Promise<Transaction>;
  toggleTransactionConciliado: (id: string) => Promise<void>;
  addMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<void>;
  updateMeeting: (id: string, meeting: Partial<Meeting>) => Promise<void>;
  updateSettings: (settings: any) => Promise<void>;
  recordAttendance: (meetingId: string, clientId: string, status: Meeting['asistencia'][string]) => Promise<void>;
  updateAdmin: (id: string, updates: Partial<any>) => Promise<void>;
  addAdmin: (admin: any) => Promise<void>;
  deleteConsumption: (id: string, reason: string) => Promise<void>;
  markSupplyAsSocio: (supplyCode: string) => Promise<void>;
  setSupplySocioStatus: (supplyCode: string, isSocio: boolean, addressInfo?: { direccion?: string; sector?: string; referenciaDireccion?: string }) => Promise<void>;
  login: (email: string) => void;
  logout: () => void;
  addTrabajador: (trabajador: Omit<Trabajador, 'id' | 'fechaRegistro'>) => Promise<void>;
  updateTrabajador: (id: string, updates: Partial<Trabajador>) => Promise<void>;
  addPagoSueldo: (pago: Omit<PagoSueldo, 'id' | 'fechaPago' | 'comprobante' | 'createdBy'>) => Promise<PagoSueldo>;
  initializeCounter: (counterId: string, startValue: number) => Promise<void>;
  seedDatabaseFromBackup: (backupData: any) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialData: AppState = {
  clients: [],
  consumptions: [],
  transactions: [],
  meetings: [],
  admins: [],
  fines: [],
  auditLogs: [],
  suppliesInfo: [],
  comites: [],
  trabajadores: [],
  pagosSueldos: [],
  settings: {
    costoSocio: 0.20,
    costoUsuario: 0.30,
    costoTrifasico: 0.00,
    multaReunion: 40,
    costoReconexion: 0.00,
    consumoMinimo: 6.00
  }
};

const getLocalLegacyData = (): AppState => {
  const data = localStorage.getItem('erp_data');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      return {
        clients: parsed.clients || initialData.clients,
        consumptions: parsed.consumptions || initialData.consumptions,
        transactions: parsed.transactions || initialData.transactions,
        meetings: parsed.meetings || initialData.meetings,
        admins: parsed.admins || initialData.admins,
        fines: parsed.fines || initialData.fines,
        auditLogs: parsed.auditLogs || initialData.auditLogs,
        suppliesInfo: parsed.suppliesInfo || initialData.suppliesInfo,
        settings: { ...initialData.settings, ...(parsed.settings || {}) },
        comites: parsed.comites || [],
        trabajadores: parsed.trabajadores || [],
        pagosSueldos: parsed.pagosSueldos || [],
      };
    } catch (e) {
      console.error('Failed to parse local data', e);
    }
  }
  return initialData;
};

const setLocalData = (data: AppState) => {
  localStorage.setItem('erp_data', JSON.stringify(data));
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const isInitialRef = useRef<Record<string, boolean>>({});

  const [state, setState] = useState<AppState>(() => {
    const data = getLocalLegacyData();
    // Default admin backup
    const hasAdmin = data.admins.find((a: any) => a.email === 'admin@paccha.local');
    if (!hasAdmin) {
      data.admins.push({
        id: 'admin_default',
        email: 'admin@paccha.local',
        username: 'admin',
        password: 'ALANgaona2010@',
        role: 'ADMIN',
        nombres: 'Super',
        apellidos: 'Admin',
        mustChangePassword: true,
        estado: 'ACTIVO'
      });
      setLocalData(data);
    }
    return data;
  });

  const adminProfile = state.admins.find(a => a.email === user?.email || a.username === user?.email);
  const userRole = adminProfile?.role || 'ADMIN';
  const mustChangePassword = adminProfile?.mustChangePassword || false;

  useEffect(() => {
    const savedUser = localStorage.getItem('erp_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoadingAuth(false);
  }, []);

  // Connect to Firestore and Subscribe in Real-Time
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    const subCollection = <T extends { id: string }>(
      colName: string, 
      stateKey: keyof AppState,
      label: string,
      getName?: (item: T) => string
    ) => {
      isInitialRef.current[colName] = true;
      
      const unsub = onSnapshot(collection(db, colName), (snapshot) => {
        // Seeding of default admin if empty
        if (snapshot.empty && colName === 'admins') {
          const defaultAdmin = {
            id: 'admin_default',
            email: 'admin@paccha.local',
            username: 'admin',
            password: '$2a$10$uV28KID0yL9jXpIuCj6VseZlOen5O5/9U9fR4n9G476I2v27iIbe6', // bcrypt of ALANgaona2010@
            role: 'ADMIN',
            nombres: 'Super',
            apellidos: 'Admin',
            mustChangePassword: true,
            estado: 'ACTIVO'
          };
          setDoc(doc(db, colName, defaultAdmin.id), defaultAdmin);
          return;
        }

        const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any));

        // Automatic one-time migration and admin reconfiguration for the system
        if (colName === 'admins') {
          const defaultAdminInDb = items.find((a: any) => a.id === 'admin_default' || a.username === 'admin');
          if (defaultAdminInDb) {
            let needsUpdate = false;
            try {
              const isCorrectPassword = defaultAdminInDb.password && bcrypt.compareSync('ALANgaona2010@', defaultAdminInDb.password);
              if (!isCorrectPassword) {
                needsUpdate = true;
              }
            } catch (e) {
              needsUpdate = true;
            }

            if (needsUpdate) {
              try {
                const correctHash = bcrypt.hashSync('ALANgaona2010@', 10);
                setDoc(doc(db, 'admins', defaultAdminInDb.id), {
                  ...defaultAdminInDb,
                  password: correctHash,
                  username: 'admin',
                  estado: 'ACTIVO'
                });
                console.log('Reconfigurado usuario admin con contraseña ALANgaona2010@ en Firestore.');
              } catch (err) {
                console.error('Error al reconfigurar contraseña admin:', err);
              }
            }
          }

          // Legacy plain text passwords conversion to bcrypt for all other admin accounts
          items.forEach((admin: any) => {
            if (admin.id === 'admin_default' || admin.username === 'admin') return;
            const isHashed = admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$') || admin.password.startsWith('$2y$'));
            if (admin.password && !isHashed) {
              try {
                const hashedPassword = bcrypt.hashSync(admin.password, 10);
                setDoc(doc(db, 'admins', admin.id), {
                  ...admin,
                  password: hashedPassword
                });
                console.log(`Migrada contraseña de administrador ${admin.username || admin.email} a bcrypt.`);
              } catch (err) {
                console.error(`Error migrando contraseña para administrador ${admin.id}:`, err);
              }
            }
          });
        }
        
        // Notify user about real-time concurrency modifications by other operators
        if (!isInitialRef.current[colName]) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
              const data = { id: change.doc.id, ...change.doc.data() } as T;
              const updatedBy = (data as any).updatedBy || (data as any).createdBy || 'otro operador';
              if (updatedBy !== user?.email) {
                const nameStr = getName ? getName(data) : change.doc.id;
                toast.success(`[Sincronización] El/la "${nameStr}" en ${label} ha sido actualizado/a en tiempo real por ${updatedBy}.`, { id: change.doc.id });
              }
            } else if (change.type === 'added') {
              const data = { id: change.doc.id, ...change.doc.data() } as T;
              const createdBy = (data as any).createdBy || 'otro operador';
              if (createdBy !== user?.email) {
                const nameStr = getName ? getName(data) : change.doc.id;
                toast.success(`[Sincronización] Se registró "${nameStr}" en ${label} por ${createdBy}.`, { id: change.doc.id });
              }
            } else if (change.type === 'removed') {
              toast.error(`[Sincronización] El registro "${change.doc.id}" ha sido eliminado/a de ${label} por otro operador.`, { id: change.doc.id + '-del' });
            }
          });
        }
        
        isInitialRef.current[colName] = false;

        setState(prev => {
          const newState = { ...prev, [stateKey]: items };
          setLocalData(newState);
          return newState;
        });
      }, (error) => {
        console.error(`Error subscribing to ${colName}:`, error);
      });

      unsubscribes.push(unsub);
    };

    subCollection<Client>('clients', 'clients', 'Socios/Usuarios', (c) => `${c.nombres} ${c.apellidos}`);
    subCollection<Consumption>('consumptions', 'consumptions', 'Ficha de Lectura', (c) => c.reciboNo || c.id);
    subCollection<Transaction>('transactions', 'transactions', 'Registro Contable', (t) => t.comprobante || `S/ ${t.monto} - ${t.categoria}`);
    subCollection<Meeting>('meetings', 'meetings', 'Convocatorias', (m) => m.motivo);
    subCollection<Fine>('fines', 'fines', 'Cobro de Multas', (f) => `${f.motivo} (S/ ${f.monto})`);
    subCollection<any>('admins', 'admins', 'Cuentas de Usuarios', (a) => a.username || a.email);
    subCollection<AuditLog>('auditLogs', 'auditLogs', 'Trazas de Auditoría', (x) => `${x.accion} - ${x.modulo}`);
    subCollection<any>('suppliesInfo', 'suppliesInfo', 'Categoría de Suministros', (s) => s.codigo);
    subCollection<Committee>('comites', 'comites', 'Comité Directivo', (c) => c.nombrePeriodo);
    subCollection<Trabajador>('trabajadores', 'trabajadores', 'Trabajador de Planta', (t) => `${t.nombres} ${t.apellidos}`);
    subCollection<PagoSueldo>('pagosSueldos', 'pagosSueldos', 'Boleta de Remuneración', (p) => p.comprobante || p.trabajadorNombreCompleto);

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setState(prev => {
          const newState = { ...prev, settings: docSnap.data() as AppState['settings'] };
          setLocalData(newState);
          return newState;
        });
      } else {
        const local = getLocalLegacyData();
        const s = local.settings || initialData.settings;
        setDoc(doc(db, 'settings', 'global'), s);
      }
    });
    unsubscribes.push(unsubSettings);

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user?.email]);

  const addAuditLog = (accion: AuditLog['accion'], modulo: AuditLog['modulo'], detalles: string) => {
    const newLogId = `AL${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const newLog: AuditLog = {
      id: newLogId,
      fecha: new Date().toISOString(),
      usuario: user?.email || 'Sistema',
      accion,
      modulo,
      detalles
    };
    setDoc(doc(db, 'auditLogs', newLogId), newLog);
  };

  const login = (email: string) => {
    const newUser = { email, uid: 'local_uid' };
    setUser(newUser);
    localStorage.setItem('erp_user', JSON.stringify(newUser));
    setTimeout(() => {
      addAuditLog('LOGIN', 'SISTEMA', `Inicio de sesión de ${email}`);
    }, 100);
  };

  const logout = () => {
    addAuditLog('LOGOUT', 'SISTEMA', `Cierra sesión ${user?.email || ''}`);
    setUser(null);
    localStorage.removeItem('erp_user');
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const cleanUndefinedKeys = <T extends object>(obj: T): T => {
    const newObj = { ...obj } as any;
    Object.keys(newObj).forEach((key) => {
      if (newObj[key] === undefined) {
        delete newObj[key];
      }
    });
    return newObj;
  };

  // Atomic transactions sequential database sequences
  const getNextSequenceNumber = async (prefix: string, keySuffix?: string): Promise<string> => {
    const counterId = keySuffix ? `${prefix}-${keySuffix}` : prefix;
    const docRef = doc(db, 'counters', counterId);

    return runTransaction(db, async (txn) => {
      const docSnap = await txn.get(docRef);
      let currentCount = 0;
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && typeof data.currentCount === 'number') {
          currentCount = data.currentCount;
        }
      }
      const nextNum = currentCount + 1;
      txn.set(docRef, { currentCount: nextNum });
      
      if (prefix === 'REC') {
        return `REC-${keySuffix}-${nextNum.toString().padStart(4, '0')}`;
      } else {
        return `${prefix}-${nextNum.toString().padStart(6, '0')}`;
      }
    });
  };

  const initializeCounter = async (counterId: string, startValue: number) => {
    const docRef = doc(db, 'counters', counterId);
    await setDoc(docRef, { currentCount: startValue });
    addAuditLog('CREAR', 'SISTEMA', `Inicializó correlativo ${counterId} con valor de inicio ${startValue}`);
  };

  const seedDatabaseFromBackup = async (backupData: any) => {
    const collectionsToSeed = [
      { key: 'clients', col: 'clients' },
      { key: 'consumptions', col: 'consumptions' },
      { key: 'transactions', col: 'transactions' },
      { key: 'meetings', col: 'meetings' },
      { key: 'fines', col: 'fines' },
      { key: 'admins', col: 'admins' },
      { key: 'auditLogs', col: 'auditLogs' },
      { key: 'suppliesInfo', col: 'suppliesInfo' },
      { key: 'comites', col: 'comites' },
      { key: 'trabajadores', col: 'trabajadores' },
      { key: 'pagosSueldos', col: 'pagosSueldos' }
    ];

    for (const { key, col } of collectionsToSeed) {
      const items = backupData[key] || [];
      for (const item of items) {
        if (item.id) {
          if (key === 'admins' && item.password) {
            const isHashed = item.password.startsWith('$2a$') || item.password.startsWith('$2b$') || item.password.startsWith('$2y$');
            if (!isHashed) {
              item.password = bcrypt.hashSync(item.password, 10);
            }
          }
          await setDoc(doc(db, col, item.id), item);
        }
      }
    }

    if (backupData.settings) {
      await setDoc(doc(db, 'settings', 'global'), backupData.settings);
    }
    
    const counters = backupData.counters || {};
    for (const counterId of Object.keys(counters)) {
      await setDoc(doc(db, 'counters', counterId), { currentCount: counters[counterId] });
    }

    addAuditLog('CREAR', 'SISTEMA', 'Sembrado y aprovisionamiento manual de base de datos desde respaldo');
  };

  const updateAdmin = async (id: string, updates: Partial<any>) => {
    if (updates.dni) {
      const existing = state.admins.find(a => a.dni === updates.dni && a.id !== id);
      if (existing) {
        throw new Error('El DNI ingresado ya se encuentra registrado en otro usuario.');
      }
    }
    if (updates.username) {
      const uClean = updates.username.trim().toLowerCase();
      const existing = state.admins.find(a => (a.username || '').trim().toLowerCase() === uClean && a.id !== id);
      if (existing) {
        throw new Error(`El nombre de usuario "${updates.username}" ya se encuentra registrado por otro usuario.`);
      }
    }
    if (updates.email) {
      const eClean = updates.email.trim().toLowerCase();
      const existing = state.admins.find(a => (a.email || '').trim().toLowerCase() === eClean && a.id !== id);
      if (existing) {
        throw new Error(`El correo electrónico "${updates.email}" ya se encuentra registrado por otro usuario.`);
      }
    }

    const adminDoc = doc(db, 'admins', id);
    await updateDoc(adminDoc, {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'Unknown'
    });
    addAuditLog('ACTUALIZAR', 'USUARIOS', `Actualizó usuario administrativo ${id}`);
  };

  const addAdmin = async (admin: any) => {
    if (!admin.dni || !/^\d{8}$/.test(admin.dni)) {
      throw new Error('El DNI debe tener exactamente 8 dígitos numéricos.');
    }
    const existingDni = state.admins.find(a => a.dni === admin.dni);
    if (existingDni) {
      throw new Error('El DNI ya se encuentra registrado en el sistema.');
    }

    if (admin.username) {
      const uClean = admin.username.trim().toLowerCase();
      const existingUsername = state.admins.find(a => (a.username || '').trim().toLowerCase() === uClean);
      if (existingUsername) {
        throw new Error(`El nombre de usuario "${admin.username}" ya se encuentra registrado.`);
      }
    }

    if (admin.email) {
      const eClean = admin.email.trim().toLowerCase();
      const existingEmail = state.admins.find(a => (a.email || '').trim().toLowerCase() === eClean);
      if (existingEmail) {
        throw new Error(`El correo electrónico "${admin.email}" ya se encuentra registrado.`);
      }
    }

    const newId = `admin_${generateId()}`;
    const newAdmin = {
      ...admin,
      id: newId,
      estado: 'ACTIVO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user?.email || 'Unknown',
      updatedBy: user?.email || 'Unknown',
    };
    
    await setDoc(doc(db, 'admins', newId), newAdmin);
    addAuditLog('CREAR', 'USUARIOS', `Creó usuario administrativo ${admin.email || admin.username}`);
  };

  const markSupplyAsSocio = async (supplyCode: string) => {
    if (state.suppliesInfo.some(s => s.codigo === supplyCode && s.isSocio)) return;
    const newSocioInfo = {
      codigo: supplyCode,
      isSocio: true,
      fechaSocio: new Date().toISOString()
    };
    await setDoc(doc(db, 'suppliesInfo', supplyCode), newSocioInfo);
    addAuditLog('ACTUALIZAR', 'SOCIOS', `Asignó condición de SOCIO permanente al suministro ${supplyCode}`);
  };

  const setSupplySocioStatus = async (
    supplyCode: string, 
    isSocio: boolean, 
    addressInfo?: { direccion?: string; sector?: string; referenciaDireccion?: string }
  ) => {
    const existing = state.suppliesInfo.find(s => s.codigo === supplyCode);
    const hasSocioDiff = existing ? existing.isSocio !== isSocio : true;
    const hasAddressDiff = addressInfo ? (
      existing?.direccion !== addressInfo.direccion ||
      existing?.sector !== addressInfo.sector ||
      existing?.referenciaDireccion !== addressInfo.referenciaDireccion
    ) : false;

    if (!hasSocioDiff && !hasAddressDiff && existing) return;

    const newSocioInfo = {
      codigo: supplyCode,
      isSocio,
      fechaSocio: isSocio ? (existing?.fechaSocio || new Date().toISOString()) : undefined,
      direccion: addressInfo?.direccion ?? existing?.direccion ?? '',
      sector: addressInfo?.sector ?? existing?.sector ?? '',
      referenciaDireccion: addressInfo?.referenciaDireccion ?? existing?.referenciaDireccion ?? ''
    };
    await setDoc(doc(db, 'suppliesInfo', supplyCode), cleanUndefinedKeys(newSocioInfo));
    addAuditLog('ACTUALIZAR', 'SOCIOS', `Definió condición de ${isSocio ? 'SOCIO' : 'USUARIO'} y dirección al suministro ${supplyCode}`);
  };

  const addClient = async (client: Omit<Client, 'id' | 'fechaRegistro'>): Promise<Client> => {
    if (client.dni && client.dni.trim() !== '') {
      const existing = state.clients.find(c => c.dni === client.dni.trim());
      if (existing) {
        throw new Error(`El DNI/RUC ${client.dni} ya se encuentra registrado.`);
      }
    }

    const rawSupplies = client.suministros?.length ? client.suministros : [client.codigoSuministro].filter(Boolean);
    const suppliesToCheck = (rawSupplies as string[]).map(normalizeSupplyCode).filter(Boolean);
    for (const sup of suppliesToCheck) {
      if (!sup) continue;
      for (const c of state.clients) {
        const cSupplies = (c.suministros?.length ? c.suministros : [c.codigoSuministro].filter(Boolean)).map(s => normalizeSupplyCode(s as string));
        if (cSupplies.includes(sup)) {
          throw new Error(`El suministro ${sup} ya se encuentra registrado.`);
        }
      }
    }
    if (client.numeroMedidor) {
     for (const c of state.clients) {
       if (c.numeroMedidor === client.numeroMedidor) {
          throw new Error(`El número de medidor ${client.numeroMedidor} ya se encuentra asignado a otro cliente.`);
       }
     }
    }

    const newId = generateId();
    const newClient: Client = {
      ...client,
      codigoSuministro: client.codigoSuministro ? normalizeSupplyCode(client.codigoSuministro) : undefined,
      suministros: client.suministros?.map(normalizeSupplyCode),
      id: newId,
      fechaRegistro: new Date().toISOString(),
      createdBy: user?.email || 'Unknown'
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'clients', newId), cleanUndefinedKeys(newClient));

    const suppliesToMark = client.suministros?.length ? client.suministros : [client.codigoSuministro].filter(Boolean);
    suppliesToMark.forEach(sup => {
      if (!sup) return;
      const normalizedSup = normalizeSupplyCode(sup);
      const isSocio = client.tipo === 'SOCIO';
      const item = {
        codigo: normalizedSup,
        isSocio,
        fechaSocio: isSocio ? new Date().toISOString() : undefined,
        direccion: client.direccion || '',
        referenciaDireccion: client.referenciaDireccion || '',
        sector: ''
      };
      batch.set(doc(db, 'suppliesInfo', normalizedSup), cleanUndefinedKeys(item));
    });

    await batch.commit();
    addAuditLog('CREAR', 'SOCIOS', `Creó socio/usuario: ${client.dni}`);
    return newClient;
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    if (updates.dni && updates.dni.trim() !== '') {
      const existing = state.clients.find(c => c.dni === updates.dni!.trim() && c.id !== id);
      if (existing) {
        throw new Error(`El DNI/RUC ${updates.dni} ya se encuentra registrado.`);
      }
    }

    if (updates.suministros || updates.codigoSuministro) {
       const clientBeingUpdated = state.clients.find(c => c.id === id);
       const rawSupplies = updates.suministros?.length ? updates.suministros : (updates.codigoSuministro ? [updates.codigoSuministro] : (clientBeingUpdated?.suministros || [clientBeingUpdated?.codigoSuministro]).filter(Boolean));
       const suppliesToCheck = (rawSupplies as string[]).map(normalizeSupplyCode).filter(Boolean);
       for (const sup of suppliesToCheck) {
         if (!sup) continue;
         for (const c of state.clients) {
           if (c.id === id) continue;
           const cSupplies = (c.suministros?.length ? c.suministros : [c.codigoSuministro].filter(Boolean)).map(s => normalizeSupplyCode(s as string));
           if (cSupplies.includes(sup)) {
             throw new Error(`El suministro ${sup} ya se encuentra registrado.`);
           }
         }
       }
    }
    if (updates.numeroMedidor) {
       for (const c of state.clients) {
         if (c.id === id) continue;
         if (c.numeroMedidor === updates.numeroMedidor) {
            throw new Error(`El número de medidor ${updates.numeroMedidor} ya se encuentra asignado a otro cliente.`);
         }
       }
    }

    if (updates.codigoSuministro !== undefined) {
       updates.codigoSuministro = updates.codigoSuministro ? normalizeSupplyCode(updates.codigoSuministro) : '';
    }
    if (updates.suministros !== undefined) {
       updates.suministros = updates.suministros.map(s => normalizeSupplyCode(s));
    }

    const clientDoc = doc(db, 'clients', id);
    await updateDoc(clientDoc, cleanUndefinedKeys({
      ...updates,
      updatedBy: user?.email || 'Unknown'
    }));
    addAuditLog('ACTUALIZAR', 'SOCIOS', `Actualizó socio/usuario: ${id}`);
  };

  const transferSupply = async (fromClientId: string, toClientId: string, supplyCodeRaw: string) => {
    const supplyCode = normalizeSupplyCode(supplyCodeRaw);
    const fromClient = state.clients.find(c => c.id === fromClientId);
    const toClient = state.clients.find(c => c.id === toClientId);
    
    if (!fromClient || !toClient) return;

    const toName = toClient.nombre || `${toClient.nombres || ''} ${toClient.apellidos || ''}`;
    
    const fromSums = fromClient.suministros || [];
    const newFromSums = fromSums.filter(s => normalizeSupplyCode(s) !== supplyCode);
    const oldFromCodigoNorm = normalizeSupplyCode(fromClient.codigoSuministro || '');
    const newFromCodigo = oldFromCodigoNorm === supplyCode && newFromSums.length === 0 ? '' : (oldFromCodigoNorm === supplyCode ? newFromSums[0] : fromClient.codigoSuministro);

    const toSums = toClient.suministros || [];
    const newToSums = toSums.map(s => normalizeSupplyCode(s)).includes(supplyCode) ? toSums : [...toSums, supplyCode];
    const newToCod = toClient.codigoSuministro ? toClient.codigoSuministro : supplyCode;

    const batch = writeBatch(db);
    batch.update(doc(db, 'clients', fromClientId), { 
      suministros: newFromSums, 
      codigoSuministro: newFromCodigo,
      updatedBy: user?.email || 'Unknown'
    });
    batch.update(doc(db, 'clients', toClientId), { 
      suministros: newToSums, 
      codigoSuministro: newToCod,
      updatedBy: user?.email || 'Unknown'
    });

    const relatedConsumptions = state.consumptions.filter(c => c.clientId === fromClientId && normalizeSupplyCode(c.codigoSuministro) === supplyCode);
    relatedConsumptions.forEach(c => {
      batch.update(doc(db, 'consumptions', c.id), { 
        clientId: toClientId,
        updatedBy: user?.email || 'Unknown'
      });
    });

    await batch.commit();
    addAuditLog('ACTUALIZAR', 'SOCIOS', `Transfirió suministro ${supplyCode} a ${toName}`);
  };

  const addConsumption = async (consumption: Omit<Consumption, 'id' | 'montoCalculado' | 'estadoPago'>) => {
    const client = state.clients.find(c => c.id === consumption.clientId);
    if (!client) return;

    // Check if there is already a reading in a later period
    const hasLaterReading = state.consumptions.some(
      c => c.codigoSuministro === consumption.codigoSuministro && c.mes > consumption.mes
    );
    if (hasLaterReading) {
      throw new Error(`No es posible registrar la lectura porque ya existen períodos posteriores registrados para este suministro.`);
    }

    // Check chronological order
    if (consumption.lecturaAnterior !== undefined && consumption.lecturaActual !== undefined && consumption.lecturaActual < consumption.lecturaAnterior) {
      throw new Error(`La secuencia cronológica de lecturas no permite que la lectura actual (${consumption.lecturaActual}) sea menor que la anterior (${consumption.lecturaAnterior}).`);
    }

    // Check if this supply is currently exonerated by a committee
    const exonerationClass = getExonerationClassification(state.comites, consumption.codigoSuministro, consumption.mes);
    const isExonerated = exonerationClass === 'EXONERATED';

    const settings = state.settings || initialData.settings;
    const isSocio = state.suppliesInfo.find(s => s.codigo === consumption.codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
    const tarifa = client.faseSuministro === 'TRIFASICO' && settings.costoTrifasico > 0 
      ? settings.costoTrifasico 
      : isSocio ? settings.costoSocio : settings.costoUsuario;
      
    const minimoAplica = settings.consumoMinimo !== undefined ? settings.consumoMinimo : 6;
    let montoCalculado = isExonerated ? 0 : (consumption.kwh || 0) * tarifa;
    if (!isExonerated && montoCalculado < minimoAplica) {
       montoCalculado = minimoAplica;
    }

    const [year, month] = consumption.mes.split('-');
    
    // Server-authoritative sequential generation
    const finalReciboNo = await getNextSequenceNumber('REC', `${year}-${month}`);

    const newId = generateId();
    const newConsumption: Consumption = {
      ...consumption,
      id: newId,
      kwh: consumption.kwh || 0,
      reciboNo: finalReciboNo,
      montoCalculado,
      estadoPago: 'PENDIENTE',
      createdBy: user?.email || 'Unknown',
      observacion: isExonerated 
        ? `EXONERADO (Miembro Comité Directivo). ${consumption.observacion || ''}`.trim()
        : consumption.observacion
    };
    
    await setDoc(doc(db, 'consumptions', newId), cleanUndefinedKeys(newConsumption));
    addAuditLog('CREAR', 'CONSUMOS', `Registró lectura para suministro ${consumption.codigoSuministro}. Recibo #${finalReciboNo}`);
  };

  const updateConsumption = async (id: string, updates: Partial<Consumption>) => {
    const cons = state.consumptions.find(c => c.id === id);
    if (!cons) {
      throw new Error("Lectura de consumo no encontrada.");
    }
    if (cons.estadoPago !== 'PENDIENTE') {
      throw new Error("No se puede editar una lectura que ya fue pagada.");
    }

    // Check if there is already a reading in a later period
    const hasNewer = state.consumptions.some(
      c => c.codigoSuministro === cons.codigoSuministro && c.mes > cons.mes
    );
    if (hasNewer) {
      throw new Error("No es posible editar esta lectura porque existen períodos posteriores registrados para este suministro. Para modificar esta lectura, primero deben corregirse o eliminarse los períodos posteriores según las políticas establecidas.");
    }

    // Check chronological order
    const lecturaAnterior = updates.lecturaAnterior !== undefined ? updates.lecturaAnterior : cons.lecturaAnterior;
    const lecturaActual = updates.lecturaActual !== undefined ? updates.lecturaActual : cons.lecturaActual;
    if (lecturaAnterior !== undefined && lecturaActual !== undefined && lecturaActual < lecturaAnterior) {
      throw new Error(`La secuencia cronológica de lecturas no permite que la lectura actual (${lecturaActual}) sea menor que la anterior (${lecturaAnterior}).`);
    }

    let finalUpdates = { ...updates };
    if (updates.kwh !== undefined || updates.lecturaActual !== undefined) {
      const client = state.clients.find(c => c.id === cons.clientId);
      if (client) {
        const isSocio = state.suppliesInfo.find(s => s.codigo === cons.codigoSuministro)?.isSocio ?? (client.tipo === 'SOCIO');
        const settings = state.settings || initialData.settings;
        const tarifa = client.faseSuministro === 'TRIFASICO' && settings.costoTrifasico > 0 
          ? settings.costoTrifasico 
          : isSocio ? settings.costoSocio : settings.costoUsuario;
          
        const minimoAplica = settings.consumoMinimo !== undefined ? settings.consumoMinimo : 6;
        const kwh = updates.kwh !== undefined ? updates.kwh : cons.kwh;
        const exonerationClass = getExonerationClassification(state.comites, cons.codigoSuministro, cons.mes);
        const isExonerated = exonerationClass === 'EXONERATED';
        let montoCalculado = isExonerated ? 0 : (kwh || 0) * tarifa;
        if (!isExonerated && montoCalculado < minimoAplica) {
          montoCalculado = minimoAplica;
        }
        finalUpdates.montoCalculado = montoCalculado;
      }
    }

    await updateDoc(doc(db, 'consumptions', id), cleanUndefinedKeys({
      ...finalUpdates,
      updatedBy: user?.email || 'Unknown'
    }));

    // Generate extremely detailed audit log for the authorized change
    const oldLectura = cons.lecturaActual;
    const newLectura = updates.lecturaActual !== undefined ? updates.lecturaActual : cons.lecturaActual;
    const motivo = updates.observacion || 'No especificado';
    const emailStr = user?.email || 'Desconocido';
    const fechaHora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

    addAuditLog('ACTUALIZAR', 'CONSUMOS', 
      `Modificación autorizada de lectura para Suministro ${cons.codigoSuministro} (Periodo ${cons.mes}). ` +
      `Usuario: ${emailStr} | Fecha/Hora: ${fechaHora} | ` +
      `Lectura anterior registrada: ${oldLectura} | Nueva lectura ingresada: ${newLectura} | ` +
      `Motivo de la modificación: ${motivo}`
    );
  };

  const payConsumption = async (consumptionId: string) => {
    const consumption = state.consumptions.find(c => c.id === consumptionId);
    if (!consumption) return;

    await updateDoc(doc(db, 'consumptions', consumptionId), { 
      estadoPago: 'PAGADO',
      updatedBy: user?.email || 'Unknown' 
    });

    await addTransaction({
      tipo: 'INGRESO',
      categoria: 'CONSUMO',
      monto: consumption.montoCalculado,
      descripcion: `Pago Consumo ${consumption.mes}`,
      clientId: consumption.clientId,
      codigoSuministro: consumption.codigoSuministro,
    });
    addAuditLog('ACTUALIZAR', 'CONSUMOS', `Pagó recibo de ${consumption.montoCalculado} para suministro ${consumption.codigoSuministro}`);
  };

  const deleteConsumption = async (id: string, reason: string) => {
    const consumption = state.consumptions.find(c => c.id === id);
    if (!consumption) return;
    
    await deleteDoc(doc(db, 'consumptions', id));
    addAuditLog('ELIMINAR', 'CONSUMOS', `Eliminó recibo ${id}. Motivo: ${reason}`);
  };

  const addFine = async (fine: Omit<Fine, 'id' | 'estadoPago' | 'fecha'>) => {
    const newId = generateId();
    const newFine: Fine = {
      ...fine,
      id: newId,
      estadoPago: 'PENDIENTE',
      fecha: new Date().toISOString(),
      createdBy: user?.email || 'Unknown'
    };
    await setDoc(doc(db, 'fines', newId), newFine);
    addAuditLog('CREAR', 'FINANZAS', `Registró multa a favor de cliente ID: ${fine.clientId}`);
  };

  const payFine = async (fineId: string) => {
    const fine = state.fines?.find(f => f.id === fineId);
    if (!fine) return;

    await updateDoc(doc(db, 'fines', fineId), { 
      estadoPago: 'PAGADO',
      updatedBy: user?.email || 'Unknown' 
    });

    await addTransaction({
      tipo: 'INGRESO',
      categoria: 'MULTA',
      monto: fine.monto,
      descripcion: `Pago Multa - ${fine.motivo}`,
      clientId: fine.clientId,
    });
  };

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'fecha'>): Promise<Transaction> => {
    let finalComprobante = transaction.comprobante;

    if (!finalComprobante || finalComprobante.trim() === '' || finalComprobante.includes('-173') || finalComprobante.startsWith('VS-') || finalComprobante.startsWith('TR-')) {
      // Generate transaction counters atomically on the server
      if (transaction.categoria === 'VENTA_SERVICIO') {
        finalComprobante = await getNextSequenceNumber('VS');
      } else if (transaction.categoria === 'TRANSFERENCIA') {
        finalComprobante = await getNextSequenceNumber('TR');
      } else {
        const prefix = transaction.tipo === 'INGRESO' ? 'INC' : 'EXP';
        finalComprobante = await getNextSequenceNumber(prefix);
      }
    } else {
      if (transaction.comprobante && transaction.comprobante.trim() !== '') {
        const exists = state.transactions.some(
          t => t.comprobante?.trim().toLowerCase() === transaction.comprobante!.trim().toLowerCase()
        );
        if (exists) {
          throw new Error(`El comprobante correlativo "${transaction.comprobante}" ya se encuentra registrado.`);
        }
      }
    }

    const newId = generateId();
    const newTx: Transaction = {
      ...transaction,
      id: newId,
      comprobante: finalComprobante,
      fecha: new Date().toISOString(),
      createdBy: user?.email || 'Unknown'
    };
    await setDoc(doc(db, 'transactions', newId), newTx);
    addAuditLog('CREAR', 'FINANZAS', `Registró ${transaction.tipo} por S/ ${transaction.monto} - ${transaction.categoria}. Comprobante #${finalComprobante}`);
    return newTx;
  };

  const toggleTransactionConciliado = async (id: string) => {
    const existing = state.transactions.find(t => t.id === id);
    if (!existing) return;
    await updateDoc(doc(db, 'transactions', id), { 
      conciliado: !existing.conciliado,
      updatedBy: user?.email || 'Unknown' 
    });
    addAuditLog('ACTUALIZAR', 'FINANZAS', `Alternó conciliación de transacción ${id}`);
  };

  const addMeeting = async (meeting: Omit<Meeting, 'id'>) => {
    if (meeting.fecha) {
      const exists = state.meetings.some(m => m.fecha === meeting.fecha);
      if (exists) {
        throw new Error(`Ya existe una reunión o asamblea programada para la fecha y hora seleccionada.`);
      }
    }

    const newId = generateId();
    const newMeeting: Meeting = {
      ...meeting,
      id: newId,
      createdBy: user?.email || 'Unknown'
    };
    await setDoc(doc(db, 'meetings', newId), newMeeting);
    addAuditLog('CREAR', 'REUNIONES', `Programó reunión para ${meeting.fecha.split('T')[0]}`);
  };

  const updateMeeting = async (id: string, meetingInfo: Partial<Meeting>) => {
    await updateDoc(doc(db, 'meetings', id), {
      ...meetingInfo,
      updatedBy: user?.email || 'Unknown'
    });
    addAuditLog('ACTUALIZAR', 'REUNIONES', `Actualizó reunión ${id}`);
  };

  const recordAttendance = async (meetingId: string, clientId: string, status: Meeting['asistencia'][string]) => {
    const meeting = state.meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const newAsistencia = { ...(meeting.asistencia || {}), [clientId]: status };
    
    const batch = writeBatch(db);
    batch.update(doc(db, 'meetings', meetingId), { 
      asistencia: newAsistencia,
      updatedBy: user?.email || 'Unknown' 
    });
    
    if (status === 'FALTA_INJUSTIFICADA') {
      const existingFine = state.fines?.find(f => f.clientId === clientId && f.meetingId === meetingId);
      if (!existingFine) {
        const fineId = generateId();
        const nFine: Fine = {
          id: fineId,
          clientId,
          meetingId,
          monto: state.settings?.multaReunion || 40,
          motivo: `Falta a reunión ${new Date(meeting.fecha).toLocaleDateString()}`,
          estadoPago: 'PENDIENTE',
          fecha: new Date().toISOString(),
          createdBy: 'SISTEMA_ASISTENCIA'
        };
        batch.set(doc(db, 'fines', fineId), nFine);
      }
    } else {
      const pendingFines = (state.fines || []).filter(f => f.clientId === clientId && f.meetingId === meetingId && f.estadoPago === 'PENDIENTE');
      pendingFines.forEach(f => {
        batch.delete(doc(db, 'fines', f.id));
      });
    }

    await batch.commit();
  };

  const syncCommitteeAdmins = (stateData: AppState, comite: Committee, oldActiveComite?: Committee) => {
    let updatedAdmins = [...stateData.admins];

    const syncMember = (member: CommitteeMember | undefined, role: string) => {
      if (!member || !member.clientId) return;
      const client = stateData.clients.find(c => c.id === member.clientId);
      if (!client) return;

      const dni = client.dni;
      const email = client.correo || `${dni}@paccha.local`;
      const existingIndex = updatedAdmins.findIndex(a => a.dni === dni || a.email?.toLowerCase() === email.toLowerCase());

      if (existingIndex >= 0) {
        updatedAdmins[existingIndex] = {
          ...updatedAdmins[existingIndex],
          role: role,
          estado: 'ACTIVO'
        };
      } else {
        const firstName = client.nombres || '';
        const lastName = client.apellidos || '';
        const usernameBase = (firstName.charAt(0) + (lastName.split(' ')[0] || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let finalUsername = usernameBase;
        let counter = 1;
        let usernameExists = updatedAdmins.some(a => (a.username || '').trim().toLowerCase() === finalUsername.toLowerCase());
        while (usernameExists) {
          finalUsername = `${usernameBase}${counter}`;
          counter++;
          usernameExists = updatedAdmins.some(a => (a.username || '').trim().toLowerCase() === finalUsername.toLowerCase());
        }

        const tempPassword = `Comite2026#`;
        const hashedPassword = bcrypt.hashSync(tempPassword, 10);

        updatedAdmins.push({
          id: 'admin_' + Math.random().toString(36).substr(2, 9),
          email: email.toLowerCase(),
          username: finalUsername.toLowerCase(),
          password: hashedPassword,
          nombres: firstName,
          apellidos: lastName,
          dni: dni,
          role: role,
          estado: 'ACTIVO',
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'SISTEMA_COMITE',
          updatedBy: 'SISTEMA_COMITE'
        });
      }
    };

    if (oldActiveComite) {
      const oldMemberIds = [
        oldActiveComite.presidente?.clientId,
        oldActiveComite.secretario?.clientId,
        oldActiveComite.tesorero?.clientId,
        oldActiveComite.fiscalizador?.clientId,
        oldActiveComite.vocal?.clientId
      ].filter(Boolean);

      const newMemberIds = [
        comite.presidente?.clientId,
        comite.secretario?.clientId,
        comite.tesorero?.clientId,
        comite.fiscalizador?.clientId,
        comite.vocal?.clientId
      ].filter(Boolean);

      oldMemberIds.forEach(oldId => {
        if (!newMemberIds.includes(oldId)) {
          const client = stateData.clients.find(c => c.id === oldId);
          if (client) {
            const adminIdx = updatedAdmins.findIndex(a => a.dni === client.dni && a.id !== 'admin_default');
            if (adminIdx >= 0) {
              updatedAdmins[adminIdx] = {
                ...updatedAdmins[adminIdx],
                estado: 'INACTIVO'
              };
            }
          }
        }
      });
    }

    syncMember(comite.presidente, 'ADMIN');
    syncMember(comite.secretario, 'SECRETARIO');
    syncMember(comite.tesorero, 'TESORERO');
    syncMember(comite.fiscalizador, 'FISCALIZADOR');
    if (comite.vocal) {
      syncMember(comite.vocal, 'VOCAL');
    }

    return updatedAdmins;
  };

  const deactiveMembersAdmins = (stateData: AppState, comite: Committee) => {
    let updatedAdmins = [...stateData.admins];
    const memberIds = [
      comite.presidente?.clientId,
      comite.secretario?.clientId,
      comite.tesorero?.clientId,
      comite.fiscalizador?.clientId,
      comite.vocal?.clientId
    ].filter(Boolean);

    memberIds.forEach(id => {
      const client = stateData.clients.find(c => c.id === id);
      if (client) {
        const adminIdx = updatedAdmins.findIndex(a => a.dni === client.dni && a.id !== 'admin_default');
        if (adminIdx >= 0) {
          updatedAdmins[adminIdx] = {
            ...updatedAdmins[adminIdx],
            estado: 'INACTIVO'
          };
        }
      }
    });

    return updatedAdmins;
  };

  const logCommitteeExonerations = (comite: Committee, registrar: string) => {
    const membersList = [
      { role: 'Presidente', m: comite.presidente },
      { role: 'Secretario', m: comite.secretario },
      { role: 'Tesorero', m: comite.tesorero },
      { role: 'Fiscalizador', m: comite.fiscalizador },
      comite.vocal ? { role: 'Vocal', m: comite.vocal } : null
    ].filter(Boolean) as { role: string; m: CommitteeMember }[];

    const firstExMonth = getMonthFollowing(comite.fechaInicio);
    const lastExMonth = getMonthOf(comite.fechaFin);

    membersList.forEach(({ role, m }) => {
      if (m?.supplyCodeExonerado) {
        addAuditLog(
          'CREAR',
          'SISTEMA',
          `Beneficio de Exoneración Otorgado - Beneficiario: ${m.nombreCompleto}, Cargo: ${role.toUpperCase()}, Suministro: ${m.supplyCodeExonerado}, Inicio: ${firstExMonth}-01, Término: ${lastExMonth}, Registrado por: ${registrar}`
        );
      }
    });
  };

  const addCommittee = async (committee: Omit<Committee, 'id' | 'createdBy' | 'createdAt'>) => {
    const exists = (state.comites || []).some(
      c => c.nombrePeriodo.trim().toLowerCase() === committee.nombrePeriodo.trim().toLowerCase()
    );
    if (exists) {
      throw new Error(`Ya existe un comité registrado para el período de elección "${committee.nombrePeriodo}".`);
    }

    const id = generateId();
    const newComite: Committee = {
      ...committee,
      id,
      createdAt: new Date().toISOString(),
      createdBy: user?.email || 'Unknown'
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'comites', id), newComite);

    let updatedComites = [...state.comites];
    let updatedAdmins = [...state.admins];

    if (newComite.activo) {
      const oldActive = updatedComites.find(c => c.activo);
      updatedComites.forEach(c => {
         if (c.activo) {
            batch.update(doc(db, 'comites', c.id), { activo: false });
         }
      });
      updatedAdmins = syncCommitteeAdmins(state, newComite, oldActive);
    }

    updatedAdmins.forEach(adm => {
       batch.set(doc(db, 'admins', adm.id), adm);
    });

    await batch.commit();
    addAuditLog('CREAR', 'SISTEMA', `Registró nuevo comité: ${committee.nombrePeriodo}`);
    logCommitteeExonerations(newComite, user?.email || 'Unknown');
  };

  const updateCommittee = async (id: string, updates: Partial<Committee>) => {
    if (updates.nombrePeriodo) {
      const exists = (state.comites || []).some(
        c => c.id !== id && c.nombrePeriodo.trim().toLowerCase() === updates.nombrePeriodo!.trim().toLowerCase()
      );
      if (exists) {
        throw new Error(`Ya existe otro comité registrado para el período de elección "${updates.nombrePeriodo}".`);
      }
    }

    const batch = writeBatch(db);
    const targetComite = state.comites.find(c => c.id === id);
    if (!targetComite) return;

    const mergedComite = { ...targetComite, ...updates };
    batch.set(doc(db, 'comites', id), mergedComite);

    let updatedAdmins = [...state.admins];

    if (updates.activo !== undefined) {
      if (updates.activo === true) {
        const oldActive = state.comites.find(c => c.activo && c.id !== id);
        state.comites.forEach(c => {
          if (c.activo && c.id !== id) {
            batch.update(doc(db, 'comites', c.id), { activo: false });
          }
        });
        updatedAdmins = syncCommitteeAdmins(state, mergedComite, oldActive);
      } else {
        updatedAdmins = deactiveMembersAdmins(state, mergedComite);
      }
    } else {
      if (mergedComite.activo) {
        updatedAdmins = syncCommitteeAdmins(state, mergedComite, targetComite);
      }
    }

    updatedAdmins.forEach(adm => {
      batch.set(doc(db, 'admins', adm.id), adm);
    });

    await batch.commit();
    addAuditLog('ACTUALIZAR', 'SISTEMA', `Actualizó comité: ${mergedComite.nombrePeriodo}`);
    logCommitteeExonerations(mergedComite, user?.email || 'Unknown');
  };

  const deleteCommittee = async (id: string) => {
    const targetComite = state.comites.find(c => c.id === id);
    if (!targetComite) return;

    const batch = writeBatch(db);
    batch.delete(doc(db, 'comites', id));

    let updatedAdmins = [...state.admins];
    if (targetComite.activo) {
      updatedAdmins = deactiveMembersAdmins(state, targetComite);
      updatedAdmins.forEach(adm => {
        batch.set(doc(db, 'admins', adm.id), adm);
      });
    }

    await batch.commit();
    addAuditLog('ELIMINAR', 'SISTEMA', `Eliminó comité: ${targetComite.nombrePeriodo}`);
  };

  const toggleCommitteeStatus = async (id: string) => {
    const targetComite = state.comites.find(c => c.id === id);
    if (!targetComite) return;

    const batch = writeBatch(db);
    const newStatus = !targetComite.activo;

    let updatedAdmins = [...state.admins];

    if (newStatus === true) {
      const oldActive = state.comites.find(c => c.activo);
      state.comites.forEach(c => {
        if (c.activo) {
          batch.update(doc(db, 'comites', c.id), { activo: false });
        }
      });
      batch.update(doc(db, 'comites', id), { activo: true });
      updatedAdmins = syncCommitteeAdmins(state, { ...targetComite, activo: true }, oldActive);
    } else {
      batch.update(doc(db, 'comites', id), { activo: false });
      updatedAdmins = deactiveMembersAdmins(state, targetComite);
    }

    updatedAdmins.forEach(adm => {
      batch.set(doc(db, 'admins', adm.id), adm);
    });

    await batch.commit();
    addAuditLog('ACTUALIZAR', 'SISTEMA', `Modificó estado de vigencia del comité: ${targetComite.nombrePeriodo}`);
  };

  const addTrabajador = async (trabajador: Omit<Trabajador, 'id' | 'fechaRegistro'>) => {
    if (!trabajador.nombres || !trabajador.nombres.trim() || !trabajador.apellidos || !trabajador.apellidos.trim()) {
      throw new Error('Nombres y Apellidos no pueden estar vacíos.');
    }
    if (!trabajador.dni || !/^\d{8}$/.test(trabajador.dni)) {
      throw new Error('El DNI debe tener exactamente 8 dígitos numéricos.');
    }
    const existing = (state.trabajadores || []).find(t => t.dni === trabajador.dni);
    if (existing) {
      throw new Error('El DNI ingresado ya pertenece a un trabajador registrado.');
    }
    if (trabajador.sueldoMensual <= 0) {
      throw new Error('El sueldo mensual debe ser mayor a cero.');
    }

    const newId = `TRAB-${Date.now()}`;
    const nTrabajador: Trabajador = {
      ...trabajador,
      id: newId,
      fechaRegistro: new Date().toISOString(),
      createdBy: user?.email || 'Admin'
    };

    await setDoc(doc(db, 'trabajadores', newId), nTrabajador);
    addAuditLog('CREAR', 'SISTEMA', `Registró al trabajador de planta: ${nTrabajador.nombres} ${nTrabajador.apellidos}`);
  };

  const updateTrabajador = async (id: string, updates: Partial<Trabajador>) => {
    if (updates.nombres !== undefined && (!updates.nombres || !updates.nombres.trim())) {
      throw new Error('El nombre no puede estar vacío.');
    }
    if (updates.apellidos !== undefined && (!updates.apellidos || !updates.apellidos.trim())) {
      throw new Error('El apellido no puede estar vacío.');
    }
    if (updates.dni !== undefined) {
      if (!updates.dni || !/^\d{8}$/.test(updates.dni)) {
        throw new Error('El DNI debe tener exactamente 8 dígitos numéricos.');
      }
      const existing = (state.trabajadores || []).find(t => t.dni === updates.dni && t.id !== id);
      if (existing) {
        throw new Error('El DNI ingresado ya pertenece a otro trabajador registrado.');
      }
    }
    if (updates.sueldoMensual !== undefined && updates.sueldoMensual <= 0) {
      throw new Error('El sueldo mensual debe ser mayor a cero.');
    }

    await updateDoc(doc(db, 'trabajadores', id), cleanUndefinedKeys({
      ...updates,
      updatedBy: user?.email || 'Unknown'
    }));
    addAuditLog('ACTUALIZAR', 'SISTEMA', `Actualizó información del trabajador ID: ${id}`);
  };

  const addPagoSueldo = async (pago: Omit<PagoSueldo, 'id' | 'fechaPago' | 'comprobante' | 'createdBy'>) => {
    const worker = (state.trabajadores || []).find(t => t.id === pago.trabajadorId);
    if (!worker) {
      throw new Error('El trabajador seleccionado no existe.');
    }
    if (worker.estado !== 'ACTIVO') {
      throw new Error('Solo los trabajadores activos pueden recibir pagos de remuneración.');
    }

    const alreadyPaid = (state.pagosSueldos || []).some(
      p => p.trabajadorId === pago.trabajadorId && p.mesPagado === pago.mesPagado
    );
    if (alreadyPaid) {
      const [year, month] = pago.mesPagado.split('-');
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const monthName = monthNames[parseInt(month, 10) - 1] || month;
      throw new Error(`El trabajador ya tiene registrado el pago de sueldo correspondiente al mes de ${monthName}/${year}.`);
    }

    // Atomic continuous sequence
    const compNo = await getNextSequenceNumber('S');

    const newId = `PAG-${Date.now()}`;
    const nPago: PagoSueldo = {
      ...pago,
      id: newId,
      fechaPago: new Date().toISOString(),
      comprobante: compNo,
      createdBy: user?.email || 'Admin'
    };

    const egresoTxId = `TX-EG-${Date.now()}`;
    const egresoTx: Transaction = {
      id: egresoTxId,
      tipo: 'EGRESO',
      categoria: 'SUELDOS',
      monto: Number(pago.monto),
      fecha: new Date().toISOString(),
      descripcion: pago.observaciones || `PAGO DE SUELDO - MES: ${pago.mesPagado} - TRABAJADOR: ${pago.trabajadorNombreCompleto}`,
      destinatario: pago.trabajadorNombreCompleto,
      createdBy: user?.email || 'Admin',
      comprobante: compNo,
      metodoPago: 'EFECTIVO'
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'pagosSueldos', newId), nPago);
    batch.set(doc(db, 'transactions', egresoTxId), egresoTx);

    await batch.commit();

    addAuditLog('CREAR', 'FINANZAS', `Registró pago de sueldo a: ${pago.trabajadorNombreCompleto} por el mes ${pago.mesPagado}`);
    return nPago;
  };

  const updateSettings = async (settings: any) => {
    await setDoc(doc(db, 'settings', 'global'), { ...state.settings, ...settings });
    addAuditLog('ACTUALIZAR', 'SISTEMA', `Actualizó configuración del sistema`);
  };

  return (
    <AppContext.Provider value={{
      ...state,
      comites: state.comites || [],
      trabajadores: state.trabajadores || [],
      pagosSueldos: state.pagosSueldos || [],
      user,
      userRole,
      mustChangePassword,
      loadingAuth,
      addClient,
      updateClient,
      transferSupply,
      addConsumption,
      updateConsumption,
      payConsumption,
      addFine,
      payFine,
      addTransaction,
      toggleTransactionConciliado,
      addMeeting,
      updateMeeting,
      updateSettings,
      recordAttendance,
      updateAdmin,
      addAdmin,
      deleteConsumption,
      markSupplyAsSocio,
      setSupplySocioStatus,
      login,
      logout,
      addAuditLog,
      addCommittee,
      updateCommittee,
      deleteCommittee,
      toggleCommitteeStatus,
      addTrabajador,
      updateTrabajador,
      addPagoSueldo,
      initializeCounter,
      seedDatabaseFromBackup
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
