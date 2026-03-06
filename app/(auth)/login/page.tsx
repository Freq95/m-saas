import LoginForm from './LoginForm';

type LoginPageProps = {
  searchParams?: Promise<{
    success?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const successMessage = resolvedSearchParams?.success === 'password-set'
    ? 'Password has been set. You can now sign in.'
    : resolvedSearchParams?.success === 'password-reset'
      ? 'Parola a fost resetata. Te poti autentifica.'
      : undefined;
  return <LoginForm successMessage={successMessage} />;
}
