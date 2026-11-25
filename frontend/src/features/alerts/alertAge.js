export function formatPositionAge(timestamp, now = new Date()) {
  const capturedAt = new Date(timestamp);
  const reference = now instanceof Date ? now : new Date(now);

  if (Number.isNaN(capturedAt.getTime()) || Number.isNaN(reference.getTime())) {
    return 'antigüedad desconocida';
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((reference.getTime() - capturedAt.getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) return 'hace menos de un minuto';
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `hace ${elapsedHours} h`;

  return `hace ${Math.floor(elapsedHours / 24)} d`;
}
