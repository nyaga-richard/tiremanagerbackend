// lib/auth.ts

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_info';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  role_id: number;
  department: string;
  permissions: Permission[];
}

export interface Permission {
  code: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export const storeToken = (token: string, rememberMe: boolean = false): void => {
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
};

export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
};

export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
};

export const storeUser = (user: User, rememberMe: boolean = false): void => {
  const userData = JSON.stringify(user);
  if (rememberMe) {
    localStorage.setItem(USER_KEY, userData);
  } else {
    sessionStorage.setItem(USER_KEY, userData);
  }
};

export const getUser = (): User | null => {
  const userData = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  return userData ? JSON.parse(userData) : null;
};

export const removeUser = (): void => {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
};

export const logout = async (): Promise<void> => {
  const token = getToken();
  
  if (token) {
    try {
      await fetch('http://localhost:5000/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  removeToken();
  removeUser();
};

export const validateToken = async (): Promise<boolean> => {
  const token = getToken();
  
  if (!token) {
    return false;
  }
  
  try {
    const response = await fetch('http://localhost:5000/api/auth/validate-token', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.valid;
    }
  } catch (error) {
    console.error('Token validation error:', error);
  }
  
  return false;
};

export const hasPermission = (
  permissionCode: string, 
  action: 'view' | 'create' | 'edit' | 'delete' | 'approve' = 'view'
): boolean => {
  const user = getUser();
  
  if (!user?.permissions) {
    return false;
  }
  
  const permission = user.permissions.find(p => p.code === permissionCode);
  
  if (!permission) {
    return false;
  }
  
  switch (action) {
    case 'view': return permission.can_view;
    case 'create': return permission.can_create;
    case 'edit': return permission.can_edit;
    case 'delete': return permission.can_delete;
    case 'approve': return permission.can_approve;
    default: return false;
  }
};

export const requireAuth = (permission?: string): boolean => {
  const token = getToken();
  const user = getUser();
  
  if (!token || !user) {
    return false;
  }
  
  if (permission) {
    return hasPermission(permission);
  }
  
  return true;
};