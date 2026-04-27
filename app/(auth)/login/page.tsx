import LoginForm from './LoginForm';

type LoginPageProps = {
  searchParams?: Promise<{
    success?: string;
    redirect?: string;
    forced?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = resolvedSearchParams?.success === 'password-set'
    ? 'Password has been set. You can now sign in.'
    : resolvedSearchParams?.success === 'password-reset'
      ? 'Parola a fost resetata. Te poti autentifica.'
      : undefined;
  const redirectPath = typeof resolvedSearchParams?.redirect === 'string'
    ? resolvedSearchParams.redirect
    : undefined;
  const forcedLogout = resolvedSearchParams?.forced === '1';
  return <LoginForm successMessage={successMessage} redirectPath={redirectPath} forcedLogout={forcedLogout} />;
}
