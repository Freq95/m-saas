import LoginForm from './LoginForm';

type LoginPageProps = {
  searchParams?: {
    success?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const successMessage = searchParams?.success === 'password-set' ? 'Password has been set. You can now sign in.' : undefined;
  return <LoginForm successMessage={successMessage} />;
}
