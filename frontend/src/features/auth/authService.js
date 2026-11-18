const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Servicio de autenticación para BovinoTech IoT.
 */
export const authService = {
  /**
   * Inicia sesión en la plataforma enviando credenciales.
   * @param {string} email - Correo del usuario (ej: operario@bovinotech.co)
   * @param {string} password - Contraseña del usuario
   * @returns {Promise<{ access_token: string, token_type: string, role: string }>}
   */
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: email,
        password: password,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Error al iniciar sesión';
      try {
        const errorData = await response.json();
        if (response.status === 401) {
          errorMessage = 'Correo electrónico o contraseña incorrectos';
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        // En caso de que la respuesta no sea JSON
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  },

  /**
   * Prueba el acceso a endpoints protegidos de Veterinario (RBAC).
   * @param {string} token - Token JWT
   * @returns {Promise<{ message: string }>}
   */
  async testVetOnly(token) {
    const response = await fetch(`${API_URL}/auth/test-vet-only`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || 'Acceso restringido');
    }

    return data;
  },
};

export default authService;
