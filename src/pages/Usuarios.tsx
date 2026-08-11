import React, { useState } from 'react';
import { Shield, ShieldAlert, UserCheck, Plus, X, ChevronLeft, ChevronRight, Power, UserX, UserMinus, Search, Filter, Copy, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { Card, CardContent, Badge, Button, Pagination } from '../components/ui';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { normalizeSearchText } from '../lib/utils';
import { PasswordStrengthIndicator, evaluatePasswordStrength } from '../components/PasswordStrengthIndicator';

import bcrypt from 'bcryptjs';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Usuarios() {
  const { admins, updateAdmin, addAdmin, user, userRole } = useAppContext();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'ADMIN'|'TESORERO'|'OPERATOR'|'FISCALIZADOR'>('OPERATOR');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombres, setNewNombres] = useState('');
  const [newApellidos, setNewApellidos] = useState('');
  const [newDni, setNewDni] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN'|'TESORERO'|'OPERATOR'|'FISCALIZADOR'>('OPERATOR');
  const [creatingUser, setCreatingUser] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('TODOS');
  
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState<{ password: string, username: string }>({ password: '', username: '' });
  const [isCopied, setIsCopied] = useState(false);

  const generateSecureRandomPassword = (): string => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleUpdateRole = (id: string) => {
    updateAdmin(id, { role: selectedRole });
    setEditingId(null);
  };

  const handleCreateLocalUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || (!newNombres && !newEmail)) return;
    
    if (!/^\d{8}$/.test(newDni)) {
      toast.error('El DNI debe contener exactamente 8 dígitos numéricos y no incluir letras ni espacios.');
      return;
    }

    const strength = evaluatePasswordStrength(newPassword);
    
    setCreatingUser(true);
    
    try {
      const usernameBase = (newNombres.charAt(0) + (newApellidos.split(' ')[0] || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
      let newResultUsername = usernameBase;
      let counter = 1;
      let usernameExists = admins.some(a => (a.username || '').trim().toLowerCase() === newResultUsername.toLowerCase());
      while (usernameExists) {
        newResultUsername = `${usernameBase}${counter}`;
        counter++;
        usernameExists = admins.some(a => (a.username || '').trim().toLowerCase() === newResultUsername.toLowerCase());
      }
      const newUsername = newResultUsername;
      
      await addAdmin({
         email: (newEmail || `${newUsername}@paccha.local`).toLowerCase(),
         username: newUsername.toLowerCase(),
         password: bcrypt.hashSync(newPassword, 10),
         nombres: newNombres,
         apellidos: newApellidos,
         dni: newDni,
         role: newRole,
         mustChangePassword: true,
      });
      
      toast.success(`Usuario creado correctamente.\nUsuario: ${newUsername}\nRol: ${newRole}`, { duration: 5000 });
      setIsModalOpen(false);
      
      // Cleanup fields
      setNewNombres('');
      setNewApellidos('');
      setNewDni('');
      setNewEmail('');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async (id: string, username: string) => {
    const isConfirmed = await confirm({
      title: 'Restablecer Contraseña',
      message: `¿Está seguro de querer restablecer la contraseña para el usuario "${username}"?\nSe generará una contraseña temporal.`,
      type: 'warning',
      confirmLabel: 'Restablecer'
    });
    if (!isConfirmed) return;

    const tempPassword = `temp${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);
    
    try {
      await updateAdmin(id, { 
        password: hashedPassword, 
        mustChangePassword: true,
        lastPasswordChangeLog: `Restablecido por administrador ${user?.email || 'Sistema'} el ${new Date().toLocaleString()}`
      });
      
      setResetPasswordData({ password: tempPassword, username: username });
      setResetPasswordModalOpen(true);
      setIsCopied(false);
      
    } catch (err: any) {
      toast.error(err.message || 'Error al restablecer la contraseña.');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const isActivating = currentStatus === 'INACTIVO';
    const isConfirmed = await confirm({
      title: isActivating ? 'Activar Usuario' : 'Desactivar Usuario',
      message: `¿Está seguro de querer cambiar el estado de este usuario a ${isActivating ? 'ACTIVO' : 'INACTIVO'}?`,
      type: isActivating ? 'info' : 'danger',
      confirmLabel: isActivating ? 'Activar' : 'Desactivar'
    });
    if (!isConfirmed) return;
    
    try {
      await updateAdmin(id, { estado: currentStatus === 'INACTIVO' ? 'ACTIVO' : 'INACTIVO' });
      toast.success('Estado actualizado correctamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el estado.');
    }
  };

  const filteredAdmins = admins.filter(admin => {
    const searchNormalized = normalizeSearchText(searchTerm);
    const rawFullName = `${admin.nombres || ''} ${admin.apellidos || ''}`;
    const fullName = normalizeSearchText(rawFullName);
    const dni = normalizeSearchText(admin.dni || '');
    const username = normalizeSearchText(admin.username || '');
    
    const matchesSearch = !searchNormalized || 
                          fullName.includes(searchNormalized) || 
                          dni.includes(searchNormalized) || 
                          username.includes(searchNormalized);
                          
    const adminEstado = admin.estado || 'ACTIVO';
    const matchesStatus = statusFilter === 'TODOS' || adminEstado === statusFilter;
    
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const nameA = `${a.apellidos || ''}, ${a.nombres || ''}`.toLowerCase();
    const nameB = `${b.apellidos || ''}, ${b.nombres || ''}`.toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const totalPages = Math.ceil(filteredAdmins.length / itemsPerPage);
  
  const currentAdmins = filteredAdmins.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:truncate sm:text-3xl sm:tracking-tight">
            Usuarios del Sistema
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Administra los perfiles y roles de los usuarios que pueden acceder al sistema.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          {userRole !== 'FISCALIZADOR' && (
            <Button onClick={() => {
              const securePass = generateSecureRandomPassword();
              setNewPassword(securePass);
              setShowNewPassword(true);
              setIsModalOpen(true);
            }} className="flex items-center">
              <Plus className="mr-2 h-4 w-4" />
              Crear Usuario Local
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="bg-yellow-500/10 p-4 border-b border-yellow-500/20 flex items-start space-x-3">
             <ShieldAlert className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
             <p className="text-sm text-yellow-200/80">
               Solo los usuarios con rol <strong className="text-yellow-500">ADMIN</strong> pueden modificar los roles del sistema. (Modo Local).
             </p>
          </div>

          <div className="p-4 border-b border-slate-800 bg-[#0B0E14] sm:flex sm:items-center sm:justify-between space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="relative flex-1 max-w-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                placeholder="Buscar por DNI, Nombres o Usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 pl-9 bg-slate-900/50 text-slate-200 ring-1 ring-inset ring-slate-800 placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 bg-slate-900/50 text-slate-200 ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 cursor-pointer"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="ACTIVO">Activos</option>
                <option value="INACTIVO">Inactivos</option>
              </select>
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredAdmins.length}
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
                    Usuario / Nombres
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Rol Actual
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#0B0E14] divide-y divide-slate-800">
                {currentAdmins.map((admin) => {
                  const estadoActual = admin.estado || 'ACTIVO';
                  const isActivo = estadoActual === 'ACTIVO';
                  
                  return (
                  <tr key={admin.id} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full ${isActivo ? 'bg-slate-800' : 'bg-red-900/40 opacity-70'}`}>
                          <UserCheck className={`h-5 w-5 ${isActivo ? 'text-slate-400' : 'text-red-400 opacity-70'}`} />
                        </div>
                        <div className="ml-4">
                          <div className={`text-sm font-medium ${isActivo ? 'text-slate-100' : 'text-slate-500 line-through decoration-slate-700'}`}>
                            {admin.nombres ? `${admin.nombres} ${admin.apellidos}` : admin.username || admin.email}
                          </div>
                          <div className="text-xs text-slate-400">
                            {admin.username || admin.email} {admin.dni ? `• DNI: ${admin.dni}` : ''}
                          </div>
                          {admin.email === user?.email && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                              Tú
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === admin.id ? (
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as any)}
                          className="mt-1 block max-w-[150px] bg-[#0B0E14] text-slate-100 border border-slate-700 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                          <option value="ADMIN">Administrador</option>
                          <option value="TESORERO">Tesorero</option>
                          <option value="FISCALIZADOR">Fiscalizador</option>
                          <option value="OPERATOR">Operador</option>
                        </select>
                      ) : (
                        <Badge variant={admin.role === 'ADMIN' ? 'danger' : admin.role === 'TESORERO' ? 'success' : admin.role === 'FISCALIZADOR' ? 'warning' : 'info'}>
                          {admin.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={isActivo ? 'success' : 'danger'}>
                        {estadoActual}
                      </Badge>
                      {admin.updatedBy && <div className="text-[10px] text-slate-500 mt-1" title={admin.updatedAt ? format(new Date(admin.updatedAt), "dd MMM yyyy, HH:mm", { locale: es }) : ''}>Por: {admin.updatedBy}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {userRole !== 'FISCALIZADOR' && (
                        <>
                          {editingId === admin.id ? (
                            <>
                              <Button size="sm" variant="primary" onClick={() => handleUpdateRole(admin.id)}>
                                Guardar
                              </Button>
                              <Button size="sm" variant="cancel" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => {
                                  setEditingId(admin.id);
                                  setSelectedRole(admin.role);
                                }}
                                disabled={admin.email === user?.email || !isActivo}
                              >
                                Cambiar Rol
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleResetPassword(admin.id, admin.username || admin.email.split('@')[0])}
                                disabled={admin.email === user?.email || !isActivo}
                              >
                                Restablecer Clave
                              </Button>
                              <Button
                                size="sm"
                                variant={isActivo ? 'danger' : 'success'}
                                onClick={() => handleToggleStatus(admin.id, estadoActual)}
                                disabled={admin.email === user?.email}
                                title={isActivo ? 'Desactivar usuario' : 'Activar usuario'}
                              >
                                {isActivo ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )})}
                {currentAdmins.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                      No hay usuarios registrados o no coinciden con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredAdmins.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(items) => { setItemsPerPage(items); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Modal Crear Usuario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setIsModalOpen(false)}>
              <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <div className="inline-block align-bottom bg-[#0B0E14] border border-slate-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full relative z-10">
              <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg leading-6 font-medium text-slate-100">Crear Usuario Local</h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                    <span className="sr-only">Cerrar</span>
                    <X className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <form onSubmit={handleCreateLocalUser}>
                <div className="px-4 py-5 sm:p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Nombres</label>
                      <input 
                        type="text" 
                        required 
                        value={newNombres} 
                        onChange={e => setNewNombres(e.target.value)} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Apellidos</label>
                      <input 
                        type="text" 
                        required 
                        value={newApellidos} 
                        onChange={e => setNewApellidos(e.target.value)} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">DNI</label>
                      <input 
                        type="text" 
                        required 
                        value={newDni} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 8) setNewDni(val);
                        }} 
                        maxLength={8}
                        minLength={8}
                        pattern="\d{8}"
                        title="Debe contener exactamente 8 dígitos"
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Rol Inicial</label>
                      <select 
                        value={newRole} 
                        onChange={e => setNewRole(e.target.value as any)} 
                        className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100"
                      >
                        <option value="OPERATOR">Operador</option>
                        <option value="TESORERO">Tesorero</option>
                        <option value="FISCALIZADOR">Fiscalizador</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300">Correo Electrónico (Opcional)</label>
                    <input 
                      type="email" 
                      value={newEmail} 
                      onChange={e => setNewEmail(e.target.value)} 
                      className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100" 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-300">Contraseña inicial</label>
                      <button
                        type="button"
                        onClick={() => {
                          const tempPass = generateSecureRandomPassword();
                          setNewPassword(tempPass);
                          setShowNewPassword(true);
                          toast.success(`Contraseña aleatoria asignada: ${tempPass}`, { icon: '🔑' });
                        }}
                        className="text-xs text-blue-500 hover:text-blue-400 font-medium hover:underline flex items-center gap-1 active:scale-95 transition-transform"
                      >
                        ⚡ Generar Otra Clave Temporal
                      </button>
                    </div>
                    <div className="relative">
                      <input 
                        type={showNewPassword ? "text" : "password"} 
                        required 
                        readOnly
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)} 
                        className="block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 pr-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#141A24] text-emerald-400 font-mono"
                        placeholder="Generando contraseña segura..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed font-normal">
                      * Puede ingresar cualquier contraseña manual sin restricciones de longitud o complejidad. El cambio con políticas estrictas de seguridad será requerido obligatoriamente en el primer inicio de sesión del usuario.
                    </p>
                    <PasswordStrengthIndicator passwordStr={newPassword} />
                  </div>
                </div>
                <div className="px-4 py-3 bg-slate-800/30 sm:px-6 sm:flex sm:flex-row-reverse gap-3 border-t border-slate-800">
                  <Button type="submit" variant="primary" disabled={creatingUser} className="w-full sm:ml-3 sm:w-auto">
                    {creatingUser ? 'Creando...' : 'Crear Usuario'}
                  </Button>
                  <Button type="button" variant="cancel" onClick={() => setIsModalOpen(false)} className="mt-3 w-full sm:mt-0 sm:w-auto">
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Contraseña Restablecida */}
      {resetPasswordModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" onClick={() => setResetPasswordModalOpen(false)}>
              <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

            <div className="inline-block align-bottom bg-[#0B0E14] border border-slate-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full relative z-10">
              <div className="px-4 py-5 sm:p-6 space-y-4">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/10 mb-4">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg leading-6 font-medium text-slate-100 mb-2">Contraseña Restablecida</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    La contraseña ha sido restablecida correctamente. El usuario deberá cambiarla en su próximo inicio de sesión.
                  </p>
                  
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1 text-left">Contraseña Temporal</div>
                      <div className="text-xl font-mono text-emerald-400 tracking-wider">
                        {resetPasswordData.password}
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="ml-4"
                      onClick={() => {
                        navigator.clipboard.writeText(resetPasswordData.password);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                    >
                      {isCopied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      <span className="ml-2">{isCopied ? 'Copiado' : 'Copiar'}</span>
                    </Button>
                  </div>
                  
                  <p className="text-xs text-yellow-500/80 bg-yellow-500/10 p-2 rounded border border-yellow-500/20 text-left">
                    ⚠️ Esta contraseña se mostrará una única vez. Asegúrese de copiarla y compartirla con el usuario.
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-800/30 sm:px-6 flex justify-center border-t border-slate-800">
                <Button type="button" onClick={() => setResetPasswordModalOpen(false)} className="w-full sm:w-auto">
                  Aceptar y Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
