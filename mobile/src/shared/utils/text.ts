export function getInitials(label: string) {
  const cleaned = label.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

