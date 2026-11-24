export { SanitaryTimeline } from './SanitaryTimeline';
export { sanitaryEventsService } from './services/sanitaryEventsService';

export const navItem = {
  id: 'sanitary-events',
  label: 'Historial sanitario',
  icon: 'health',
  requiredRole: 'OPERARIO',
  alsoAllowedRoles: ['VETERINARIO'],
};
