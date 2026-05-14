/** Shape of `request.user` after JwtStrategy.validate (admin JWT). */
export interface AuthenticatedAdminUser {
  id: string;
  email: string;
  name: string | null;
  role: {
    id: string;
    name: string;
    permissions: Record<string, string[]>;
  };
  allowedApps: string[];
}
