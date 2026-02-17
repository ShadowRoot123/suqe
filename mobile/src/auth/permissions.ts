import type { Session } from "@/auth/session";

export function hasPermission(session: Session | null, permissionKey: string) {
  if (!session) return false;
  const keys = session.permissions;
  if (!Array.isArray(keys)) return true;
  return keys.includes(permissionKey);
}

export function hasAllPermissions(session: Session | null, permissionKeys: string[]) {
  if (permissionKeys.length === 0) return true;
  if (!session) return false;
  const keys = session.permissions;
  if (!Array.isArray(keys)) return true;
  for (const key of permissionKeys) {
    if (!keys.includes(key)) return false;
  }
  return true;
}

