import React from 'react';

export interface ClientFormValues {
  tipoPersona: 'PERSONA' | 'EMPRESA';
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  dni: string;
  tipoVia: string;
  nombreVia: string;
  numeroDireccion: string;
  sector: string;
  referenciaDireccion: string;
  telefono: string;
}

interface ClientFormFieldsProps {
  values: ClientFormValues;
  onChange: (updatedValues: Partial<ClientFormValues>) => void;
  disabled?: boolean;
}

export const ClientFormFields: React.FC<ClientFormFieldsProps> = ({ values, onChange, disabled = false }) => {
  return (
    <div className="space-y-4">
      {/* Tipo de Persona */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Tipo de Persona</label>
        <div className="flex gap-4">
          <label className="flex items-center text-slate-300 cursor-pointer">
            <input 
              type="radio" 
              name="tipoPersona" 
              value="PERSONA" 
              disabled={disabled}
              checked={values.tipoPersona === 'PERSONA'} 
              onChange={() => onChange({ tipoPersona: 'PERSONA' })} 
              className="mr-2 text-blue-500 focus:ring-blue-500 bg-[#0B0E14] border-slate-700" 
            />
            Persona Natural
          </label>
          <label className="flex items-center text-slate-300 cursor-pointer">
            <input 
              type="radio" 
              name="tipoPersona" 
              value="EMPRESA" 
              disabled={disabled}
              checked={values.tipoPersona === 'EMPRESA'} 
              onChange={() => onChange({ tipoPersona: 'EMPRESA' })} 
              className="mr-2 text-blue-500 focus:ring-blue-500 bg-[#0B0E14] border-slate-700" 
            />
            Empresa / Persona Jurídica
          </label>
        </div>
      </div>

      {/* Nombres / Apellidos vs Razón Social */}
      {values.tipoPersona === 'PERSONA' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">Nombres *</label>
            <input 
              type="text" 
              required 
              disabled={disabled}
              value={values.nombres} 
              onChange={e => onChange({ nombres: e.target.value })} 
              placeholder="Ej: Juan Carlos"
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Apellido Paterno *</label>
            <input 
              type="text" 
              required 
              disabled={disabled}
              value={values.apellidoPaterno} 
              onChange={e => onChange({ apellidoPaterno: e.target.value })} 
              placeholder="Ej: Pérez"
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Apellido Materno</label>
            <input 
              type="text" 
              disabled={disabled}
              value={values.apellidoMaterno} 
              onChange={e => onChange({ apellidoMaterno: e.target.value })} 
              placeholder="Ej: Gómez"
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-300">Razón Social *</label>
          <input 
            type="text" 
            required 
            disabled={disabled}
            value={values.nombres} 
            onChange={e => onChange({ nombres: e.target.value })} 
            placeholder="Ej: Constructora San Martín S.A.C."
            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
          />
        </div>
      )}

      {/* DNI / RUC y Teléfono */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300">
            {values.tipoPersona === 'PERSONA' ? 'DNI *' : 'RUC *'}
          </label>
          <input 
            type="text" 
            required 
            disabled={disabled}
            value={values.dni} 
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '');
              onChange({ dni: val });
            }} 
            maxLength={values.tipoPersona === 'PERSONA' ? 8 : 11}
            minLength={values.tipoPersona === 'PERSONA' ? 8 : 11}
            pattern={values.tipoPersona === 'PERSONA' ? "\\d{8}" : "\\d{11}"}
            title={values.tipoPersona === 'PERSONA' ? "Debe contener exactamente 8 dígitos" : "Debe contener exactamente 11 dígitos"}
            placeholder={values.tipoPersona === 'PERSONA' ? "8 dígitos de DNI" : "11 dígitos de RUC"}
            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300">Teléfono</label>
          <input 
            type="text" 
            disabled={disabled}
            value={values.telefono} 
            onChange={e => onChange({ telefono: e.target.value })} 
            placeholder="Ej: 987654321"
            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
          />
        </div>
      </div>

      {/* Formulario de Dirección Estructurada */}
      <div className="space-y-4 bg-slate-900/30 p-4 rounded-lg border border-slate-800">
        <h4 className="text-xs font-bold uppercase text-blue-400 tracking-wider">Dirección Estructurada</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">Tipo de Vía *</label>
            <select 
              required 
              disabled={disabled}
              value={values.tipoVia || ''} 
              onChange={e => onChange({ tipoVia: e.target.value })} 
              className="mt-1 block w-full bg-[#0B0E14] border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-slate-100 disabled:opacity-50"
            >
              <option value="">-- Seleccionar --</option>
              <option value="Avenida">Avenida</option>
              <option value="Calle">Calle</option>
              <option value="Jirón">Jirón</option>
              <option value="Pasaje">Pasaje</option>
              <option value="Carretera">Carretera</option>
              <option value="Prolongación">Prolongación</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300">Nombre de la Vía *</label>
            <input 
              type="text" 
              required 
              disabled={disabled}
              value={values.nombreVia || ''} 
              onChange={e => onChange({ nombreVia: e.target.value })} 
              placeholder="Ej: Larco, Bolognesi, etc."
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">N.º de Dirección *</label>
            <input 
              type="text" 
              required 
              disabled={disabled}
              value={values.numeroDireccion || ''} 
              onChange={e => onChange({ numeroDireccion: e.target.value })} 
              placeholder="Ej: 123, S/N, Mz A Lt 5"
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">Sector / Barrio / Urbanización *</label>
            <input 
              type="text" 
              required 
              disabled={disabled}
              value={values.sector || ''} 
              onChange={e => onChange({ sector: e.target.value })} 
              placeholder="Ej: Sector Alto, Barrio San José"
              className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300">Referencia (Opcional)</label>
          <input 
            type="text" 
            disabled={disabled}
            value={values.referenciaDireccion || ''} 
            onChange={e => onChange({ referenciaDireccion: e.target.value })} 
            placeholder="Ej: Costado del parque, portón azul"
            className="mt-1 block w-full border border-slate-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-[#0B0E14] text-slate-100 disabled:opacity-50" 
          />
        </div>
      </div>
    </div>
  );
};
