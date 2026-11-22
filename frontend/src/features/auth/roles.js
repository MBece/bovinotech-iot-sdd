/** Roles del sistema y su descripción para la interfaz (FR-007, research.md R8). */
export const ROLES = {
  ADMINISTRADOR: {
    label: 'Administrador',
    color: '#7c3aed',
    description:
      'Gestiona las cuentas de su finca: crea usuarios, los habilita o deshabilita y consulta la auditoría.',
  },
  OPERARIO: {
    label: 'Operario',
    color: '#10b981',
    description:
      'Tiene permisos de campo para pesaje, geocercas y registro de eventos sanitarios preliminares.',
  },
  VETERINARIO: {
    label: 'Veterinario',
    color: '#3b82f6',
    description:
      'Tiene permisos clínicos completos, incluyendo aprobación de tratamientos y resolución de conflictos SINIGÁN V6.',
  },
  DIRECTIVO: {
    label: 'Directivo',
    color: '#d97706',
    description:
      'Consulta en modo de solo lectura los costos directivos, el inventario y el historial sanitario de su finca.',
  },
};

/** Roles que pueden capturar y registrar eventos (FR-009, FR-010, FR-018). */
export const CAPTURE_ROLES = ['OPERARIO', 'VETERINARIO'];

export const roleInfo = (role) =>
  ROLES[role] || { label: role || 'Sin rol', color: '#6b7280', description: '' };
