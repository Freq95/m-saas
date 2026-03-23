export class AuthError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'AuthError';
  }
}

export async function authFetcher<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 401 || response.status === 403) {
    window.location.href = '/login';
    throw new AuthError();
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
