const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Error de la API de autenticación con el código de negocio del backend
 * (por ejemplo FARM_SELECTION_REQUIRED) y datos adicionales como las fincas.
 */
export class AuthApiError extends Error {
  constructor(message, { status, code = null, farms = null } = {}) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.farms = farms;
  }
}

const readError = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  const detail = data.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return new AuthApiError(detail.message || fallback, {
      status: response.status,
      code: detail.code || null,
      farms: detail.farms || null,
    });
  }
  const message = typeof detail === 'string' ? detail : fallback;
  return new AuthApiError(message, { status: response.status });
};

const request = async (path, { token, method = 'GET', body, fallbackError }) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw await readError(response, fallbackError);
  }
  return response.json();
};

/**
 * Servicio de autenticación para BovinoTech IoT.
 * Contrato: specs/001-auth-rbac/contracts/auth-api.md
 */
export const authService = {
  /**
   * Inicia sesión. Si el usuario tiene varias fincas y no se envía farmId,
   * lanza AuthApiError con code FARM_SELECTION_REQUIRED y la lista de fincas.
   * @returns {Promise<{ access_token: string, token_type: string, role: string,
   *   farm_id: number, must_change_password: boolean, expires_at: string }>}
   */
  async login(email, password, farmId = null) {
    const body = { username: email, password };
    if (farmId !== null && farmId !== undefined) body.farm_id = farmId;
    try {
      return await request('/auth/login', {
        method: 'POST',
        body,
        fallbackError: 'Error al iniciar sesión',
      });
    } catch (err) {
      if (err.status === 401) {
        throw new AuthApiError('Correo electrónico o contraseña incorrectos', {
          status: 401,
        });
      }
      throw err;
    }
  },

  /** Cambia la contraseña (obligatorio tras recibir una contraseña temporal). */
  changePassword(token, currentPassword, newPassword) {
    return request('/auth/change-password', {
      token,
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
      fallbackError: 'No se pudo cambiar la contraseña',
    });
  },

  /** Usuarios de la finca del administrador. */
  listUsers(token) {
    return request('/auth/users', { token, fallbackError: 'No se pudieron cargar los usuarios' });
  },

  /** Aprovisiona un usuario con contraseña temporal en la finca del administrador. */
  createUser(token, { email, fullName, role, temporaryPassword }) {
    return request('/auth/users', {
      token,
      method: 'POST',
      body: {
        email,
        full_name: fullName,
        role,
        temporary_password: temporaryPassword,
      },
      fallbackError: 'No se pudo crear el usuario',
    });
  },

  /** Habilita o deshabilita un usuario de la finca del administrador. */
  setUserStatus(token, userId, isActive) {
    return request(`/auth/users/${userId}/status`, {
      token,
      method: 'PATCH',
      body: { is_active: isActive },
      fallbackError: 'No se pudo actualizar el estado del usuario',
    });
  },

  /** Añade la finca del administrador a un veterinario o directivo existente. */
  addUserFarm(token, email) {
    return request('/auth/users/farms', {
      token,
      method: 'POST',
      body: { email },
      fallbackError: 'No se pudo asignar la finca',
    });
  },

  /** Registro de auditoría de la finca del administrador. */
  getAudit(token, action = null) {
    const query = action ? `?action=${encodeURIComponent(action)}` : '';
    return request(`/auth/audit${query}`, {
      token,
      fallbackError: 'No se pudo cargar la auditoría',
    });
  },

  /**
   * Prueba el acceso a endpoints protegidos de Veterinario (RBAC).
   * @param {string} token - Token JWT
   * @returns {Promise<{ message: string }>}
   */
  testVetOnly(token) {
    return request('/auth/test-vet-only', { token, fallbackError: 'Acceso restringido' });
  },
};

export default authService;
