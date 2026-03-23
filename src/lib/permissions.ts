export type PagePermission =
    | 'dashboard'
    | 'cameras'
    | 'users'
    | 'settings'
    | 'audit'
    | 'cadastros';

export interface AvailablePage {
    key: PagePermission;
    label: string;
}

export const AVAILABLE_PAGES: AvailablePage[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'cameras', label: 'Cameras' },
    { key: 'users', label: 'Users' },
    { key: 'settings', label: 'Settings' },
    { key: 'audit', label: 'Audit' },
    { key: 'cadastros', label: 'Cadastros' },
];

interface UserContext {
    role: 'admin' | 'viewer';
    page_permissions?: string[];
}

/**
 * Returns the default permissions object for a given role.
 */
export function getDefaultPermissions(role: 'admin' | 'viewer'): { page_permissions: string[] } {
    if (role === 'admin') {
        return { page_permissions: AVAILABLE_PAGES.map((p) => p.key) };
    }
    return { page_permissions: ['dashboard'] };
}

/**
 * Returns true if the user has access to a specific page.
 * Admins always have full access; viewers depend on their page_permissions.
 */
export function hasPagePermission(
    user: UserContext | null,
    page: PagePermission
): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (user.page_permissions || []).includes(page);
}

/**
 * Returns true if the user can manage viewer accounts.
 * Only admins and viewers with the 'users' permission can do this.
 */
export function canManageViewers(user: UserContext | null): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (user.page_permissions || []).includes('users');
}
